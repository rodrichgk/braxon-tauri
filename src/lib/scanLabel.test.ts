import { describe, it, expect, beforeEach, vi } from "vitest";
import type { LabelLayout } from "@/lib/labelLayout";

// scanLabel builds a jsPDF page the exact size of the label and drops the
// shared raster onto it. We assert the page geometry / orientation math and
// the addImage/autoPrint/save wiring — never the PDF bytes (docs/TESTING.md §6).

interface FakeDoc {
  opts: unknown;
  calls: Array<{ fn: string; args: unknown[] }>;
}

const h = vi.hoisted(() => ({
  renderLabelCanvas: vi.fn(() => ({ toDataURL: () => "data:image/png;base64,STUB" })),
  docs: [] as FakeDoc[],
}));

vi.mock("@/lib/labelRaster", () => ({ renderLabelCanvas: h.renderLabelCanvas }));

vi.mock("jspdf", () => {
  class FakeJsPDF {
    opts: unknown;
    calls: Array<{ fn: string; args: unknown[] }> = [];
    constructor(opts: unknown) {
      this.opts = opts;
      h.docs.push(this as unknown as FakeDoc);
    }
    addImage(...args: unknown[]) {
      this.calls.push({ fn: "addImage", args });
    }
    autoPrint(...args: unknown[]) {
      this.calls.push({ fn: "autoPrint", args });
    }
    save(...args: unknown[]) {
      this.calls.push({ fn: "save", args });
    }
  }
  return { jsPDF: FakeJsPDF, default: FakeJsPDF };
});

import { printScanLabel } from "@/lib/scanLabel";

const layout = (w: number, ht: number): LabelLayout => ({
  labelWmm: w,
  labelHmm: ht,
  numberX: 10,
  numberY: 10,
  numberFont: 40,
  qrX: 10,
  qrY: 10,
  qrSize: 200,
});

beforeEach(() => {
  h.docs.length = 0;
  h.renderLabelCanvas.mockClear();
});

describe("printScanLabel", () => {
  it("uses landscape + [short, long] format when the label is wider than tall", async () => {
    await printScanLabel({ value: "https://x", jobNumber: "J1", filename: "scan-J1" }, layout(50, 40));
    expect(h.docs).toHaveLength(1);
    expect(h.docs[0].opts).toEqual({ orientation: "landscape", unit: "mm", format: [40, 50] });
  });

  it("uses portrait when the label is taller than wide", async () => {
    await printScanLabel({ value: "https://x", jobNumber: "J1", filename: "f" }, layout(30, 60));
    expect(h.docs[0].opts).toEqual({ orientation: "portrait", unit: "mm", format: [30, 60] });
  });

  it("draws the raster PNG at the label's mm size, then autoPrints and saves", async () => {
    await printScanLabel({ value: "https://x", jobNumber: "J1", filename: "scan-J1" }, layout(50, 40));
    const seq = h.docs[0].calls.map((c) => c.fn);
    expect(seq).toEqual(["addImage", "autoPrint", "save"]);
    expect(h.docs[0].calls[0].args).toEqual(["data:image/png;base64,STUB", "PNG", 0, 0, 50, 40]);
    expect(h.docs[0].calls[2].args).toEqual(["scan-J1.pdf"]);
  });

  it("collapses whitespace in the job number + value and truncates the job number to 24", async () => {
    await printScanLabel(
      { value: "  https://x\n\ty  ", jobNumber: "  " + "A".repeat(40) + "  ", filename: "f" },
      layout(50, 40),
    );
    const call = h.renderLabelCanvas.mock.calls[0] as unknown as [LabelLayout, string, string];
    expect(call[1]).toBe("A".repeat(24));
    expect(call[2]).toBe("https://x y");
  });
});
