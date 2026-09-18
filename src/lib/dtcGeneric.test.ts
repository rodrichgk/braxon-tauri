import { describe, it, expect } from "vitest";
import {
  dtcRaw,
  dtcBytes,
  saeCode,
  failureTypeText,
  describeDtc,
  GENERIC_DTC,
  FAILURE_TYPE,
} from "@/lib/dtcGeneric";

describe("dtcRaw / dtcBytes", () => {
  it("packs two bytes big-endian and round-trips", () => {
    expect(dtcRaw(0x40, 0x44)).toBe(0x4044);
    expect(dtcRaw(0xc1, 0x39)).toBe(0xc139);
    expect(dtcBytes(0x4044)).toEqual([0x40, 0x44]);
    expect(dtcBytes(dtcRaw(0xab, 0xcd))).toEqual([0xab, 0xcd]);
  });

  it("masks inputs to a byte", () => {
    expect(dtcRaw(0x140, 0x144)).toBe(0x4044);
  });
});

describe("saeCode", () => {
  // code = letter(bits 7-6) . d1(bits 5-4) . d2(low nibble of hi) . d3(hi nibble of lo) . d4(low nibble of lo)
  it.each([
    [0x40, 0x44, "C0044"],
    [0x00, 0x00, "P0000"],
    [0xc0, 0x00, "U0000"], // 11xxxxxx -> U
    [0x80, 0x00, "B0000"], // 10xxxxxx -> B
    [0x51, 0x39, "C1139"], // hi nibble 0x5 -> C + d1=1 ; 0x1 -> d2=1
    [0xd1, 0x0c, "U110C"], // hi nibble 0xD -> U + d1=1
    [0x50, 0xab, "C10AB"],
  ])("0x%s 0x%s -> %s", (hi, lo, code) => {
    expect(saeCode(hi as number, lo as number)).toBe(code);
  });

  it("first two bits select the letter", () => {
    expect(saeCode(0x00, 0)[0]).toBe("P");
    expect(saeCode(0x40, 0)[0]).toBe("C");
    expect(saeCode(0x80, 0)[0]).toBe("B");
    expect(saeCode(0xc0, 0)[0]).toBe("U");
  });
});

describe("failureTypeText", () => {
  it("returns null for null/undefined", () => {
    expect(failureTypeText(null)).toBeNull();
    expect(failureTypeText(undefined)).toBeNull();
  });

  it("looks up known bytes from the ISO 14229 table", () => {
    expect(failureTypeText(0x00)).toBe("no sub-type");
    expect(failureTypeText(0x11)).toBe("circuit short to ground");
    expect(failureTypeText(0x3b)).toBe("component protection fault");
    expect(failureTypeText(0x1c)).toBe("circuit voltage out of range");
  });

  it("falls back to a hex label for an unknown byte", () => {
    expect(failureTypeText(0xfe)).toBe("failure-type 0xFE");
    expect(failureTypeText(0x05)).toBe("failure-type 0x05");
  });

  it("masks to a byte", () => {
    expect(failureTypeText(0x111)).toBe("circuit short to ground");
  });
});

describe("describeDtc", () => {
  it("names a code from the generic table and marks it known", () => {
    const d = describeDtc(0x40, 0x44);
    expect(d).toMatchObject({ code: "C0044", raw: 0x4044, known: true });
    expect(d.text).toBe(GENERIC_DTC.C0044);
  });

  it("appends the failure-type byte when non-zero", () => {
    const d = describeDtc(0x52, 0x10, 0x11); // C1210 + short to ground
    expect(d.code).toBe("C1210");
    expect(d.text).toBe(`${GENERIC_DTC.C1210} · circuit short to ground`);
    expect(d.known).toBe(true);
  });

  it("ignores a zero failure-type byte", () => {
    const d = describeDtc(0x40, 0x44, 0x00);
    expect(d.text).toBe(GENERIC_DTC.C0044);
  });

  it("is manufacturer-specific for an unknown code, still surfacing the ftb", () => {
    const d = describeDtc(0x70, 0x00, 0x13); // C3000 not in the generic table
    expect(d).toMatchObject({ code: "C3000", known: false });
    expect(d.text).toBe("manufacturer-specific · circuit open");
  });

  it("is bare 'manufacturer-specific' with no table hit and no ftb", () => {
    expect(describeDtc(0x70, 0x00).text).toBe("manufacturer-specific");
  });

  it("raw matches dtcRaw of the same bytes", () => {
    expect(describeDtc(0xc1, 0x39).raw).toBe(dtcRaw(0xc1, 0x39));
  });
});

describe("table integrity", () => {
  it("every GENERIC_DTC key is a valid 5-char SAE code", () => {
    for (const key of Object.keys(GENERIC_DTC)) {
      expect(key).toMatch(/^[PCBU][0-9A-F]{4}$/);
    }
  });

  it("FAILURE_TYPE keys are bytes with non-empty text", () => {
    for (const [k, v] of Object.entries(FAILURE_TYPE)) {
      const n = Number(k);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(0xff);
      expect(v.length).toBeGreaterThan(0);
    }
  });
});
