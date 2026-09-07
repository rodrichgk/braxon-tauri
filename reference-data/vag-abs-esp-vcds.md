# VAG ABS/ESP — VCDS label-file extract (MK20 / MK25 / MK60 / Bosch 5.7)

Parsed from the readable `.LBL` files in `C:\Ross-Tech\VCDS\Labels\` (VCDS 26.3),
34 ABS/ESP label files. These are the K-line + early-CAN VAG brake ECUs — the same
hardware a mid-2000s VW/Audi "Bosch 8.1" unit runs. The newer MK60EC1 / MK100 labels
are encrypted `.clb` and not in here; get those from the Ross-Tech Wiki or a live
VCDS session.

Nothing here is byte-level — VCDS labels only map *group number → name → spec window*.
The wire sequence for "Basic Setting Group NN" over VAG KWP2000 still has to be
sniffed from a real session.

**DTC text is NOT in the `.LBL` files** — it lives in `Codes.dat`, which is
Ross-Tech-encrypted. The address-03 codes Ross-Tech documents on wiki.ross-tech.com
(48 VAG ABS/ESP/EPB + ~30 cross-brand) are loaded into the `abs_tester` DB as
`EcuDtc` rows with `ecu_file = 'VAG_ABS'` / `'GM_ABS'` / `'PSA_ABS'` / `'FORD_ABS'` /
`'NISSAN_ABS'` / `'MB_ABS'` / `'BMW_ABS'` / `'HONDA_ABS'` — BRAXON's `lookup_dtc`
resolves them. Full structured label dump: `vag-abs-esp-labels.json` (this folder).

## Login / security-access codes (address 03)

| Code | Meaning | Notes |
|---|---|---|
| **40168** | General Basic Setting "Enabling" | Universal MK20/MK25/MK60/Bosch-5.7. **Mandatory before any Basic Setting**, incl. steering-angle alignment. |
| 27861 | General Adaptation "Enabling" | MK25 (7H0) |
| 09355–09577 | Login/Coding-II per engine+gearbox | Bosch 5.7 only (3U0 Sharan etc.) — must recode the module afterwards |

## Basic Settings groups = the calibration / service routines

| Grp | Routine | Spec window | Seen on |
|---|---|---|---|
| 001 | Brake Pump Bleeding / Brake System Bleeding | — | all (Bosch 5.7: G001 = Steering Angle Sensor Alignment instead) |
| 002 | Brake System Bleeding | — | Bosch 5.7 (Audi) |
| 003 | Activate ESP System / Function Test | — | Bosch 5.7 (Audi) |
| 010 | Brake System Bleeding | — | 6Q0 (Polo/Fabia) |
| 040 | Deactivation of Longitudinal Acceleration Sensor (G251) + Status | — | MK60 |
| **060** | **Adjustment of Steering Angle Sensor (G85)** — Adjustment / Status / live value | ±4.5° (MK20/60), ±2.0° (MK25) when straight | MK20/25/60 |
| 061 | Adjustment of Rotation Rate + Lateral + Longit. Acc. (G200/G202/G251) — combined | Status = OK | 5N0 (Tiguan MK60EC1-ish) |
| **063** | **Adjustment of Lateral Acceleration Sensor (G200)** | ±1.5 m/s² (±2.5 on MK20) | MK25/60 |
| **066** | **Adjustment of Brake Pressure Sensor (G201)** — Adjustment / Status / live value | **±7.0 bar** (±3.0 on 5N0) | MK20/25/60 |
| **069** | **Adjustment of Longitudinal Acceleration Sensor (G251)** | ±1.5 m/s² | MK25/60 |
| 093 | Initiation of ESP Driving Test | — (needs a road test, stores 01486) | MK60 |

**Pressure-sensor recipe (verified from `1C0-907-37x-ESP-F.lbl` / `8N0-907-379-MK60-F.lbl`):**
address 03 → Login `40168` → Basic Settings Group `066` → run "Adjustment" → watch
"Status" and the live G201 value → pass = value within **±7.0 bar**. Some MK60 blocks
have TWO sensors: G201 (Sensor 1) + G214 (Sensor 2), both ±7 bar.

## Measuring value blocks (live data)

| Grp | Contents |
|---|---|
| 001 / 002 | Wheel speeds G47 (FL) / G45 (FR) / G46 (RL) / G44 (RR), 0–255 km/h (255 = standing on MK20; 1.0 km/h standing on Bosch 5.7) |
| 004 | Steering Angle (G85) ±4.5° · Lateral Accel ±1.5 m/s² · Rotation Rate ±2.5°/s — together |
| 005 | Brake Pressure sensor (G201) ±7 bar [+ G214 on MK60-A]. Bosch 5.7 display range −41…+292 bar; **40 bar = short-to-ground, 290 bar = short-to-plus** |
| 006 | Longitudinal Acceleration (G251) ±1.5 m/s² |
| 009 | (5N0) Vacuum reservoir pressure · Brake pressure G201 ±3 bar |
| 011–014 | Encoder / tone-ring errors per wheel (G47/G45/G46/G44) — min / max / average runout |
| 125 / 225 | CAN databus comms · Steering-angle status (Initialised / Not Initialised / Implausible) |
| 003 | Brake-light switch (F) · Brake system / ABS / ASR-ESP warning lamps |

## Post-swap checklist (from the labels)

- **Hydraulic block only:** Group 066 (pressure sensor) + Group 001 bleed.
- **Full unit (ECU + block):** add Group 060 (steering angle), Group 063 (lateral),
  Group 069 (longitudinal) — or Group 061 combined on newer — then Group 093 ESP
  driving test (road), and recode the module (Coding + Login/Coding-II on Bosch 5.7).

Full parsed dump: scratchpad `lbl_records.json` (1710 records), `lbl_summary.txt`.

---

# Ross-Tech Wiki (wiki.ross-tech.com) — precise per-generation data

Pulled 2026-09-06 via `?action=raw`. **[WIKI]** verbatim; **[FORUM]** hearsay.

## Security Access (address 03)
- **`40168`** = "Basic Setting Enabling" — every 03 page MK20→MK100. Entered via
  `[Coding-II - 11]` on pre-UDS, `[Security Access - 16]` on later. **[WIKI]**
- **`50403`** = "Adaptation Enabling" (needed to write 03 adaptation channels) — Tiguan 5N. **[WIKI]**
- Bosch 8.0 B8 Audi (A4 8K / A5 8T): code auto-appears in a VCDS pop-up on connect. **[WIKI]**
- `20103 / 28183 / 19249 / 40128` — **NOT wiki-verified for address 03**; 19249/28183
  are actually 44-Steering-Assist codes. (The cross-brand agent's "ATE MK100 login
  20103 → IDE03650" is forum-level, treat as unconfirmed.) **[FORUM]**

## Basic-Setting group → generation → pass window (KWP-2000)
| Sensor | Grp | Verify MVB | Window | Generation |
|---|---|---|---|---|
| Steering angle G85 | 060 | 004.1 | ±4.5° | MK20 Golf1J, MK60 Golf1J / TT8N |
| Steering angle G85 | 060 | 004.1 | ±1.5° | MK25, MK60 Golf1K, **all MK60EC1** |
| Steering angle G85 | 060 | 007.1 **in addr 44** | ±1.5° | **MK70** (done in Steering Assist, not 03) |
| Steering angle G85 | **001** | 005.1 | 0° ±5° | **Bosch 8.0** (A4 8E, A6 4F) |
| Lateral accel G200 | 063 | 004.2 | ±1.5 m/s² | most (±0.5 on MK20 A3 8L) |
| **Brake pressure G201** | **066** | **005.1** | **pre ±7 → spec ±7 bar** | MK20 Golf1J, MK20 A3 8L (+ G214 in 005.2), MK60 Golf1J / TT8N |
| **Brake pressure G201** | **066** | **005.1** | **pre ±8.0 → post ±3.8 bar** | **MK60 Golf1K, all MK60EC1** |
| Yaw / rotation G202 | 068 | 004.3 | ±1.5°/s | MK60EC1 Passat 3C |
| Longitudinal G251 | 069 | 006.1 | ±1.5 m/s² | most (±0.5 on MK20 A3 8L; pre-check 006.4) |
| Combined G200/G202/G251 | 061 | 004.2/3/4 | ±1.5 | MK60EC1 Tiguan 5N / Passat 3C |
| ESP-Sensor Unit G419 | 069 | 010.1/2 | ±1.25 m/s² | Bosch 8.0 A4 8E, MY2006+ w/ Multitronic |
| Hydraulic **Intake Valves** | **025** | live "Calibration Input Values" — press pedal to hold the bracketed target `[116/129]` until `[000/000]`, repeat to "Calibrated" | **engine running**, pump **< 27 °C**, system **bled** — only if **DTC 00003** after fitting old HCU to new module | MK60EC1 |
| Hydraulic **Disconnecting Valves** | **026** | "Calibration MCI Values" `MCI pri [096/103]` → hold → repeat | run **after** 025; may need an ign-off/key-out cycle before 026 appears | MK60EC1 |
| TPMS (indirect) reset | 042 | — | ign ON, hold TPMS + ASR/ESP buttons 2 s | MK60 / MK60EC1 / MK70 |

Success field on completion: usually MVB "field 2 = OK" (field 1 on MK20 A3 8L;
field 3 on Tiguan 5N G201).

## UDS named routines (MK100 / MQB — Golf VII 5G, Q3 8U) **[WIKI]**
| Routine | Meaning | Preconditions | Result text |
|---|---|---|---|
| **`IDE03650`** (`IDE03650-ENG114972`) | Basic setting for **brake pressure sensor** (G201) | ≥ 12.0 V, brake pedal at rest, 40168 first | "Finished Correctly" / "Not Running" |
| **`IDE05146`** (`-ENG114972`) | Basic setting of **ESP sensor unit** — G200 + G251 in one | ≥ 12.0 V, level ground, 40168 | "Finished Correctly" / "Not Running" |
| `IDE04443-MAS00815` | Adv. meas. "steering angle sensor" — turn wheel to ±1.5° before the basic setting | — | live |
| `MAS00815` "Steering angle sensor" | G85 basic setting (TRW ESC-EBC460i); then adapt limit stops in addr 44 or DTC 02546 | ±1.5° at wheel, 40168 | "Finished Correctly" |
| `IDE05744` | brake-pressure basic setting on some MQB (OBDeleven label) — **not on Ross-Tech wiki**, Ross-Tech uses IDE03650 | — | — |
- On Golf VII 5G / Q3 8U the **G85 calibration is in address 44**, not 03. Same for
  Bosch 8.0 B8 Audi → address 16.

## G201 pressure-sensor calibration — procedure (wiki §8)
Required after J104 module replacement/coding, after HCU/N55 replacement, or whenever
**01435** (any variant) or **00003** is stored. Preconditions: ignition ON,
**≥ 12.0 V**, vehicle stationary, **brake pedal at rest**. **Engine running NOT
required** for G201 (only for the valve basic settings 025/026). **No road test.**
1. `[03] → [Meas. Blocks - 08] → Group 005` field 1 — must be within ±8 bar (MK60/EC1)
   or ±7 bar (older). Wildly outside → sensor/wiring fault first.
2. `[Security Access - 16]` (older `[Coding-II - 11]`) → `40168` → `[Do it!]`.
3. `[Basic Settings - 04] → Group 066 → [Go!]`.
4. Status field → "OK".
5. Re-read Group 005 field 1 → now within **±3.8 bar** (MK60/EC1) / "in norm" (older).
6. `[Close Controller - 06]`.
UDS: `[Security Access - 16] → 40168 → [Basic Settings] → IDE03650 → [Go]` → "Finished
Correctly". The `31 01 00 02` Bosch-8.0 routine from the bench notes is **not on the
Ross-Tech wiki** — its Bosch 8.0 path is Group 001 (G85) + Group 069 (G419/G251);
there is **no G201 basic setting on the Bosch 8.0 VAG pages** (matches "Bosch 8.0
doesn't have the pressure sensor").

## MK60 hydraulic-part swap — the official way (from the 01435 wiki page) **[WIKI]**
RoW MK60 HCU repair-kit TPIs: VW **2024465 / 2025290**, Audi **2025633**, Seat
**2024720**, Skoda **2025844 / 2025663**. Kit **P/N `1K0-698-517-B`** replaces the
**HCU (N55 pump + G201 sensor) separately from the ECU module** — then bleed the pump
and run the G201 Basic Setting (Group 066). This is exactly the "swap only the
hydraulic part" path, factory-sanctioned, for MK60.

## ESP System Function Test (clears 01486) — road test, NOT bench-doable
01486 must be the only 03 DTC, 44 fault-free, engine running, stationary start.
1. Press brake firmly to **just above ~30 bar** — lamp check confirms G201:
   Bosch → ESP lamp (K155) OFF, ABS lamp (K47) ON; Conti/Teves → the opposite.
2. Drive straight ≈ 20 km/h.
3. Turn wheel 90–180° and hold, yaw ≈ 10°/s, radius 10–12 m, 15–30 km/h.
4. Success = remaining warning lamp(s) go OFF. Can't be cancelled once started, ~50 s
   limit → else 01487 "Timed Out", repeat.

## Wheel-speed sensor letters
G47 = front left · G45 = front right · G46 = rear left · G44 = rear right.
Inlet solenoid N88, outlet solenoid N89 (Bosch 5.x / MK20).
ESP valves: N225/N226 switch, N227/N228 high-pressure switch; ESP pump V156 / motor J156.
