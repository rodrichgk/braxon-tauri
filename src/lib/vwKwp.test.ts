import { describe, it, expect } from "vitest";
import {
  decodeVwDtcs,
  decodeVwMeasuringBlock,
  vwAscii,
  parseVwIdent,
  CLEAR_ALL_DTC_REQUEST,
} from "@/lib/vwKwp";

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

describe("CLEAR_ALL_DTC_REQUEST", () => {
  it("uses group FF 00, not FF FF — confirmed against a real bus capture", () => {
    // ref 10.0961-0315.3, 2026-09-15: the ECU answered a run of `7F 14 78`
    // (responsePending) then a positive `54 FF 00`, echoing this exact
    // group back. FF FF was never verified against real hardware.
    expect(CLEAR_ALL_DTC_REQUEST).toEqual([0x14, 0xff, 0x00]);
  });
});

describe("decodeVwDtcs", () => {
  it("returns [] when the payload is not a 58 response", () => {
    expect(decodeVwDtcs([0x7f, 0x18, 0x11])).toEqual([]);
    expect(decodeVwDtcs([])).toEqual([]);
  });

  it("reads (hi<<8)|lo as the verbatim VAG 5-digit code", () => {
    // 58 02  3F E0 EE   40 00 60
    const dtcs = decodeVwDtcs([0x58, 0x02, 0x3f, 0xe0, 0xee, 0x40, 0x00, 0x60]);
    expect(dtcs).toHaveLength(2);
    expect(dtcs[0]).toMatchObject({
      raw: 0x3fe0,
      code: "16352",
      elaboration: 14, // (0xEE & 0x7F) - 0x60
      elaborationText: "defective",
      present: true, // status bit 7
      status: 0xee,
    });
    expect(dtcs[1]).toMatchObject({ raw: 0x4000, code: "16384", present: false });
  });

  it("zero-pads short codes to 5 digits", () => {
    const [d] = decodeVwDtcs([0x58, 0x01, 0x00, 0x2a, 0x60]);
    expect(d.code).toBe("00042");
  });

  it("stops at a truncated final record", () => {
    expect(decodeVwDtcs([0x58, 0x02, 0x3f, 0xe0])).toEqual([]); // missing status byte
  });
});

describe("decodeVwMeasuringBlock", () => {
  it("returns null when not a 61 response", () => {
    expect(decodeVwMeasuringBlock([0x7f, 0x21, 0x11])).toBeNull();
  });

  it("decodes block 01 = 0 km/h at rest (formula 0x07, verified)", () => {
    const res = decodeVwMeasuringBlock([0x61, 0x01, 0x07, 0x00, 0x00]);
    expect(res).toMatchObject({ slot: 1 });
    expect(res!.values[0]).toMatchObject({ fmt: 0x07, a: 0, b: 0, value: 0, unit: "km/h" });
  });

  it("decodes the supply-voltage formula 0x06 (a*b*0.001 V)", () => {
    const res = decodeVwMeasuringBlock([0x61, 0x06, 0x06, 0x0a, 0xc4]);
    expect(res!.values[0].value).toBeCloseTo(10 * 196 * 0.001, 5);
    expect(res!.values[0].unit).toBe("V");
  });

  it("renders bitfield formula 0x10 as an 8-bit string", () => {
    const res = decodeVwMeasuringBlock([0x61, 0x09, 0x10, 0x00, 0b10100101]);
    expect(res!.values[0].value).toBe("10100101");
  });

  it("falls back to (a<<8)|b + fmtNN unit for an unknown formula", () => {
    const res = decodeVwMeasuringBlock([0x61, 0x02, 0x99, 0x12, 0x34]);
    expect(res!.values[0]).toMatchObject({ value: 0x1234, unit: "fmt99" });
  });

  it("reads up to four triplets and ignores a trailing partial", () => {
    const res = decodeVwMeasuringBlock([0x61, 0x03, 0x07, 0, 10, 0x07, 0, 20, 0x07, 0, 30, 0x07, 0]);
    expect(res!.values).toHaveLength(3);
  });
});

describe("vwAscii", () => {
  it("keeps printable ASCII and maps the rest to '·'", () => {
    expect(vwAscii([0x41, 0x42, 0x00, 0x7f, 0x20])).toBe("AB·· ");
    expect(vwAscii(ascii("1J0907379"))).toBe("1J0907379");
  });
});

describe("parseVwIdent", () => {
  it("pulls named fields out of a 62 multi-DID response", () => {
    const payload = [
      0x62,
      0xf1, 0x87, ...ascii("1K0907379"),
      0xf1, 0x89, ...ascii("0398"),
      0x00, // trailing pad so the last field's bytes are all consumed
    ];
    const ident = parseVwIdent(payload);
    expect(ident.partNumber).toBe("1K0907379");
    expect(ident.swVersion).toBe("0398");
  });

  it("returns {} for a non-62 payload or an unknown leading DID", () => {
    expect(parseVwIdent([0x7f, 0x22, 0x31])).toEqual({});
    expect(parseVwIdent([0x62, 0x12, 0x34, 0x00])).toEqual({});
  });
});
