# Testing guide

Read [`../CLAUDE.md`](../CLAUDE.md) first for the *rules*. This file is the
*how*: the harness, the patterns, what to test where.

---

## 1. Runners at a glance

| Layer | Runner | Config | Where tests live |
| --- | --- | --- | --- |
| Frontend logic + React + hooks | **Vitest 5** (jsdom) | `vitest.config.ts` | `src/**/*.{test,spec}.{ts,tsx}` next to the file under test |
| scan-service | Vitest (same root config, node-ish via jsdom) | `vitest.config.ts` `include` | `scan-service/**/*.test.js` |
| Real scripts (`decode-*.mjs`) | Vitest | same | `scripts/**/*.test.mjs` (never `_scratch-*`) |
| Rust backend | **`cargo test`** | `src-tauri/Cargo.toml` | `#[cfg(test)] mod tests` inside each `.rs` |

```sh
npm test                     # Vitest once (what CI runs)
npm run test:watch           # Vitest watch
npm run test:ui              # Vitest UI
npm run test:coverage        # + V8 coverage → coverage/  (open coverage/index.html)
npm run test:rust            # cargo test in src-tauri/
npm run typecheck            # tsc --noEmit
npm run test:all             # typecheck + Vitest + cargo test  ← before "done"

npx vitest run src/lib/isotp.test.ts          # one file
npx vitest run -t "reassembles a multi-frame" # one test by name
cd src-tauri && cargo test reman::            # one Rust module
```

---

## 2. The shared harness (`src/test/`)

### `setup.ts` — loaded once per test file (via `setupFiles`)

- `@testing-library/jest-dom/vitest` matchers (`toBeInTheDocument`, …).
- RTL `cleanup()` after each test.
- **Tauri IPC defaults to rejecting.** Every `invoke(...)` throws
  `"no Tauri handler for this command in test"` unless the test opts in with
  `mockTauri(...)`. This is deliberate — a component that quietly depends on a
  backend call fails loudly instead of hanging.
- jsdom gap-fillers: `matchMedia`, `ResizeObserver`, `IntersectionObserver`,
  `scrollTo`, `scrollIntoView`, `URL.createObjectURL`, `crypto.randomUUID`,
  a no-op `canvas.getContext`.
- `vi.useRealTimers()` + `clearMocks()` after each test.

### `tauri.ts` — driving the IPC boundary

```ts
import { invoke } from "@tauri-apps/api/tauri";
import { mockTauri, ok, err } from "@/test/tauri";

const tauri = mockTauri({
  get_ecu_by_abs_ref: (args) => ({ absRef: args.ref, ecu: null, candidates: [] }),
  clear_dtcs:         ok({ cleared: 3 }),
  run_active_test:    err("actuator refused"),
});

await someThingThatInvokes();

expect(tauri.callsTo("run_active_test")).toEqual([{ id: "pump_1" }]);
expect(tauri.calls.map(c => c.cmd)).toEqual([...]); // full ordered log
```

Unlisted commands throw with the list of known ones, so a missing stub is
obvious. `console` noise: `muteConsole()` returns `{ error, warn }` spies.

### `render.tsx` — components that need app context

```ts
import { renderWithProviders, screen } from "@/test/render";

const { user, navigateTo, tauriCalls } = renderWithProviders(<Diagnostics />, {
  tauri: { list_serial_ports: () => ["COM3"], ecu_identify: () => ({ vin: "…" }) },
  user: { id: "u1", name: "Alice", role: "technicien" },   // seeds the session
  language: "en",
});

await user.click(screen.getByRole("button", { name: /scan dtcs/i }));
expect(navigateTo).toHaveBeenCalledWith("signal");
```

Wraps the child in the **same six providers `App.tsx` uses** (I18n, Theme,
AppSettings, Session, DevGate, TestSession, Reports). Leaf components with no
context needs — use plain `render` from `@testing-library/react` instead
(see `src/components/ValveIndicator.test.tsx`).

---

## 3. Patterns by layer

### 3a. Pure logic — `src/lib/` (the priority)

Template: [`src/lib/ecu.test.ts`](../src/lib/ecu.test.ts),
[`src/lib/pid.test.ts`](../src/lib/pid.test.ts).

- Table-driven with `it.each` for mapping/parsing functions.
- Cover: happy path, boundary values, malformed input → the documented
  fallback (`null`, `[]`, throw), idempotence where claimed.
- **Protocol codecs** (`isotp`, `vwtp20`, `vwKwp`, `udsSession`, `dtcGeneric`):
  - Encode: assert exact byte arrays / frame strings.
  - Decode: feed a real capture (see `reference-data/*.md`, `scripts/decode-*`)
    and assert the parsed structure — single frame, multi-frame reassembly with
    flow control, `7F .. 78` response-pending, negative responses, out-of-order
    consecutive frames.
  - These modules take a `send` function and listen on `clientSerial` events —
    inject a fake `send` and emit fake `SerialEvent`s; use fake timers for the
    timeout paths (`vi.useFakeTimers()` / `vi.advanceTimersByTimeAsync`).
