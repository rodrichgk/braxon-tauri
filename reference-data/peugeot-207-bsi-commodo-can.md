# Peugeot 207 — BSI + commodo CAN capture decode

Source: `Peugeot 207 CAN BSI Log_1.txt` (Kvaser Memorator ASCII log, 2026-09-18),
captured with an Autel doing BSI diag (read codes / erase codes / active
tests) then commodo diag / live data while the stalk was moved by hand.
1750 frames total, four CAN IDs only — this is a pure diagnostic-session
capture (KWP2000-over-CAN, single-byte local IDs), not raw broadcast/body-CAN
traffic. No periodic light/indicator broadcast frames appear anywhere in this
log — everything below is diagnostic request/response.

## Bus pairs

| Request ID | Response ID | Module |
| --- | --- | --- |
| 0x752 | 0x652 | BSI |
| 0x742 | 0x642 | Commodo (steering-column stalk module) |

Both follow the same `req = resp + 0x100` PSA convention already seen
elsewhere in this codebase's reference data (MK61, Ford/ATE use their own
offsets — this is a third, BSI-specific one).

## BSI diagnostic session (0x752 → 0x652)

KWP2000-style, single-byte "local identifiers", not 2-byte UDS DIDs.

| SID | Name | Example |
| --- | --- | --- |
| `10` | StartDiagnosticSession | `10 C0` → `50 C0` (session 0xC0, extended/manufacturer) |
| `3E` | TesterPresent | `3E` → `7E`, every ~1.9s idle keep-alive |
| `21` | ReadDataByLocalIdentifier | `21 80` → ECU ID block; `21 C0` → a *different* static block on the BSI (local IDs are per-ECU, so 0xC0 means something else again on the commodo — see below) |
| `17` | ReadStatusOfDiagnosticTroubleCodes | `17 FF 00` (group "all") → `57 <len> <DTC catalog>`, ~50 bytes, same catalog contents on every read in this capture (expected — this service returns every monitored DTC's status, not just active ones; distinguishing "codes present" from "codes clear" needs parsing the per-DTC status byte, not attempted here) |
| `14` | ClearDiagnosticInformation | `14 FF 00` → `54 FF 00`, at t=31.36s |
| `30` | InputOutputControlByLocalIdentifier | see Active test below |

### Active test — local ID 0xC5

```
06 30 C5 00 <n> 06 01   -> 03 70 C5 01     start (n = 09, then 08, then 05 on
                                            each of 3 separate activations —
                                            purpose of n not confirmed, maybe
                                            a countdown/duration)
03 30 C5 01             -> 03 70 C5 01     keep-alive, ~230-250ms period
03 30 C5 01             -> 03 70 C5 02     status flips to 02 right before
                                            the next full "06 30" re-arm
03 30 C5 11             -> 03 70 C5 11     stop
```

Activated at t=88.09s (33s), t=111.05s (10s), t=145.26s (6s).

**Only one local ID (0xC5) ever appears** in this capture's IOControl
traffic — never a second one. The technician's own account was four active
tests (high beam, low beam, indicator left, indicator right); the bus only
shows one identifier exercised three times. Either the tool's other three
menu selections never reached the bus in this capture window, or they were
re-runs of the same test. Which physical output 0xC5 drives isn't
recoverable from this capture alone — needs either the BSI's local-ID
reference table, or a re-capture where each test is confirmed by eye against
the timestamp.

## Commodo live data (0x742 → 0x642, local ID 0xC0)

Same `21`/`3E` session mechanics as the BSI, but local ID `0xC0` here reads
live stalk-switch state, not a static block: `21 C0` → `61 C0 [B0] [B1] [B2] [B3]`,
polled every ~120-140ms (Autel's "Live Data" refresh rate).

Every distinct value observed, tallied across the whole capture:

| B0 | B1 | B2 | Count | Windows (s) | Reading |
| --- | --- | --- | --- | --- | --- |
| 20 | 00 | 02 | 249 | idle | Rest — bit1 (0x02) is a constant flag present in *every* non-zero value below too |
| 20 | 00 | 82 | 103 | 235.7-240.3, 245.3-250.2, 259.8-261.6, 265.0-266.3 | Indicator, direction A (bit7 of B2) |
| 20 | 00 | 42 | 55 | 251.4-254.6, 256.5-258.1, 263.3-264.8 | Indicator, direction B (bit6 of B2) |
| 20 | 08 | 02 | 10 | 267.98-268.5, 269.24 (single-frame blip) | Wiper stalk position 1 (bit3 of B1) |
| 20 | 80 | 02 | 12 | 269.73-271.1 | Wiper stalk position 2 (bit7 of B1) |
| 20 | 40 | 02 | 11 | 271.26-272.36 | Wiper stalk position 3 (bit6 of B1) |
| 20 | 10 | 02 | 3 | 274.7-275.0 | Wiper stalk position 4 (bit4 of B1) |
| 40 | 00 | 08 | 19 | 277.19-277.56, 281.76-284.1, 285.03-285.5 | Second wiper axis, position A (B0 bit6, paired with B2=08 instead of the usual 02) |
| 80 | 00 | 10 | 12 | 283.49-284.9 | Second wiper axis, position B (B0 bit7, paired with B2=10) |
| 20 | 00 | 04 | 18 | 279.9-280.9, 285.65-285.9 | Third distinct state (bit2 of B2) — rear wiper/wash candidate |

Structurally clean: every field is one-hot (mutually exclusive values, never
two bits set outside the constant 0x02), and B0/B1 never both leave their
baseline at the same time in this capture — consistent with a stalk that has
two independent axes (rotate-ring speed selector + push/pull for
single-wipe/rear), each read out through a different byte.

**Not confirmed from this capture alone:** which of A/B is left vs. right
indicator, and which physical stalk detent each wiper value corresponds to
(OFF/INT/LO/HI, front vs. rear, single-wipe vs. continuous). The BSI active
test (indicators) ran *before* this commodo live-data section in the
capture, so the two can't be cross-correlated by time either — they're
sequential sessions, not simultaneous.

## Follow-ups if this gets used for real (e.g. feeding a Cluster Bench profile)

- This BSI reports light/switch state only on request (diagnostic polling),
  not via periodic broadcast on this bus — a real instrument cluster on this
  platform is presumably fed a different way (direct-wired, or a broadcast
  ID outside what got captured on the OBD connector here). A `ClusterCanProfile`
  built from *this* capture would be diagnostic-polling shaped
  (`21 C0` request/response), not the periodic-broadcast shape
  `docs/DASHBOARD-BENCH.md` currently assumes for the "virtual BSI" — worth
  keeping in mind if a real PSA vehicle profile gets built later.
- A second, annotated capture (technician calling out "left indicator now",
  "wiper INT now" etc. against the clock) would resolve every remaining
  ambiguity above in one pass.
