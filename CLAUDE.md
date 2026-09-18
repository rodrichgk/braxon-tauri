# CLAUDE.md — read this before writing any code

This file is the contract for **every** contributor to BRAXON, human or AI. If
you are an AI agent (Claude Code, Cursor, Aider, Copilot, a spawned subagent,
…) you **must** read this file and [`docs/TESTING.md`](docs/TESTING.md) before
editing code, and follow the checklists at the bottom. `AGENTS.md` is a short
pointer to this file for tools that look for that name.

---

## 1. What BRAXON is

A **Tauri 1.5 desktop app** (Windows-only in practice) used on the shop floor
at an ABS/ESP hydraulic-module remanufacturing line. It does three broad jobs:

| Area | What it does |
| --- | --- |
| **Hydraulic bench** | Drives the F2-EVO test bench over serial: valve tests, pump-motor current profiling, pressure pre-charge loop (PID), generates PDF test reports. |
| **ECU diagnostics** | Talks to ABS/ESP ECUs over CAN (board bridge or Kvaser): ISO-TP / UDS / KWP2000 / VW-TP2.0, DTC read/clear, live data, active tests, ECU auto-discovery. Diagnostics panel has one tab per protocol. |
| **REMAN / shop** | Job tracking, analytics, finance, forecasting, roster — reads the REMAN 4D ERP (over ODBC) and a Postgres bus. QR scan flow ties a phone/USB scan to a job on a specific PC. |

Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the module map and
[`README.md`](README.md) for build/release mechanics.

---

## 2. Stack & layout