- **Report/label builders** (`combinedReport`, `ecuReport`, `hydraulicReport`,
  `labelLayout`, `labelRaster`, `zplLabel`, `pdfReport`): assert the derived
  structure and any computed geometry/units. For `pdfReport`/`pdfLogos` don't
  assert PDF bytes — test the data-shaping functions and mock `jspdf`.

### 3b. Hooks — `src/hooks/`

```ts
import { renderHook, act, waitFor } from "@testing-library/react";
import { mockTauri } from "@/test/tauri";

it("polls the session open", async () => {
  const tauri = mockTauri({ uds_session_tick: () => ({ alive: true }) });
  const { result } = renderHook(() => useUdsSession(/* … */));
  await act(() => result.current.open());
  await waitFor(() => expect(result.current.state).toBe("open"));
  expect(tauri.callsTo("uds_session_tick").length).toBeGreaterThan(0);
});
```

Use fake timers for anything on an interval/poll. Assert cleanup on unmount
(listeners removed, intervals cleared).

### 3c. React components

- **Leaf / presentational** → plain `render`, assert on visible text/roles, one
  interaction. Template: `ValveIndicator.test.tsx`.
- **Container / page** → `renderWithProviders`, pass a `tauri` map for its
  mount-time calls, assert the states a user sees (loading → data → error) and
  the key interaction wiring (buttons call the right command with the right
  args; `navigateTo` fires).
- **Big trees** (`Diagnostics`, `HydraulicBenchDashboard`, `LiveData`, `Reman`)
  — you will not exercise every branch. Aim for: renders without throwing given
  a realistic `tauri` map; the primary happy-path flow; and any pure helper
  inside the file worth extracting to `src/lib/` (extract it and test it there).
- Prefer role/label queries (`getByRole`, `getByLabelText`) over test IDs; add a
  `data-testid` only when there's genuinely no accessible handle.
- `framer-motion` renders fine in jsdom; don't assert on animation.
- Charts (`recharts`) render to SVG with zero size in jsdom — assert the data
  you pass in, not the pixels.

### 3d. Rust — `src-tauri/src/*.rs`

Template: the `#[cfg(test)] mod tests` in
[`f2evo.rs`](../src-tauri/src/f2evo.rs) and `reman.rs`.

- Put parsing/classification/transform logic in **free functions**; keep
  `#[tauri::command]` fns as thin wrappers. Test the free functions.
- Feed real wire samples (multi-line serial frames, ODBC row shapes as structs)
  and assert the parsed result, including the tricky cases the comments call out
  (retest de-dup, precedence rules, decimal comma vs dot, control chars).
- No live Postgres/ODBC. If a function needs a connection, split out the pure
  part (row → domain struct, query-string builder) and test that.
- `cargo test` builds the whole crate — keep it compiling.

---

## 4. Coverage

`npm run test:coverage` (V8 provider). Report in `coverage/` — `index.html`,
plus `lcov.info` and `coverage-summary.json` for CI.

**Thresholds live in `vitest.config.ts`** and are a *floor that only goes up* —
each is set just below the current measured number, with per-directory globs
holding the line on the well-covered layers.

| Scope | Now (lines) | Target |
| --- | --- | --- |
| `src/contexts/**` | ~91% | keep ≥ 88% |
| `src/hooks/**` | ~89% | keep ≥ 85% |
| `src/lib/**` | ~63% | 85% (raise as `pdfReport` / `ecuDiscovery` deep-profile get covered) |
| `src/components/**` | ~24% | 45% (smoke + key flows) |
| `src/pages/**` | ~21% | 40% (smoke + key flows) |
| **All files** | ~36% | 60% |

When you add a suite that lifts a real number, **raise the matching threshold**
in the same change so it can't regress. Never lower one to pass.

Excluded from coverage (see config): `src/i18n/**`, `src/lib/pdfLogos.ts`
(embedded base64), `src/main.tsx`, `*.d.ts`, `src/test/**`.

---

## 5. CI

`.github/workflows/ci.yml` runs on push/PR to `dev` and `main`:
`typecheck → build → vitest (with coverage) → cargo test`. A red test fails the
check. The coverage summary is printed in the job log and uploaded as an
artifact.

---

## 6. Don't

- Don't hit the network, a real serial port, Postgres, or the REMAN 4D DSN.
- Don't `vi.mock` a module you could instead call with a fake argument.
- Don't assert on exact PDF/PNG/ZPL bytes — assert the model that produces them.
- Don't test framework/library behaviour (React, recharts, jspdf internals).
- Don't leave `it.only` / `describe.only` / `.skip` / `.todo` in a commit.
