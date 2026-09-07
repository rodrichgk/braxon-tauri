# VW ATE MK60EC1 — decoded from a VCDS bus capture (2026‑09‑07)

Source: `%APPDATA%\braxon\bus-captures\dtc-bus-both-10.0961-0302.3-2026-09-07T07-51-20-281Z.log`
(BRAXON board sniffing a VCDS HEX‑V2 ↔ bench ABS session). Decoder:
`scripts/decode-tp20-capture.mjs`.

## Unit

VCDS: `Address 03: ABS Brakes`, `1K0 907 379 AH`, HW `1K0 907 379 AH`,
`Component: ESP MK60EC1  H30 0107`, coding `543B4008092400FA2A1402EC901C0040300000`.
BRAXON ref `10.0961-0302.3` = the ATE internal number. `1K0` = VW PQ35
(Golf V/VI, Jetta, Passat B6, Octavia II, A3 8P, Leon 1P…).

**Not an MK61** — closely related ATE gen, different protocol/blocks.

## Transport — VW TP2.0 (pre‑UDS)

- **Channel setup**: request to CAN `0x200`, byte0 = logical address `0x03`
  (ABS), byte1 = `0xC0` (setup). Response on `0x203`, byte1 = `0xD0` (OK),
  carries the negotiated IDs.