- **Frontend** — React 18 + TypeScript (strict), Vite 8, TailwindCSS, i18next (EN/FR, **default FR**). Path alias `@/` → `src/`.
- **Backend** — Rust, Tauri 1.5. `tokio-postgres` (Postgres), `odbc-api` (REMAN 4D DSN), `rusqlite` (bundled, local cache), `serialport`, Kvaser via runtime `libloading`.
- **scan-service/** — a separate single-file Node HTTP service deployed on the Ubuntu box next to Postgres. Its own `package.json`. Not bundled with the app.

```
src/
  lib/         Pure logic — protocol codecs (isotp, vwtp20, vwKwp, udsSession,
               dtcGeneric, pid, ecu, ecuDiscovery), report/label/scan builders.
               THIS IS THE HIGH-VALUE TEST TARGET. Keep it free of React/Tauri.
  hooks/       Serial connection, UDS session, QR scanner, recording, …
  contexts/    Session, AppSettings, Theme, DevGate, TestSession, Reports
  components/  React UI (some very large — Diagnostics.tsx, HydraulicBenchDashboard.tsx)
  pages/       Home, Jobs, Signal, Valves, Motors, Reman, F2Evo*
  i18n/        en.json, fr.json  (keep both in sync, every key in both)
  test/        Shared test harness — setup.ts, tauri.ts, render.tsx (see docs/TESTING.md)
src-tauri/src/
  main.rs           Tauri entry, command registration
  commands.rs       Most Tauri commands — DB queries, ECU/auth table setup
  reman.rs          REMAN 4D ODBC layer + analytics/forecast (largest module)
  f2evo.rs          F2-EVO bench serial protocol parser (has a good #[cfg(test)] suite)
  hydraulic_import.rs  Hydraulic report parsing/import
  database.rs / client_registry.rs / signal_history.rs / scan_inbox.rs / kvaser.rs / serial.rs
```

The frontend calls the backend **only** through `invoke("command_name", args)`
from `@tauri-apps/api/tauri`. (`src/lib/api.ts` is a legacy HTTP client to an
old Next.js server — do not build on it.)

---

## 3. THE RULE: tests run on every change

**Any change to code must keep the test suites green.** This is enforced two
ways (see `.claude/settings.json`):

1. **After each edit** to `src/**` a fast Vitest run fires; after each edit to
   `src-tauri/**` `cargo test` fires. A failure is reported straight back to you.
2. **At the end of every turn** the full suite runs: `npm run test:all`
   (`typecheck` + Vitest + `cargo test`).

If you touch code, you own the test result. Concretely:

- **New behaviour** → new tests that would fail without your change.
- **Bug fix** → a regression test that reproduces the bug first.
- **Refactor** → existing tests stay green; add tests for any gap the refactor exposed.
- **Never** weaken an assertion, `skip`/`todo` a test, delete a test, or lower a
  coverage threshold to get to green. If a test is genuinely wrong, fix it and
  say so in your summary.
- If a change makes something **untestable**, that's a design smell — extract the
  logic into `src/lib/` (pure) or a free function in the Rust module and test
  that.

### Commands

| Command | Use |
| --- | --- |
| `npm test` | Vitest once (CI mode). |
| `npm run test:watch` | Vitest watch while developing. |
| `npm run test:coverage` | Vitest + V8 coverage → `coverage/`. |
| `npm run test:rust` | `cargo test` in `src-tauri/`. |
| `npm run typecheck` | `tsc --noEmit` (strict; `noUnusedLocals`/`noUnusedParameters` on). |
| `npm run test:all` | Everything. Run before you consider a task done. |

Full guide, harness API, and patterns: **[`docs/TESTING.md`](docs/TESTING.md).**

---

## 4. Conventions

- **TypeScript strict.** No `any` in new code (the old `api.ts` has it; don't
  copy). No unused locals/params — `tsc` fails on them, so tests and helpers
  must be clean.
- **Comments explain _why_, not _what_.** This codebase's comments are unusually
  rich — they cite the original .NET app (`ABS.cs` line numbers), DDT4ALL files,
  real bench-report findings, protocol captures. Match that. A comment that just
  restates the code is noise; a comment that records a non-obvious constraint or
  a decision's rationale is gold.
- **i18n** — user-facing strings go through `t()`. Add the key to **both**
  `src/i18n/en.json` and `src/i18n/fr.json`.
- **Design tokens** — use the Tailwind semantic tokens (`bg-card`, `border`,
  `text-primary`, `accent`, `success`, `warning`, `danger`), never raw
  `gray-700`/`indigo-500`. A past review flagged raw colours as the most visible
  inconsistency in the app.
- **Rust** — protocol/parse/transform logic goes in free functions with a
  `#[cfg(test)] mod tests` in the same file (see `f2evo.rs`, `reman.rs`).
  Tauri `#[command]` fns stay thin wrappers over those.
- **Keep `src/lib/` pure** — no React imports, no `@tauri-apps/*` imports beyond
  types. That's what makes it cheap to test and reason about.

---

## 5. Gotchas

- **Windows-only.** Installer is NSIS/MSI; config resolves under `%APPDATA%`.
  CI runs on `windows-latest`. The repo lives on a **OneDrive path with spaces**
  — quote paths in shell commands.
- **`npm install`, not `npm ci`** in CI — a known compromise (wasm32 optional
  subtrees aren't fully resolved in the Windows-generated lockfile). See the
  comment in `.github/workflows/ci.yml`.
- **Tauri v1**, not v2 — APIs differ. `@tauri-apps/api@^1`.
- **Version lockstep** — `package.json`, `src-tauri/Cargo.toml`,
  `src-tauri/tauri.conf.json` and the git tag must all match on a release.
- **Postgres / REMAN 4D not available in tests or CI.** Anything needing a live
  DB must be behind a function you can test with fixture rows, or not unit-tested
  at all (integration-only — mark it clearly).
- **Long-lived branches: `dev` and `main`.** PRs target those; CI gates them.
- Don't commit real customer/job data (`docs/*.csv`, root `*.pdf` are gitignored
  for that reason — this repo is public).

---

## 6. Before you write code — checklist

- [ ] Read this file and `docs/TESTING.md`.
- [ ] Found the existing tests for the area you're touching (`*.test.ts(x)` next
      to the file, or `#[cfg(test)]` in the `.rs`). Run them; see them pass.
- [ ] Located the pure-logic seam. If the change is logic, it belongs in
      `src/lib/` or a Rust free function, with a test.
- [ ] Checked `src/i18n/*.json` if any user-facing string changes.

## 7. Before you say you're done — checklist

- [ ] `npm run test:all` is green (typecheck + Vitest + `cargo test`).
- [ ] New/changed behaviour has tests that would fail without the change.
- [ ] `npm run test:coverage` — coverage for files you touched did not drop.
- [ ] No `.skip`, `.only`, `.todo`, weakened assertions, or lowered thresholds.
- [ ] i18n keys present in both `en.json` and `fr.json`.
- [ ] Your summary states plainly what you tested and any test you couldn't add
      (and why).
