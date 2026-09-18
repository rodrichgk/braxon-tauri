import { describe, it, expect } from "vitest";
import { invoke } from "@tauri-apps/api/tauri";
import { mockTauri } from "@/test/tauri";

// Guards the shared harness itself. If this file goes red, every other suite
// is suspect — fix setup.ts / tauri.ts first.

describe("test harness", () => {
  it("provides jsdom globals the UI relies on", () => {
    expect(typeof window.matchMedia).toBe("function");
    expect(typeof window.ResizeObserver).toBe("function");
    expect(typeof window.IntersectionObserver).toBe("function");
    expect(typeof URL.createObjectURL).toBe("function");
    expect(typeof globalThis.crypto.randomUUID).toBe("function");
  });

  it("jest-dom matchers are wired up", () => {
    const el = document.createElement("div");
    el.textContent = "hi";
    document.body.append(el);
    expect(el).toBeInTheDocument();
    expect(el).toHaveTextContent("hi");
    el.remove();
  });

  it("Tauri invoke rejects by default (no accidental live backend)", async () => {
    await expect(invoke("anything")).rejects.toThrow(/no Tauri handler/);
  });

  it("mockTauri installs per-command handlers and records calls", async () => {
    const tauri = mockTauri({
      add: (a) => (a.x as number) + (a.y as number),
    });
    await expect(invoke("add", { x: 2, y: 3 })).resolves.toBe(5);
    expect(tauri.callsTo("add")).toEqual([{ x: 2, y: 3 }]);
  });
});
