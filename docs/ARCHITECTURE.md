# Architecture map

Orientation for anyone (human or AI) about to change code. Rules are in
[`../CLAUDE.md`](../CLAUDE.md); testing in [`TESTING.md`](TESTING.md).

## Process shape

```
┌────────────────────────── BRAXON.exe (Tauri 1.5, Windows) ──────────────────────────┐
│                                                                                     │
│   React 18 / Vite 8 frontend  ──invoke("cmd", args)──►  Rust backend (src-tauri)     │
│   src/                                                   src-tauri/src/              │
│     pages ─ components ─ hooks ─ contexts                   commands.rs  (registry)   │
│     lib/  (pure logic — codecs, reports)                   reman.rs  f2evo.rs  …      │
│                                                                                     │
│                            Rust talks out to:                                        │
│   ┌──────────────┬──────────────────┬───────────────────┬────────────────────────┐   │
│   │ serialport   │ Kvaser (FFI,     │ tokio-postgres    │ odbc-api → REMAN 4D DSN │   │
│   │ → F2-EVO /   │ libloading, opt) │ → Postgres "bus"  │ → ERP (jobs, stock,    │   │
│   │   CAN board  │ → CAN            │                   │    finance)            │   │
│   └──────────────┴──────────────────┴───────────────────┴────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────┘

scan-service/  — standalone Node HTTP service on the Ubuntu box next to Postgres.
                 A phone scans a BRAXON-printed QR → this writes a row into
                 "BraxonScanInbox" → scan_inbox.rs polls it → the app opens the job.
```

## Frontend (`src/`)

| Dir | Role | Test priority |
| --- | --- | --- |
| `lib/` | **Pure logic.** Protocol codecs (`isotp`, `vwtp20`, `vwKwp`, `udsSession`, `dtcGeneric`, `pid`, `ecu`, `ecuDiscovery`), report builders (`combinedReport`, `ecuReport`, `hydraulicReport`, `pdfReport`), label pipeline (`labelLayout` → `labelRaster` → `zplLabel`), scan parsing (`braxonScan`, `scanLabel`), `signalHilHistory`, `devAccess`. No React/Tauri. | **Highest** — unit-test thoroughly. |
| `hooks/` | Bridges to the backend / hardware: `useClientSerialConnection`, `useUdsSession`, `useQrScanner`, `useRecording`, `useSignalBoard`, `useWheelSpeedControl`, `useProfileManagement`, `useScanRouter`, `useStickyLog`. | High — `renderHook` + `mockTauri`. |
| `contexts/` | App-wide state: `SessionContext` (login/job), `AppSettingsContext` (bench cal, WSS channels — localStorage), `ThemeContext`, `DevGateContext` (hide in-dev pages, polls a shared setting), `TestSessionContext` (active jobs, scan routing), `ReportsContext` (report draft + passive CAN sniffer). | High — mostly localStorage-backed, cheap to test. |
| `components/` | UI. Small/leaf: `ValveIndicator`, `PressureGauge`, `PowerIndicators`, `QrCode`, `Spinner`, `NotificationBell`. Large containers: `Diagnostics` (~2.5k lines, 4 protocol tabs), `HydraulicBenchDashboard`, `LiveData`, `CANAnalyzer`, `EcuAutoConfig`, `EcuTestReport`, the `SignalTester/` set. | Leaf: full. Large: smoke + primary flow; extract helpers into `lib/`. |
| `pages/` | Top-level routes: `Home`, `Jobs`, `Signal`, `Valves`, `Motors`, `Reman` (~4k lines), `F2EvoHydraulic`, `F2EvoLegacy`. | Smoke render + key wiring. |
| `i18n/` | `en.json` / `fr.json` string tables. Default language **fr**. Every key in both. | Not executed — excluded from coverage. |

Backend calls go through `invoke` (see the command list in
`src-tauri/src/main.rs`). `src/lib/api.ts` is a **legacy** HTTP client to an old
Next.js server — don't extend it.

## Backend (`src-tauri/src/`)

| File | Role | Existing tests |
| --- | --- | --- |
| `main.rs` | Tauri entry, panic logger, `invoke_handler!` registry, `AppState`. | — |
| `commands.rs` | ~70 Tauri commands: serial/Kvaser control, DB config, ABS data / profiles / modules / motor tests, users + auth, repair jobs, DTC lookup, DDT4ALL ECU DB queries, ECU-by-ABS-ref matching. | — (needs pure helpers extracted) |
| `reman.rs` | **Largest.** REMAN 4D ODBC layer + analytics, forecasting, shop status, fault-hint classification, family derivation. | `#[cfg(test)]` — fault-hint + family + fault-type precedence |
| `f2evo.rs` | F2-EVO bench serial protocol: event parsing, command frame building, hydraulic report parsing. | `#[cfg(test)]` — solid suite (~24 tests) |
| `hydraulic_import.rs` | Parse/import hydraulic bench reports into the DB. | — |
| `database.rs` | Postgres pool + `db_config.json` persistence + `config_dir()`. | — |
| `client_registry.rs` | This machine's identity (pcId/hostname/osUser/appVersion) for QR values. | — |
| `signal_history.rs` | Signal HIL test-history storage/query. | — |
| `scan_inbox.rs` | Poll `BraxonScanInbox` for phone scans addressed to this pcId. | — |
| `app_settings.rs` | Shared key/value `AppSetting` table access. | — |
| `serial.rs` / `kvaser.rs` | Serial port + Kvaser CAN transports (Kvaser DLL loaded at runtime, absent-safe). | — |

**Testing the backend:** logic lives (or should be moved) into free functions
with a `#[cfg(test)] mod tests` in the same file. No live Postgres/ODBC in
`cargo test` — split the pure part (row → struct, query builder, classifier)
from the I/O.

## Planned work

- [`DASHBOARD-BENCH.md`](DASHBOARD-BENCH.md) — instrument-cluster ("dashboard")
  bench concept. Pre-hardware; the CAN "virtual BSI" half is buildable today
  on the existing CAN transport, the rest waits on a new board.

## Reference material

- [`../DATABASE.md`](../DATABASE.md) — Postgres schema notes.
- [`reman-schema.md`](reman-schema.md) — REMAN 4D ERP schema (prose).
- [`../reference-data/`](../reference-data/) — decoded ECU/ABS diagnostic
  protocols from real captures (MK61, Ford/ATE, PSA Bosch, VAG MK60EC1 TP2.0),
  VCDS label data, the DTC-text pipeline. `scripts/decode-*.mjs` are the offline
  decoders these were built with.
