/* Global test setup — loaded once per test file by Vitest (see
   vitest.config.ts `setupFiles`). Keep this lean: only cross-cutting shims
   that essentially every suite would otherwise repeat. Per-test behaviour
   (Tauri command responses, fake timers, etc.) belongs in the test itself,
   with the helpers in `src/test/tauri.ts` and `src/test/render.tsx`. */

/// <reference types="vitest/globals" />
import "@testing-library/jest-dom/vitest";

import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";

// ── React Testing Library: unmount between tests ──────────────────────────
afterEach(() => {
  cleanup();
});

// ── Tauri IPC ────────────────────────────────────────────────────────────
// Every test starts with a Tauri shell that answers nothing. A component
// that calls `invoke(...)` on mount gets a rejected promise it must already
// handle (they all do — the real app runs fine before the backend is up).
// Opt in to real answers per test with `mockTauri({...})` from
// `src/test/tauri.ts`.
beforeEach(() => {
  mockWindows("main");
  mockIPC(() => Promise.reject(new Error("no Tauri handler for this command in test")));
});

afterEach(() => {
  clearMocks();
  vi.useRealTimers();
});

// ── jsdom gaps the UI relies on ──────────────────────────────────────────
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
class IntersectionObserverStub {
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds: ReadonlyArray<number> = [];
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}
window.ResizeObserver ??= ResizeObserverStub as unknown as typeof window.ResizeObserver;
window.IntersectionObserver ??=
  IntersectionObserverStub as unknown as typeof window.IntersectionObserver;

if (!window.scrollTo) {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

// jsdom logs a noisy "Not implemented: HTMLCanvasElement.getContext" and
// returns nothing useful. Replace it wholesale with a stub that returns null,
// so gauge/waveform/label components render in a smoke test without the noise.
// Suites that need a real 2D context spy on this and `mockReturnValue(...)`.
HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;

if (typeof URL.createObjectURL !== "function") {
  URL.createObjectURL = vi.fn(() => "blob:test");
  URL.revokeObjectURL = vi.fn();
}

// Quiet, deterministic RNG-free crypto.randomUUID if a module reaches for it.
if (!globalThis.crypto?.randomUUID) {
  let n = 0;
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: {
      ...globalThis.crypto,
      randomUUID: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
    },
  });
}
