# Dashboard / instrument-cluster bench — concept & architecture

**Status: pre-hardware; Phase 0 built.** No PCB exists yet. This document
formalizes the bench's scope so the software side can start now, on the same
seams the firmware will plug into later. §6's "Phase 0" — a profile-driven
"virtual BSI" CAN transmitter needing zero new hardware — is implemented:
`src/lib/clusterCan.ts` (signal codec), `src/lib/clusterBench.ts` (pure
scheduler), `src/lib/builtinClusterCanProfiles.ts` (demo profile),
`src/components/ClusterBenchDashboard.tsx` + `src/pages/ClusterBench.tsx`
(UI, wired into the sidebar as "Cluster Bench", hideable via the existing
dev-gate). Everything past Phase 0 (digipots, discrete 12V I/O, current
sense) is still spec-only below, waiting on real hardware.

Naming note: the product name is "dashboard bench," but in this codebase
`XxxDashboard.tsx` already means "the UI screen for bench Xxx"
(`HydraulicBenchDashboard.tsx`, `ElectronicsBenchDashboard.tsx`). Calling the
new UI `DashboardBenchDashboard.tsx` reads badly and will get confusing fast.
This doc uses **Cluster Bench** as the in-code name (module/component/file
names below) and keeps "dashboard bench" as the human-facing term in UI copy
and i18n strings. Flag if you'd rather keep "Dashboard" in code — cheap to
change now, expensive after 20 files exist.

---

## 1. What it tests

A car instrument cluster (+ optionally a BSI/body-control module) removed
from the vehicle, powered and stimulated on the bench, same philosophy as the
F2-EVO hydraulic/electronics benches: BRAXON drives known inputs and checks
the unit under test reacts correctly — gauges move to the right position,
telltales light on the right condition, backlight/buzzer respond, CAN
messages are transmitted/accepted correctly.

Clusters reach the bench in three electrically distinct flavours, and the
bench has to cover all three because "universal" is the whole point:

| Class | How it's driven in the car | What the bench must do |
| --- | --- | --- |
| **CAN-native** | Modern clusters — every gauge/telltale is a CAN signal from the BSI/ECU cluster (no direct wiring). | Act as the **virtual BSI**: transmit the right frames/signals at the right cycle time, per vehicle profile. |
| **Discrete-only** | Older clusters — gauges are analog (resistive sender → galvanometer or stepper), telltales are switched +12V/ground per pin. | Emulate sender resistance per channel (digipots) + drive/read discrete 12V pins per connector pinout. |
| **Hybrid** | Common on '00s–'10s cars — most data over CAN, a handful of legacy discrete inputs (washer level float switch, illumination dimmer, handbrake switch). | Both of the above at once, same profile. |

## 2. Hardware channel inventory (spec input for the PCB)

This is what the software will need to address once the board exists — worth
locking down before laying out the PCB.

| Channel type | Count (suggest) | Purpose | Notes |
| --- | --- | --- | --- |
| Digipot (SPI, e.g. MCP41xx/MCP46xx) | 4–8 | Emulate resistive senders: fuel level, coolant temp, oil temp, oil pressure (some are resistive), etc. | Needs enough range/resolution to cover the worst-case sender curve (some fuel senders span 0–90 Ω, others 10–180 Ω, VDO vs. Ford vs. GM curves differ). See §3. |
| Discrete 12V output | 8–16 | Drive telltale/switch-input pins directly: handbrake, seatbelt, door-open, oil-pressure switch, low-washer-fluid, indicator-flasher feed. | Per-channel polarity matters: some circuits are bench-sources-12V-to-pin, others are ECU-pulls-pin-to-ground (bench must sink, not source). Firmware needs a per-channel high-side/low-side mode, not a fixed assumption. |
| PWM-capable output | subset of the above | Illumination dimmer (0–5V or 0–12V PWM), some buzzer drivers. | |
| Current sense per output channel | same count as discrete outputs | Bulb-check emulation (BSIs on bulb-driven telltales measure filament current to detect a burnt bulb) + short/open diagnosis on the bench's own wiring. | Only matters for bulb-driven telltales; LED/CAN-only clusters don't need it, but the bench can't know which is under test without configuration, so build it in per-channel and let the profile say whether to care. |
| Discrete input (opto/divider) | 4–8 | Read back what the cluster itself drives out: illumination output, buzzer line, backlight PWM duty — verifies cluster output, not just bench injection. | |
| CAN transceiver | 1 (reuse existing transport) | Virtual-BSI frame TX + cluster's own bus traffic RX for verification. | Don't build new CAN hardware — reuse the board-bridge/Kvaser abstraction already in BRAXON (`serial.rs`/`kvaser.rs`, `CANSettings.tsx`/`CANAnalyzer.tsx`). One more transport to plug into the same event stream. |
| Bench 12V supply w/ current limit | 1 | Powers the UUT; current-limit protects against a shorted cluster. | |
| Ignition/key-on relay | 1 | Most clusters gate everything on an ignition-sense pin. | |

