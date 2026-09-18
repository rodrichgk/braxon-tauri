import { describe, it, expect } from "vitest";
import {
  CALIBRATE,
  SAVE_SETTINGS,
  HOST_INFO,
  HOST_STATUS,
  resetPrintPosition,
  setPrintPosition,
  alignmentTest,
} from "@/lib/zebra";

describe("static Zebra commands", () => {
  it("are the documented ZPL control strings", () => {
    expect(CALIBRATE).toBe("~JC");
    expect(SAVE_SETTINGS).toBe("^XA^JUS^XZ");
    expect(HOST_INFO).toBe("~HI");
    expect(HOST_STATUS).toBe("~HS");
  });
});

describe("resetPrintPosition", () => {
  it("zeroes the offsets and restores the label size, rounding dots", () => {
    expect(resetPrintPosition(812.4, 1218.6)).toBe(
      "^XA^LH0,0^LT0^LS0^PW812^LL1219^JUS^XZ",
    );
  });
});

describe("setPrintPosition", () => {
  it("clamps top to ±120 and left to ±9999 and rounds", () => {
    expect(setPrintPosition(10, -20)).toBe("^XA^LT10^LS-20^JUS^XZ");
    expect(setPrintPosition(999, 50000)).toBe("^XA^LT120^LS9999^JUS^XZ");
    expect(setPrintPosition(-999, -50000)).toBe("^XA^LT-120^LS-9999^JUS^XZ");
    expect(setPrintPosition(10.6, 4.4)).toBe("^XA^LT11^LS4^JUS^XZ");
  });
});

describe("alignmentTest", () => {
  const zpl = alignmentTest(800, 1200);

  it("is a complete label wrapped in ^XA … ^XZ", () => {
    expect(zpl.startsWith("^XA")).toBe(true);
    expect(zpl.trimEnd().endsWith("^XZ")).toBe(true);
  });

  it("sets the print width/length and draws an outer border + four corner boxes", () => {
    expect(zpl).toContain("^PW800");
    expect(zpl).toContain("^LL1200");
    expect(zpl).toContain("^FO0,0^GB800,1200,4^FS"); // outer border
    // corner boxes at each corner (c = 48)
    expect(zpl).toContain("^FO0,0^GB48,48,4^FS");
    expect(zpl).toContain("^FO752,0^GB48,48,4^FS");
    expect(zpl).toContain("^FO0,1152^GB48,48,4^FS");
    expect(zpl).toContain("^FO752,1152^GB48,48,4^FS");
  });

  it("centres the ALIGN OK caption", () => {
    expect(zpl).toContain("^FO328,585^A0N,30,30^FDALIGN OK^FS");
  });

  it("rounds fractional dimensions", () => {
    expect(alignmentTest(799.6, 1199.4)).toContain("^PW800");
    expect(alignmentTest(799.6, 1199.4)).toContain("^LL1199");
  });
});