- **Negotiated here: requests → `0x790`, responses → `0x300`** (TP2.0 assigns
  them dynamically; don't assume tester = low ID).
- **Data frame** b0 = `<op><seq>`: op `1` = data, op `2` = data + "ACK me now"
  (block boundary), op `A` = channel test / timing params (`A3` req →
  `A1 0F 8A FF <T1> FF` resp, ~1 s keep‑alive, no KWP `3E` needed), op `B` =
  ACK (low nibble = next expected seq). `seq` is a running 0..F per direction.
- **First frame** of a KWP message: b1..b2 = message length, **big‑endian, low
  12 bits** (bit 15 is a "more coming / responsePending" flag — mask `& 0x0FFF`),
  payload from b3. Continuation frames: payload from b1. Message complete at the
  declared length.
- KWP session: `10 89` → `50 89` (VW "diagnostics" session 0x89).

## DTC read — `18 02 FF 00`

Response `58 <count> { hi lo status }×count`.
**`(hi<<8)|lo` = the VAG 5‑digit fault number directly** — no conversion; it
matches `EcuDtc` `ecu_file='VAG_WIKI'` (keyed by 5‑digit int) as‑is. *Not* the
SAE 2‑byte value → `VAG_WIKI_UDS` would be wrong for a TP2.0 `18` response.

Status byte = `0x60 | elaboration` (bit7 = currently present). VCDS's "‑0NN"
suffix = `(status & 0x7F) - 0x60`: `0x64`→‑004, `0x68`→‑008, `0x6E`→‑014.

This unit: `16352‑014` Control Module Electrical Error (Defective) · `01309‑004`
J500 no comms · `01423‑008` G200 lateral‑accel implausible · `00778‑004` G85
steering‑angle no comms · `01312‑004` powertrain data bus no comms.
4 of 5 are bench artefacts (no rest‑of‑car bus). **`16352 Defective` is the real
internal‑ECU fault** — the reason it's on the bench.

Per‑DTC freeze frame: `12 00 04 <hi> <lo>` → `52 …` (snapshot as MWB `0x36`
triplets).

## Ident DIDs (`22`)

`F187` = `1K0907379AH` (spare part no) · `F189` = `0107` (SW) · `F191` =
`1K0907379AH` (HW no) · `F1A3` = `H30` (HW ver) · `F197` = `ESP MK60EC1` (system
name) · `F1A5` = repair‑shop code · **`22 06 00`** = the 19‑byte long coding
(`543B4008…`). `1A 9B`, `F19E`, `F1A2`, `06 06`, `06 07` → not supported.

## Measuring blocks — `21 <NN>` → `61 <NN> {fmt a b}×≤4`

Blocks present: **01–07, 0A, 0B–0E**. 08, 09, 0F → `7F 21 31`.
VW KWP formula (subset, in the decoder): `07` = `a·b·0.01` (km/h) · `06` =
`a·b·0.001` (V) · `25` = bitfield · `36` = `a·256+b` (counter / freeze) · `12` =
`a·b·0.01` (mbar).

| Blk | layout (bench, static) | reading |
|---|---|---|
| **01** | `07`×4 | 4 wheel speeds — **0 km/h** at rest (FL/FR/RL/RR, confirm order with a Pico spin) |
| 02 | `25`×4 | bitfields — switch/valve states (`…10000001`) |
| 03 | `25`×4 | bitfields (`11000001 10000111…`) — a bit toggles 87↔88 |
| 04 | `51`,`52`,`55` | 51/52 = `0000`; **55** wanders `AA…FD` — candidate for pressure or a raw ADC |
| 05 | `53`,`25` | 53 toggles `0x28`/`0x11` (40 / 17); bitfield `10000001` |
| 06 | `25`,`06`,`06` | bitfield, then **11.86 V supply**, then 0 V (2nd rail) |
| 07 | `25` | one bitfield `10100111` |
| 0A | `25`×2 | two bitfields `10000001` |
| 0B–0E | `36`×3 | `0000`↔`FFFF` — uninitialised / invalid (no CAN inputs on the bench) |

Scaling for 04/05 (pressure, voltage detail) needs a **known input** — feed a
Pico WSS spin + a bench voltage step and re‑capture; block 01 and the 11.86 V in
block 06 are already solid.

## Routines (`31`)

- `31 B8 00 00` → `71 B8 01 01 01 02 01 03 01 14 01 06 01 08` — reads the list of
  supported measuring blocks (01,02,03,14,06,08…).
- `31 B8 01 02` → `71 B8 01 02` (accepted).
- `31 BA 01 02` → `7F 31 22` conditionsNotCorrect (wants the car / motion).

No SecurityAccess (`27`), no coding write (`2E`/`3B`), no Basic Settings in this
capture — it was a **read‑only** fault + measuring‑block session. To get the
pressure‑sensor Basic Setting (Group 066) bytes, capture a VCDS session that
actually *runs* it (login 40168 first).

## Implemented in BRAXON (2026‑09‑07)

- **`src/lib/vwtp20.ts`** — the VW TP2.0 transport. `openVwTp20Channel({ send,
  logicalAddress })`: setup frame to `0x200` → parse `00 D0 <rxLo> <rxHi> <txLo>
  <txHi>` → params (`A0`/`A1`) → returns a persistent `VwTp20Channel` with
  `.request(kwpBytes, {timeoutMs})` (one at a time, TP2.0 reassembly, 12‑bit
  length mask, op‑2 ACK, `7F..78` responsePending retry) + `.close()`.
  Mutual `A3` keep‑alive (1 s; also answers the ECU's `A3` with `A1`).
- **`src/lib/vwKwp.ts`** — `decodeVwDtcs` (`58` → 5‑digit + `(status&0x7F)-0x60`
  elaboration + present bit), `decodeVwMeasuringBlock` (`61` → VW formula table;
  `06`=V and `07`=km/h verified against this capture, rest are the VAG‑COM
  table), `parseVwIdent` (`62 F1xx` multi‑DID).
- **`src/components/VwTp20Panel.tsx`** — rendered in `Diagnostics.tsx` above the
  OBD/UDS/KWP protocol tabs (own transport, separate from that scan path):
  connect → ident → Read faults (enriched via `lookup_dtcs` on `VAG_WIKI`) →
  Clear → Measuring blocks (rolling `21 01..0F` poll).

**Bench‑verify (needs the actual unit + board):** the `0x200` setup round‑trip,
which of setup bytes `[2..3]`/`[4..5]` is rx vs tx (assumed rx then tx),
inter‑frame gap (6 ms) + poll rate (120 ms), and that the board forwards
arbitrary CAN IDs (0x200/0x300/0x790). Structure matches the decoded capture.

## Confirms

- **`VAG_WIKI` 5‑digit keying is exactly right for TP2.0 `18` responses** — no
  conversion.
- Next: capture a VCDS session that *runs* Basic Setting Group 066 (login 40168)
  to get the pressure‑sensor‑offset bytes; wire the MK60EC1 measuring blocks
  into `builtinLiveSignals` once a Pico spin pins the wheel‑speed order.