Stretch (v2, not blocking v1): mic + level detect for buzzer verification;
camera/photodiode array for needle-position or backlight-brightness
verification, closing the loop the current F2-EVO benches leave to the
operator's eyes.

**Electrical notes for the PCB** (software-relevant because the firmware
protocol needs to expose these, not because I'm doing hardware design here):
opto-isolate the 12V field wiring from the logic side, fuse every output
channel individually (one shorted cluster shouldn't take out the whole bank),
and consider flyback protection if any UUT still has an inductive
stepper/solenoid gauge rather than a plain galvanometer.

## 3. The data model that makes it "universal"

Same principle BRAXON already uses for ECU data (the DDT4ALL-derived
per-value scaling dict, `ecu.ts`) and for HIL signal profiles
(`SignalTester/ProfileEditor.tsx` — curve points on a canvas, saved/loaded by
name): **the bench logic is generic, the vehicle-specific knowledge is
data**, not code. Three profile types:

```ts
// Sender curve: resistance ↔ physical value, per manufacturer/type.
// Reuses the exact shape of ProfilePoint (SignalTester) — same curve-editor
// UI can be repurposed almost as-is (x = physical value, y = resistance
// instead of x = time, y = frequency).
interface SenderProfile {
  id: string;
  kind: 'fuel' | 'coolant_temp' | 'oil_temp' | 'oil_pressure' | 'custom';
  manufacturer?: string;          // "VDO", "Ford", "GM", …
  points: { value: number; ohms: number }[]; // interpolate between points
}

// Discrete pin map: connector pin ↔ function ↔ drive mode.
interface IndicatorMap {
  id: string;
  vehicleRef?: string;
  pins: {
    pin: string;                  // connector pin id, from the pinout
    function: string;             // "handbrake", "seatbelt", "door_fl", …
    mode: 'source_12v' | 'sink_gnd' | 'pwm';
    bulbCheck?: boolean;          // does this pin need current-based bulb sim?
  }[];
}

// CAN "virtual BSI" frame table: same shape as the existing ABS bench's
// CanFrames/Stringhe upload (absCanUpload.ts / f2evo.rs `CanFrames`),
// generalized with a cycle time and named signals instead of raw bytes only.
interface ClusterCanProfile {
  id: string;
  vehicleRef?: string;
  busSpeed: number;               // kbps
  frames: {
    id: number;                   // arbitration ID
    cycleMs: number;               // 0 = send-once / on-demand
    signals: { name: string; startBit: number; lengthBits: number; scale: number; offset: number }[];
  }[];
}
```

Profiles are edited/stored the same way existing bench profiles are (bundled
JSON to start, promotable to the Postgres bus later if techs need to share
them across PCs — same tradeoff already made for HIL signal profiles).

## 4. Software module map

Following the existing per-bench pattern (`f2evo.rs` + `absBench.ts` +
`ElectronicsBenchDashboard.tsx`, or `hydraulic_import.rs` +
`HydraulicBenchDashboard.tsx`):

| New file | Role | Test priority |
| --- | --- | --- |
| `src-tauri/src/clusterbench.rs` | Serial protocol for the new board once firmware exists: frame parse/build, free functions + `#[cfg(test)]`, thin `#[command]` wrappers — same shape as `f2evo.rs`. | High once firmware exists |
| `src/lib/clusterBench.ts` | Pure state machine (`benchReduce`/`BenchState`/`BenchMsg`, mirroring `absBench.ts`): resolves a desired physical reading → digipot target via `SenderProfile` interpolation, builds indicator-set commands, drives the CAN frame scheduler, runs test sequences ("sweep fuel 0→100%", "flash all telltales", "simulate low oil pressure"). No React/Tauri. | **Highest — buildable and testable before any hardware exists.** |
| `src/lib/clusterCan.ts` | `ClusterCanProfile` signal pack/unpack (bit-level, like a mini DBC codec). Pure. | Highest — pure math, easy to unit test exhaustively now. |
| `src/lib/clusterSenderProfiles.ts` | Built-in `SenderProfile` presets (common VDO/Ford/GM curves) + interpolation helper. | Highest — pure, buildable now. |
| `src/components/ClusterBenchDashboard.tsx` | UI shell: connection bar, indicator toggle grid (reuse `PowerIndicators`/`ValveIndicator` visual language), gauge sliders with live current readout (reuse the `MotorTester.tsx` current-profiling chart pattern), CAN TX rate config, test-sequence runner. | Smoke + primary flow, like the other `*BenchDashboard` components. |
| `src/pages/ClusterBench.tsx` | Route wiring + sidebar entry. | Smoke render. |
| `src/hooks/useClusterBenchSerial.ts` | Serial/board connection, modeled on `useSignalBoard.ts` (bench board is very likely its own USB port again, same reasoning as the WSS signal board being separate from the main transport). | High — same `renderHook` + `mockTauri` pattern as the other hooks. |
| `src/lib/clusterReport.ts` + reuse `pdfReport.ts` | Test report: which telltales passed, gauge accuracy vs. expected curve, CAN comms check — same shape as `hydraulicReport`/`ecuReport`. | High once report format is defined. |

i18n: every new user-facing string in `ClusterBenchDashboard.tsx`/`ClusterBench.tsx` goes in both `en.json` and `fr.json` (default fr) — no exception here.

## 5. Board protocol — draft, revise once firmware exists

To keep the new board consistent with the existing fleet rather than
inventing framing from scratch: `f2evo.rs` documents that every other board
except Electronics/ABS uses **plain line-based text**, 115200 baud, no STX.
Recommend the new board follow that simpler convention (STX was only needed
because the Electronics board's original .NET driver required it — no reason
to carry that forward). Draft command set (adjust once you know the MCU/pin
count):

```
SET_POT <channel> <value>         -> "OK" | "ERR <reason>"
SET_OUT <channel> <mode> <value>  -> mode: SRC12 | SNK | PWM ; value: 0/1 or duty
READ_CUR <channel>                -> "CUR:<channel>:<milliamps>"
READ_IN <channel>                 -> "IN:<channel>:<0|1|raw>"
CAN_FRAME <id> <dlc> <bytes...>   -> queued, board handles bus timing
PING                              -> "PONG"
```

This is intentionally provisional — the real contract gets written the way
`f2evo.rs`'s header describes its own history: pulled from what the firmware
actually does, not designed in the abstract and hoped onto it later.

## 6a. Real active-test replay (Peugeot 207 BSI)

Separate from everything above: `src/components/PsaActiveTestPanel.tsx` +
`src/lib/psaActiveTest.ts` replay the exact `IOControlByLocalIdentifier`
sequence decoded from a real bench capture
(`reference-data/peugeot-207-bsi-commodo-can.md`) against a real,
bench-connected BSI (0x752 → 0x752/0x652) — click a button, watch the
actual dash react. This is deliberately not the periodic-broadcast
`ClusterCanProfile` model: it's a diagnostic session (opened/held via the
existing `udsSession.ts`) plus hand-built, **unpadded** frames matching the
capture's own DLC exactly (`isotp.ts`'s `buildFrame`/`buildSingleFrame`
always pad to 8, which this BSI's own traffic never does — see the file's
header comment). Only local ID `0xC5` is confirmed to do *something*; the
panel's free-text "try local ID" field exists specifically to brute-force
the others (high beam / low beam / left / right indicator / wipers) by
hand against a connected dash, since the capture never demonstrated them.
This is the concrete instance of the plan in §6's "real vehicle's
`ClusterCanProfile`" line — it turned out the first working shape for a
real vehicle is "replay a captured sequence," not "decode a bit-level
profile," which the ISO-TP-unpadded-frame gotcha above is a direct
consequence of.

