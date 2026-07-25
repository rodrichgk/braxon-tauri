# BRAXON — ABS Hydraulic Diagnostics Platform

Tauri desktop application for testing and diagnosing ABS hydraulic modules:
valve testing, pump-motor current profiling, wheel-speed signal generation,
CAN and K-line diagnostics, and repair job tracking.

Split out of [`pic-abs-tester`](https://github.com/rodrichgk/pic-abs-tester),
which remains the Next.js web app and owns the Prisma schema. Commit history
from before the split is preserved here.

## Stack

- **Frontend** — React 18 + TypeScript, Vite 8, TailwindCSS, i18next (EN/FR)
- **Backend** — Rust, Tauri 1.5
- **Database** — PostgreSQL over `tokio-postgres` (see [DATABASE.md](DATABASE.md))
- **Hardware** — serial (`serialport`) to the Pico/Nano, WebSocket server on
  `0.0.0.0:8765` for ESP32 devices

## Prerequisites

- Node.js 20+
- Rust stable, `x86_64-pc-windows-msvc`
- A reachable PostgreSQL server — configured in-app on first run, stored at
  `%APPDATA%\pic-abs-tester\db_config.json`

## Development

```sh
npm install
npm run tauri:dev      # Vite dev server + Rust backend, hot reload
```

Frontend only, without the Tauri shell:

```sh
npm run dev
```

## Building

```sh
npm run tauri:build
```

Installers land in `src-tauri/target/release/bundle/` (NSIS `.exe` and MSI on
Windows).

## Releasing

Releases are cut by pushing a version tag. `.github/workflows/release.yml`
builds on `windows-latest`, signs the installer, publishes a public GitHub
Release, and uploads `latest.json` — which running instances poll to
auto-prompt for the update.

```sh
# bump version in package.json, src-tauri/Cargo.toml and src-tauri/tauri.conf.json first
git tag v1.0.7
git push origin v1.0.7
```

All three version fields must match the tag. Requires the `TAURI_PRIVATE_KEY`
and `TAURI_KEY_PASSWORD` repository secrets.

## Layout

```
src/
  components/    React UI — ABSTester, MotorTester, SignalTester, DTCScanner,
                 CANAnalyzer, BenchPower, ConnectionBar, UpdateChecker
  contexts/      AppSettings, Session
  hooks/         serial connection, profile management, recording
  pages/         Home, Jobs, Signal, Valves
  i18n/          en.json, fr.json
src-tauri/
  src/
    main.rs      Tauri entry point, command registration
    commands.rs  all Tauri commands — DB queries, ECU/auth table setup
    database.rs  PostgreSQL connection + config persistence
    websocket.rs WebSocket server for ESP32 devices
```

## Serial command protocol

Unchanged from the firmware:

- Valves — `START`, `STOP`, `TEST 1,2,3`
- Wheel speed — `W<fl>,<fr>,<rl>,<rr>` (Hz), stop `X`, run `R`
- WSS profile — `C<ch>,<profile>` (0–3 DF11, 4–7 VDA AK), AK multiplier
  `M<ch>,<x100>`, barcode `K` / `K<ch>`
- CAN — Pico: ping `t`, `SEND:<id>:<value>:<len>`; Nano: `CANSpeed : <250|500|1000>`
- Power — `{"type":15|16,"state":bool,...}` for ABS power and ignition

## Troubleshooting

**Build fails** — `rustup update`, then `cargo clean` in `src-tauri/`.

**WebSocket not connecting** — port 8765 already in use, or blocked by the
firewall. Check the Rust console output.

**Database errors** — verify the server is reachable and the credentials in
`%APPDATA%\pic-abs-tester\db_config.json` are correct. Deleting that file
re-triggers the in-app setup.
