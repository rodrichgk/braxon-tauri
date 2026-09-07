# Non-Renault ABS/ESP brake-pressure-sensor DTCs & calibration — by brand

Web research 2026-09-06, for the non-Renault Bosch 8.1 / ATE MK60-MK100 units the shop
gets pressure-sensor comebacks on. **[DOC]** = OEM manual / reputable reman page;
**[FORUM]** = forum / tool-DB. No brand publishes a raw UDS `31` routine ID for the
offset — all are named "service functions" in the OEM tool; bytes must be sniffed.

## DTC dictionary

### GM / Opel / Vauxhall / Chevrolet / Saab
| Code | Meaning | Class | Conf |
|---|---|---|---|
| C0131-00 | ABS pressure sensor **circuit** (classic: 5 V pin / shipping plug in BPMV) | circuit | DOC |
| C0131-5A | pressure doesn't track brake-applied CAN msg — plausibility | implausible | DOC |
| C0131-4B | **"Calibration Not Learned"** — baseline never taught | calibration | DOC |
| C0131-3A | **"Incorrect Component Installed"** — calib outside range after EBCM swap | calibration | DOC |
| C0134 | brake pressure sensor **faulty offset value** | offset | FORUM |
| C056D | EBCM **internal hardware** (not the sensor) | internal | DOC |
| C0560 | system config / calibration-not-programmed after swap | coding | FORUM |
| C0161 | brake-switch vs pressure not plausible; clears only after BPP calibration | implausible | DOC |

### PSA — Peugeot / Citroën / DS
| Code | Meaning | Class | Conf |
|---|---|---|---|
| C1301 (= raw **5301**) | brake-switch / pressure **coherence** check — NOT a circuit code | implausible | DOC |
| C1302 (= raw **5302**) | pressure-sensor circuit: open / short-to-+ / short-to-earth | circuit | DOC |
| C1335 / C1391 | ESP internal / hydraulic plausibility, seen alongside C1301 on swaps | internal | FORUM |

### Ford / Volvo / Mazda
| Code | Meaning | Class | Conf |
|---|---|---|---|
| C1288 | pressure transducer main/primary **circuit** failure (transducer integral to HCU) | circuit | DOC |
| C1440 | transducer signal **disagrees with stop-lamp switch** — sets every ignition cycle | implausible | DOC |
| C1A99 (e.g. :17-8B) | Ford pressure sensor — circuit voltage above threshold / component internal | circuit | DOC |
| C1028 | master-cylinder pressure sensor circuit (Bosch ESP; also Suzuki) — diag references calibration | circuit | DOC |

### Nissan / Infiniti
| Code | Meaning | Class | Conf |
|---|---|---|---|
| C1142 | master-cylinder **pressure sensor circuit** — sensor internal to ABS actuator → replace actuator; **no offset/learn exists** | circuit | DOC |
| C1122 / C1124 | **NOT pressure** — inlet solenoid-valve monitoring (FR-RH / RR-LH) → driver-ASIC bucket | valve driver | DOC |
| C1131 / C1132 | **NOT pressure** — ABS↔ECM engine-signal CAN plausibility (sets on a bench with no ECM) | CAN plausibility | DOC |
| C1143 / C1144 | steering-angle sensor (full-swap relevant) | SAS | DOC |
| C1145 / C1146 | yaw / side-G / decel-G sensor (full-swap relevant) | yaw/G | DOC |
| ⚠ | **Ford C1142 = front WSS tone-ring tooth missing** — same number, different fault | — | DOC |

### Mercedes-Benz
| Code | Meaning | Class | Conf |
|---|---|---|---|
| C1140 | ESP brake pressure sensor **(electrical)** — often N47-5 connector pins 18/19/20 corroded | circuit | DOC |
| C1141 | ESP brake-pressure-sensor signal fault | circuit/signal | FORUM |
| C1145 | **"Zero Point Offset Error of B34"** — the offset/calibration fault; do NOT replace ESP ECU, run Xentry on B34/2 | offset | DOC |
| 4580 (old numeric) | traction hydraulic unit — loose contact in voltage supply | supply | FORUM |
| 4574 (old numeric) | not found in any source — expect it maps to C1140/C1145 on a modern read | unknown | FORUM |

### BMW / MINI (DSC)
| Code | Meaning | Class | Conf |
|---|---|---|---|
| 5E20 | hydraulic pressure sensor, **internal** to the DSC pump — not separately available | internal | DOC/FORUM |
| 6E32 | **"internal pressure sensor Mc1 offset error"** — MC pressure sensor 1 zero out of range | offset | FORUM |
| 5DF0 / 005DF0 | DSC internal / self-test area, reported with pressure faults | internal | FORUM |