## 6. Phasing

**Phase 0 — buildable today, zero new hardware. Built.** The CAN "virtual
BSI" half of this doesn't need the new PCB at all: BRAXON already has a
working CAN transport (Kvaser + board bridge) and raw frame send via the
same `CANTx : <id> <8 bytes>` line every other CAN tool in the app uses
(`buildFrame` in `@/lib/isotp`, `kvaser.rs`/`serial.rs`). What actually
shipped, slightly simpler than the original sketch in §4/§5:

- `clusterCan.ts` — pure signal codec only (`ClusterCanSignal` bit-pack/
  unpack, Intel bit order, scale+offset). No wire-format knowledge — that's
  `buildFrame`'s job, kept separate so this stays decoupled from `isotp.ts`.
- `clusterBench.ts` — a pure scheduler (`clusterBenchReduce`), not a full
  `absBench.ts`-style reducer yet: `load_profile` / `start` / `stop` /
  `set_value` (send-on-change) / `send_frame` (one-shot) / `tick` (per-frame
  cycle timer). No test-sequence runner or fault-injection scripting yet —
  that's still open, see §8.
- `builtinClusterCanProfiles.ts` — one demo profile (`DEMO_CLUSTER_PROFILE`),
  not tied to any real vehicle: 2 gauge frames (8 gauges — fuel, coolant,
  RPM, speed, oil temp, battery voltage, boost, oil pressure) and 5 telltale
  frames (40 one-bit flags covering the common ISO 2575 dashboard symbol
  set — lighting, doors, drivetrain/emissions warnings, safety systems).
  This is CAN *wiring* (frame id, bit position, scale) and stays in TS —
  the "open decision" below on profile storage is still open.
