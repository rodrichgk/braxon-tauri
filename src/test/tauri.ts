/* Helpers for driving the Tauri IPC boundary in tests.

   The app talks to the Rust backend exclusively through `invoke("command", args)`
   (see src/lib/api.ts and the hooks). `@tauri-apps/api/mocks` lets us stand in
   for that boundary without a running backend. */

import { mockIPC } from "@tauri-apps/api/mocks";
import { vi } from "vitest";

/** A stub for one Tauri command: gets the command's args, returns its result
 *  (or a promise, or throws to simulate a backend `Err`). */
export type CommandHandler = (args: Record<string, unknown>) => unknown;

export interface MockTauriResult {
  /** Every `invoke` call, in order: `{ cmd, args }`. */
  calls: Array<{ cmd: string; args: Record<string, unknown> }>;
  /** Calls for one command only. */
  callsTo: (cmd: string) => Array<Record<string, unknown>>;
}

export interface MockTauriOptions {
  /** Called for any command not in the handler map. Return a value to resolve
   *  with it; throw to reject. When unset, an unlisted command rejects with a
   *  descriptive error (a missing stub fails loudly rather than hanging). Use
   *  `() => []` / `() => ({})` for a permissive smoke test. */
  fallback?: (cmd: string, args: Record<string, unknown>) => unknown;
}

/**
 * Install a command→handler map for the current test.
 *
 *   const tauri = mockTauri({
 *     get_ecu_by_abs_ref: (a) => ({ absRef: a.ref, ecu: null, candidates: [] }),
 *     run_active_test:     () => { throw "actuator refused"; },
 *   });
 *   ...
 *   expect(tauri.callsTo("run_active_test")).toHaveLength(1);
 */
export function mockTauri(
  handlers: Record<string, CommandHandler>,
  opts: MockTauriOptions = {},
): MockTauriResult {
  const calls: MockTauriResult["calls"] = [];

  mockIPC(async (cmd, args) => {
    const a = (args ?? {}) as Record<string, unknown>;
    calls.push({ cmd, args: a });

    // Tauri routes a few built-ins through the same channel; keep them quiet.
    if (cmd === "tauri" || cmd.startsWith("plugin:")) return undefined;

    const handler = handlers[cmd];
    if (handler) return handler(a);
    if (opts.fallback) return opts.fallback(cmd, a);
    throw new Error(
      `mockTauri: no handler for "${cmd}". Known: ${Object.keys(handlers).join(", ") || "(none)"}`,
    );
  });

  return {
    calls,
    callsTo: (cmd) => calls.filter((c) => c.cmd === cmd).map((c) => c.args),
  };
}

/** Convenience: a handler that resolves to `value` and records nothing extra. */
export const ok =
  <T>(value: T): CommandHandler =>
  () =>
    value;

/** Convenience: a handler that simulates a backend error. */
export const err =
  (message: string): CommandHandler =>
  () => {
    throw message;
  };

/** Spy on `console.error`/`console.warn` for a test and restore after. Returns
 *  the spies so a test can assert (or assert silence). */
export function muteConsole(): { error: ReturnType<typeof vi.spyOn>; warn: ReturnType<typeof vi.spyOn> } {
  return {
    error: vi.spyOn(console, "error").mockImplementation(() => {}),
    warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
  };
}
