# Getting DTC text into BRAXON — the pipeline

Four streams feed `EcuDtc` (and the on-the-fly decoder). None of them touch
Ross-Tech's encrypted `Codes.dat` / `.CLB` — they consume tool *output* and
open sources.

## 1. Generic SAE J2012 / ISO 14229 — computed, no lookup

`src/lib/dtcGeneric.ts` — `describeDtc(high, low, ftb?)`:
- code letters (`C0044`) = pure bit math on the first 2 DTC bytes.
- `GENERIC_DTC` = the standardised C0xxx chassis meanings (wheel-speed sensors,
  pump, solenoids, pressure sensor, steering angle, yaw/lateral/longitudinal
  accel, brake switch…) + a few widely-shared C1xxx.
- `FAILURE_TYPE` = the ISO 14229-1 Annex D failure-type byte (`-11` short-to-gnd,
  `-13` open, `-3A` incorrect component, `-46/-4B` calibration not learned,
  `-63/-64` plausibility, `-2F` erratic, …).

Wired into `Diagnostics.tsx` `decodeDTC` / `parseUDSPayload` — every code the
ABS reports now gets a baseline string ("`C0044 — Brake pressure / temperature
sensor circuit · signal invalid`") even with zero DB coverage. A `lookup_dtc`
hit from `EcuDtc` still overrides it (`enrichFromDb`).

To extend: add rows to `GENERIC_DTC` (standard codes only) — manufacturer
C1xxx/C2xxx/C3xxx belong in `EcuDtc`, not here.

## 2. VCDS Auto-Scan import — for the units you actually see

Every VCDS Auto-Scan / fault read writes a plain-text `.txt` to
`C:\Ross-Tech\VCDS\Scans\`. Those carry `code + component + failure text` in the
clear. Keep them all; then:

```
node scripts/import-vcds-scans.mjs                       # dry run, default folder
node scripts/import-vcds-scans.mjs <folder> --write      # commit codes not already known
node scripts/import-vcds-scans.mjs <folder> --write --overwrite   # also refresh existing text
```

Parses the `Address 03` (ABS) and `Address 53` (EPB) blocks, upserts each fault
under `ecu_file = 'VAG_ABS'`, `dtc_raw` = the VAG 5-digit as an int (matches the
wiki import), `description` = component + failure text (+ `[SAE Cxxxx]` when
VCDS shows one). `--write` alone never overwrites the curated wiki rows.

Same idea for other tools: whatever scanner reads a unit (Autel, Launch,
Diagbox, FDRS) prints the text on screen → transcribe it into `EcuDtc` against
the raw value, `ecu_file` per supplier-gen (`BOSCH_ABS_9x`, `ATE_MK60`, …).

## 3. Ross-Tech Wiki scrape — the full free VAG 5-digit set

`scripts/scrape-rosstech-wiki.mjs` pulls the wiki's `Category:Fault_Codes`
(1000 pages) via the MediaWiki API (~40 s, polite rate limit) and parses the
regular `== code - title ==` / `=== variant ===` / `==== Possible
Causes/Solutions/Symptoms/Special Notes ====` structure.

```
node scripts/scrape-rosstech-wiki.mjs --dry        # parse + print, no DB
node scripts/scrape-rosstech-wiki.mjs              # scrape + upsert
node scripts/scrape-rosstech-wiki.mjs --wipe       # clear VAG_WIKI* first
```

Splits into two `ecu_file`s because the two numbering schemes overlap in 0..16383:
- **`VAG_WIKI`** (399 rows) — plain 5-digit pages (`01130`), `dtc_raw` = the
  5-digit int. KWP-era / VCDS-printout lookup.
- **`VAG_WIKI_UDS`** (597 rows) — `NNNNN/Pxxxx/DDDDDD` + bare `Uxxxx` pages,
  `dtc_raw` = the **SAE 2-byte value** (the 6-digit segment, or packed from the
  P/C/U code), `dtc_code` = the P/C/U string. Matches a live BRAXON `19 02`
  scan directly. Includes generic P0xxx (useful for any OBD unit).

`description` = `title — variants · Symptoms: … · Causes: … · Fix: … · Note: …`
(capped ~1 kB). OpenVAG's 995-row SQLite is a scrape of this same category —
going to the source keeps the causes/solutions/notes and our own parsing.

`resolve_dtcs` (commands.rs) ranks `ecu_file LIKE 'VAG\_WIKI%'` **last** in its
any-unit steps, so a hand-enriched `VAG_ABS` row (e.g. the MK61 `01130` ASIC
note) still wins over the generic wiki row for the same raw value.

Payoff already: `VAG_WIKI` `00150` "Plausibility Brake Booster System" carries
the exact block-swap-comeback text — *"Fault code appears after ABS controller
was replaced … Incorrect ABS controller / hydraulic unit part number
compatibility … When found in ABS ESP MK60EC1 controllers be 100% sure the
correct part number is used (ETKA)."*

## 4. Bench correlation — for the codes nobody documents

Force the fault, read the raw DTC, label it yourself:
- unplug front-left WSS → read code → that raw = "WSS FL open"; short it → "WSS FL short".
- all 4 wheels, pump motor, each solenoid, pressure sensor (unplug / out-of-range),
  brake-light switch, a CAN wire, low supply voltage.
- ~25 deliberate faults maps a hardware family's practical DTC set. Pair with
  `19 06 <DTC>` for the trigger conditions. Insert into `EcuDtc` keyed by raw value.

## On-the-wire discovery — IMPLEMENTED

`src/lib/ecuDiscovery.ts`:
- `runDiscovery(...)` — CAN-ID address sweep (unchanged): find the (sendId, recvId)
  pair by probing session control.
- `enumerateSessions(o)` — `10 xx` sweep, classify `50` open / `7F 10 22` blocked /
  `7F 10 12` absent; pulls P2/P2* timing from a UDS `50 xx`.
- `enumerateServices(o)` — poke each diagnostic SID bare; `7F sid 11` = absent,
  `7F sid 12/13/22/…` = present, `sid+0x40` = worked.
- `readAllDtcs(o)` — `19 02 FF` → `19 02 08` → `19 0A` → `18 02 FF 00` → `17 FF 00`,
  first that answers wins; raw 3-byte (or 2-byte KWP) parse + `describeDtc`.
- `sweepDids(o, ranges)` — `22 xxxx` over bounded ranges (F180-F1FF ident, 0200-02FF,
  1000-105F, 2000-20FF), keeps the `62` answers with an ASCII guess. Opt-in, ~1 min.
- `sweepRoutines(o, ranges)` — **`31 03 xxxx` ONLY** (requestRoutineResults,
  read-only). Never sends `31 01`. A `7F 31 24` (requestSequenceError) still means
  the routine exists. Opt-in.
- `probeSecurity(o)` — `27 01/03/05/…`, records the seed length; never sends a key.
- `profileEcu(o)` — runs sessions → picks best open session → services → DTCs →
  security → (opt) DID sweep → (opt) routine sweep. Returns `EcuProfile`.

UI: `src/components/EcuDeepProfile.tsx`, shown in `EcuAutoConfig` after a discovery
hit — "Enumerate" button, checkboxes for the two slow sweeps, results panel +
"Copy JSON". Nothing writes / resets / clears / starts a routine.

Next: feed a confirmed profile back into `EcuAbsRef` / `EcuActuator` (a "save
profile" button), and add input-correlation to the DID sweep (feed a known WSS Hz /
pressure and watch which DID byte tracks it → derive scaling). Open tools doing the
same technique set: CaringCaribou, SavvyCAN, udsoncan.