### Honda / Acura (VSA)
| Code | Meaning | Class | Conf |
|---|---|---|---|
| 66-1 (66-11/66-13) | internal brake-fluid pressure sensor in the VSA modulator — not serviceable | internal | DOC |
| 84-1 | VSA pressure-sensor **neutral-position memorisation lost** — sensor OK, zero not stored | offset | DOC |
| C0131 | Honda also uses SAE-style C0131 = brake-fluid pressure sensor circuit | circuit | DOC |

### VAG cross-ref (Bosch 8.0/8.1, ATE MK60/MK100)
| Code | Meaning | Class | Conf |
|---|---|---|---|
| 01435 / 1435 | brake pressure sensor 1 (G201) implausible — set by an electrical fault **AND** by "basic setting not carried out" | both | DOC |
| 00778 | steering angle sensor (G85) — no basic setting / out of tolerance | calibration | DOC |

## Calibration procedure — bench-doable?

| Brand | Tool + path | Bench-doable (no vehicle)? |
|---|---|---|
| **GM / Opel** | GDS2 (Tech2 ≤2013) → EBCM → Configuration/Reset Functions → **"Brake Pressure Sensor Calibration"**. Ignition ON, engine OFF, stationary, pedal released, ~13.5 V. Required after BPMV or EBCM replacement | **YES — cleanly.** No motion / drivetrain / engine-run / vacuum gate, no road test. Rig needs stable ≥12 V + no blocking WSS-circuit DTC. **Highest-value target.** |
| **Honda** | HDS → ABS/VSA → Adjustment → **"All Sensors"** neutral-position memorisation (includes brake-fluid pressure sensor zero + SAS + yaw + lat-G). Engine OFF, level, wheels straight, pedal untouched, gear P | **Bench-plausible.** Needs a level rig + true wheels-straight reference for the SAS part |
| **Nissan** | CONSULT → ABS → Work Support: "ST ANGLE SENSOR ADJUSTMENT", "DECEL G SEN CALIBRATION". **No pressure-sensor item** | pressure: **N/A** (no routine). SAS/decel-G need a short "straight then stop" verify drive |
| **Ford / Volvo** | FDRS → Chassis → Braking → **"ABS Service Bleed"**, "Valve Actuation". Module setup = PMI / As-Built by VIN. **No standalone pressure-sensor learn** | **Mostly NO.** Fix = new HCU + bleed (needs fluid + pedal). C1440 needs a plausible stop-lamp CAN msg + real pressure change to clear. As-Built config can be offline (FORScan) |
| **PSA** | Diagbox → ABS-VDC → Réglages/Configuration → bleed + steering-angle paramétrage. **No pressure offset routine** | **Partial.** C1301 coherence needs a real pedal-switch signal + genuine pressure change — a dry static bench can't satisfy it |
| **BMW** | ISTA → Calculate Test Plan → schedules "DSC pump/pressure-sensor calibration" + "activated brake bleeding" | **Limited.** Routines are hydraulic — need a bled, air-free, pressurised circuit. Coding can run offline |
| **Mercedes** | XENTRY → ESP ECU → run on B34/2. After ECU replacement: **mandatory ONLINE SCN coding** (VIN/variant s/w from MB servers) | **NO on a plain bench.** Offset adaptation is Xentry-only; full swap needs online SCN |
| **VAG / ATE MK100** | VCDS/ODIS: SecAccess **40168** → Basic Settings **Grp 066** (G201). ATE MK100: login **20103** → **IDE03650** pressure cal, **IDE03652** valve cal, **IDE05146** ESP sensor block; module 44 login **28183** → **IDE05744** steering init | Grp 066 alone: yes-ish (stationary, wants "engine running" + live plausibility → bench needs 4×WSS=0 + fake RPM frame + ~12.5 V). ESP System Function Test needs a road drive → NOT bench |

## After a FULL swap (ECU + block) — extras

Block-only swap (ECU kept) → pressure offset + ABS bleed only; SAS/yaw untouched.
Full ECU+block swap → add SAS + yaw/accel calibration + variant/VIN coding:
- **GM**: SAS + accel learns are stationary scan-tool functions (bench-OK); EBCM flash needs GM online (SPS2).
- **PSA**: SAS paramétrage (bench-OK with a jig); ESP télécodage doable with offline Diagbox.
- **Ford**: SAS bench-OK; IVD/yaw init may need a short drive; As-Built offline OK.
- **Nissan**: SAS + decel-G mandatory after actuator replacement; need a "straight then stop" verify.
- **Mercedes**: everything Xentry + mandatory online SCN — worst case.
- **BMW**: coding offline-OK, but swap forces activated brake bleeding (bled circuit).
- **Honda**: "All Sensors" routine bench-OK; 2014+ modulators need VIN programming (dealer/J2534).