- **`ClusterBenchSignal` (Postgres)** — the signal *catalog* (kind/category/
  unit/icon per name) moved out of hardcoded TS maps into BRAXON's shared
  Postgres, so any tech can extend it without a code change. See
  `src-tauri/src/cluster_bench.rs` (`ensure_table`/`SEED_SIGNALS`/
  `get_cluster_bench_catalog`/`upsert_cluster_bench_signal`) and
  `src/lib/clusterBenchCatalog.ts` (frontend fetch + by-name index).
  Self-seeds the same 48 builtin signals on first call (`ON CONFLICT (name)
  DO NOTHING` — never clobbers a tech's edits). `ClusterBenchDashboard`
  fetches this on mount and prefers it over the hardcoded `TELLTALE_ICONS`/
  `SIGNAL_UNITS` fallback maps, which stay in place for when the DB is
  unreachable. **Scope boundary:** this table holds display metadata only —
  a signal added purely via the DB (beyond the demo profile's 48 names) has
  nothing to transmit yet, since CAN wiring is still the separate,
  still-TS-only `ClusterCanProfile` above. `ClusterBenchDashboard`'s
  per-frame "Customize" toggle (session-scoped, UI-only) lets a tech hide
  signals that don't apply to the vehicle/test at hand.
- `ClusterBenchDashboard.tsx` — reads the CAN transport straight off
  `useClientSerialConnection()` (same singleton every other CAN feature
  uses), so it works with whatever's already connected (board or Kvaser).
  Takes optional `isConnected`/`sendMessage` prop overrides purely for
  testability (same pattern `PowerIndicators.tsx` already uses).
- `ClusterGauge.tsx` / `ClusterTelltale.tsx` — the visual face: a radial
  needle gauge per multi-bit signal (same SVG face/arc/needle language as
  `PressureGauge`, generalized to an arbitrary `[min, max]` + unit) and a
  lit/dim warning-lamp button per 1-bit signal, instead of raw
  `<input type="range">`/checkbox controls. The gauge's slider still does
  the actual dragging; the dial is what makes it read as a bench instrument
  instead of a form.
- Wired into the sidebar as **"Cluster Bench"** (`Page` id `cluster_bench`),
  hideable via the existing dev-gate (`HIDEABLE_PAGES`) since it's still
  experimental.

Not yet done, deliberately deferred until there's a reason to build it:
digipot/discrete-I/O channels (need the real board — Phase 1), a profile
editor UI, RX-side verification against `unpackFrameBytes` (nothing reads
the cluster's own CAN traffic back yet), and any real vehicle's
`ClusterCanProfile` (the demo profile is a placeholder).

**Phase 1 — first PCB revision.** Digipot channels + discrete 12V I/O once
`clusterbench.rs` has real firmware to talk to.

**Phase 2 — stretch.** Bulb-check current sensing, buzzer/vision
verification, full PDF report.

## 7. Testing (per `CLAUDE.md` §3)

Everything in §4 marked "buildable now" has no hardware dependency and
should ship with tests from day one, same rule as everywhere else in this
repo: `clusterCan.ts` (bit-packing round-trips), `clusterSenderProfiles.ts`
(interpolation edge cases — below/above curve range, exact knot points),
`clusterBench.ts` (reducer transitions, sequence timing) all belong in
Vitest immediately, no board required — same seam that makes `absBench.ts`
and `f2evo.rs` testable without a real bench attached. `clusterbench.rs`'s
`#[cfg(test)]` suite has to wait for real firmware behavior to assert
against, same as `f2evo.rs` did.

## 8. Open decisions

- **Naming** — "Cluster Bench" in code vs. keeping "Dashboard" (see note at
  top). Affects every file name in §4.
- **Board count** — one MCU handling digipots + discrete I/O + current
  sense, or split (e.g. a dedicated current-sense/bulb-check daughter board)?
  Affects the protocol's channel addressing scheme.
- **Profile storage** — bundled JSON to start (matches how `absCanUpload`
  seeds init frames today) vs. Postgres bus from day one (lets techs share
  cluster profiles across PCs immediately, at the cost of needing the DB
  available while still on the bench-only phase).
