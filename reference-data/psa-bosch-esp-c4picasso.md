# PSA Bosch ESP — Citroën C4 Grand Picasso, Bosch `0265244185`

Decoded from an Autel ↔ ABS bench capture (2026‑09‑07), BRAXON board sniffing.
Capture: `%APPDATA%\braxon\bus-captures\dtc-bus-both-0265244185-2026-09-07T14-10-59-222Z.log`
Decoder: `scripts/decode-isotp-capture.mjs --req 0x6AD --resp 0x68D`.

## Transport — standard ISO‑TP (NOT VW TP2.0)

- **ISO 15765‑2** on CAN, request `0x6AD` → response `0x68D` (offset req = resp
  + 0x20, same spacing as Renault but a different base).
- Single frames + first/consecutive + flow control — BRAXON's existing
  `isoTpRequest` / the **UDS protocol tab** already speak this. No new transport.
- Session: **`10 03`** → `50 03 00 C8 00 14` (extended; P2 0xC8 = 200 ms, P2* 0x14).
  `openUdsSession` tries `C0 → 03 → 01`, so `10 03` is reached.
- Keep‑alive: `3E 00` → `7E 00`.

## Services seen
`10` session · `14` ClearDiagnosticInformation · `19` ReadDTCInformation ·
`22` ReadDataByIdentifier · `31` RoutineControl · `3E` TesterPresent.
**No `27` SecurityAccess. No `2F`/`30` IO‑control.**

## DTC read — `19 02 09`

Status mask **0x09** (testFailed + confirmed). Response `59 02 FB {DTC[3]
status}…` — 3‑byte DTC + 1 status byte per record (BRAXON's `parseUDSPayload`
already parses this shape). Wire `(hi<<8)|lo` = the SAE‑packed code, matches
`EcuDtc` C/U encoding.

This unit (on the bench, no car bus): mostly `U11xx / U12xx / U15xx`
(comms/network — bench artefacts), plus **`C1391`** (`53 91` — PSA
brake‑pressure‑sensor plausibility) and `C1560` (`55 60`). Status `0x2B` /
`0x23` = failed + confirmed. Clear = `14 FF FF FF` → `7F 14 78` ×~9 → `54`.

## Live data — `22 D4 xx`

The PSA "D4" measuring‑parameter block. DIDs seen: `D4 00`–`D4 72` (not
contiguous). Mostly 1‑byte; 2‑byte on `D4 00`–`D4 04` (FF FF = invalid at rest),
`D4 12` (`0F FF`), `D4 2F` (`0F A0` = 4000), `D4 5A` (`08 11`), `D4 1F`. Read via
the Live Data panel: service `22`, DID `D4xx`.

`22 F0 FE` = PSA ECU identification. `22 21 00` / `22 21 01` = status words.
`22 D4 26` = a config byte (`01`).

## Routine — `31 01 DF 16 11 00` (the Autel "motor test")

User confirms this was the Autel's **motor test**. Captured running **twice**,
byte-identical, ~1 s each (at +85.7 s and +90.6 s):
`31 01 DF 16 11 00` → `71 01 DF16 01`; poll `31 03 DF 16` (requestRoutineResults)
→ `71 03 DF16 01` (running) … `71 03 DF16 02` (complete). **No security access.**
During each run the broadcast frame `0x3CD` bytes 2-3 flip `FF FF → 00 00`
(something energised). No `2F`/`30` IO-control anywhere — the "two motor tests"
are the same routine invoked twice. Diagbox cross-check still wanted to name it.

## Using this unit in BRAXON today

The **UDS tab** already handles it. In ⚙ Setup:
- Protocol **UDS**
- ECU `6AD`, **resp `68D`** (must be set explicitly — BRAXON would otherwise
  guess `6CD` from `6AD + 0x20`)
- Connect (session `10 03`), Scan DTCs.

Caveat: BRAXON's UDS scan sends `19 02 3B`; this ECU answered `19 02 09` for the
Autel. `0x3B` is a broader mask and usually still answers — if the scan comes
back empty, the fix is to try `19 02 09` / `19 02 FF`.

Then **Save for this reference** (`0265244185`) so it preloads next time.

## Added to BRAXON (2026-09-08)

- **`EcuAbsRef`** row for `0265244185` -> `6AD` / `68D` / UDS / family "Bosch 8.x".
  Pick that reference in Diagnostics and protocol + addressing preload.
- **`EcuDtc` `PSA_ABS`** (4 -> 14 rows): `C1391` pressure sensor, `C1301`/`C1302`
  pedal-coherence / circuit, `C1560` internal, and the `U11xx/U12xx/U15xx`
  network codes flagged as bench artefacts. Keyed by SAE-packed `(hi<<8)|lo`.
- **`builtinActuators.ts`** `'Bosch 8.x'`: `31 01 DF 16 11 00` / `31 03 DF 16`
  as Active Tests entries (labelled unverified).
- **UDS DTC scan is now multi-mask** - `startScan` fires `19 02 3B / FF / 09 / 08`
  and `finalizeScan` prefers any positive `59 02` over an NRC. So this PSA unit
  (needs mask `09`) scans through the normal **UDS** tab with no extra steps.

Still TODO: confirm what `DF16` does (Diagbox); label the `D4xx` live-data DIDs.
