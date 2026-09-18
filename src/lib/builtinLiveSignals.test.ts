import { describe, it, expect } from "vitest";
import { BUILTIN_LIVE, builtinLiveFor, builtinLiveForRef } from "@/lib/builtinLiveSignals";

describe("builtinLiveFor", () => {
  it("returns the MK61 preset list", () => {
    const presets = builtinLiveFor("MK61");
    expect(presets.length).toBe(6);
    expect(presets[0]).toMatchObject({ service: "21", id: "04", label: "Wheel speeds (21 04)" });
    // the one-request read carries all five uint16 BE ÷100 values
    expect(presets[0].signals.map((s) => [s.name, s.offset])).toEqual([
      ["Wheel FL", 2],
      ["Wheel FR", 4],
      ["Wheel RL", 6],
      ["Wheel RR", 8],
      ["Vehicle", 10],
    ]);
  });

  it("returns [] for unknown / null / undefined", () => {
    expect(builtinLiveFor("MK70")).toEqual([]);
    expect(builtinLiveFor(null)).toEqual([]);
    expect(builtinLiveFor(undefined)).toEqual([]);
    expect(builtinLiveFor("")).toEqual([]);
  });
});

describe("builtinLiveForRef", () => {
  it("prefers an exact-reference match over the hardware family", () => {
    // 10.0961-0191.3 is a MK61 part number but a Ford/ATE diag layout.
    const presets = builtinLiveForRef("10.0961-0191.3", "MK61");
    expect(presets).toBe(BUILTIN_LIVE.FORD_ATE);
    expect(presets.map((p) => p.id)).toEqual(["2B06", "2B07", "2B08", "2B09"]);
    expect(presets[0].signals[0]).toMatchObject({ offset: 3, length: 1, scale: 1, unit: "km/h" });
  });

  it("normalises the reference (punctuation-insensitive)", () => {
    expect(builtinLiveForRef("10096101913", null)).toBe(BUILTIN_LIVE.FORD_ATE);
  });

  it("falls back to the family when no ref match", () => {
    expect(builtinLiveForRef("10.0961-1464.3", "MK61")).toBe(BUILTIN_LIVE.MK61);
    expect(builtinLiveForRef(null, "MK61")).toBe(BUILTIN_LIVE.MK61);
    expect(builtinLiveForRef("nope", null)).toEqual([]);
  });
});

describe("BUILTIN_LIVE catalog integrity", () => {
  const presets = Object.values(BUILTIN_LIVE).flat();

  it("every signal is a well-formed decode spec", () => {
    for (const p of presets) {
      expect(["21", "22", "01", "can"]).toContain(p.service);
      expect(p.id).toMatch(/^[0-9A-Fa-f]+$/);
      expect(p.signals.length).toBeGreaterThan(0);
      for (const s of p.signals) {
        expect([1, 2]).toContain(s.length);
        expect(typeof s.signed).toBe("boolean");
        expect(Number.isFinite(s.scale)).toBe(true);
        expect(s.offset).toBeGreaterThanOrEqual(0);
        expect(s.unit.length).toBeGreaterThan(0);
      }
    }
  });

  it("the km/h wheel-speed signals decode as uint16 BE ÷100", () => {
    const wheel = BUILTIN_LIVE.MK61[0].signals[0];
    expect(wheel).toMatchObject({ length: 2, signed: false, scale: 0.01, add: 0, unit: "km/h" });
  });
});
