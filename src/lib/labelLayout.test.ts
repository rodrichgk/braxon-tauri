import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  DEFAULT_LAYOUT,
  DPMM,
  getLabelLayout,
  setLabelLayout,
  qrModuleCount,
  qrMagFor,
  type LabelLayout,
} from "@/lib/labelLayout";

const KEY = "braxonLabelLayout";

beforeEach(() => {
  localStorage.clear();
});

describe("DEFAULT_LAYOUT", () => {
  it("is the documented 50x40 mm label", () => {
    expect(DEFAULT_LAYOUT).toEqual({
      labelWmm: 50,
      labelHmm: 40,
      numberX: 70,
      numberY: 16,
      numberFont: 54,
      qrX: 98,
      qrY: 96,
      qrSize: 208,
    });
    expect(DPMM).toBe(8);
  });
});

describe("getLabelLayout", () => {
  it("returns the defaults when nothing is stored", () => {
    expect(getLabelLayout()).toEqual(DEFAULT_LAYOUT);
  });

  it("returns the defaults for un-parseable / non-object stored JSON", () => {
    for (const bad of ["{not json", "42", '"nope"', "[]"]) {
      localStorage.setItem(KEY, bad);
      expect(getLabelLayout()).toEqual(DEFAULT_LAYOUT);
    }
  });

  it("round-trips a valid layout through setLabelLayout", () => {
    const custom: LabelLayout = {
      labelWmm: 80,
      labelHmm: 60,
      numberX: 120,
      numberY: 24,
      numberFont: 40,
      qrX: 300,
      qrY: 200,
      qrSize: 240,
    };
    setLabelLayout(custom);
    expect(getLabelLayout()).toEqual(custom);
  });

  it("clamps the label stock size to 10..120 mm", () => {
    localStorage.setItem(KEY, JSON.stringify({ labelWmm: 5, labelHmm: 999 }));
    const l = getLabelLayout();
    expect(l.labelWmm).toBe(10);
    expect(l.labelHmm).toBe(120);
  });

  it("falls back to the default for a non-finite / non-number size", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ labelWmm: "wide", labelHmm: null, numberFont: Number.POSITIVE_INFINITY }),
    );
    const l = getLabelLayout();
    expect(l.labelWmm).toBe(DEFAULT_LAYOUT.labelWmm);
    expect(l.labelHmm).toBe(DEFAULT_LAYOUT.labelHmm);
    expect(l.numberFont).toBe(DEFAULT_LAYOUT.numberFont);
  });

  it("clamps numberX/numberY into [-40, labelDots] and rounds to a whole dot", () => {
    // 50 mm wide -> 400 dots; 40 mm tall -> 320 dots.
    localStorage.setItem(
      KEY,
      JSON.stringify({ numberX: 5000, numberY: -100, qrX: 70.7, qrY: 12.4 }),
    );
    const l = getLabelLayout();
    expect(l.numberX).toBe(400);
    expect(l.numberY).toBe(-40);
    expect(l.qrX).toBe(71);
    expect(l.qrY).toBe(12);
  });

  it("clamps numberFont to [12, 160] and qrSize to [80, max(w,h)]", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ numberFont: 1, qrSize: 5000 }),
    );
    const l = getLabelLayout();
    expect(l.numberFont).toBe(12);
    expect(l.qrSize).toBe(400); // max(400, 320)

    localStorage.setItem(KEY, JSON.stringify({ numberFont: 9999, qrSize: 10 }));
    const l2 = getLabelLayout();
    expect(l2.numberFont).toBe(160);
    expect(l2.qrSize).toBe(80);
  });

  it("ignores a throwing localStorage and returns the defaults", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(getLabelLayout()).toEqual(DEFAULT_LAYOUT);
    spy.mockRestore();
  });
});

describe("setLabelLayout", () => {
  it("swallows a throwing setItem", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => setLabelLayout(DEFAULT_LAYOUT)).not.toThrow();
    spy.mockRestore();
  });
});

describe("qrModuleCount", () => {
  it("returns a real QR module count (odd, >= 21) for a normal URL", () => {
    const n = qrModuleCount("https://svc:8481/s/PC-01/job/17503301");
    expect(n).toBeGreaterThanOrEqual(21);
    expect((n - 21) % 4).toBe(0); // QR versions step by 4 modules
  });

  it("falls back to 45 when the data cannot be encoded", () => {
    expect(qrModuleCount("x".repeat(8000))).toBe(45);
  });
});

describe("qrMagFor", () => {
  it.each([
    [45, 208, 4],
    [45, 100, 2],
    [10, 9999, 14], // upper clamp
    [45, 50, 2], // lower clamp (floor would be 1)
  ])("modules=%i target=%i -> mag %i", (modules, target, mag) => {
    expect(qrMagFor(modules, target)).toBe(mag);
  });
});

describe("labelWmm -> dots relationship", () => {
  afterEach(() => localStorage.clear());
  it("multiplies mm by DPMM for the clamp ceiling on positions", () => {
    setLabelLayout({ ...DEFAULT_LAYOUT, labelWmm: 20, labelHmm: 20, numberX: 999, qrSize: 999 });
    const l = getLabelLayout();
    expect(l.numberX).toBe(20 * DPMM); // 160
    expect(l.qrSize).toBe(20 * DPMM); // max(w,h) with w==h
  });
});
