import { describe, it, expect } from "vitest";
import {
  normalizeAbsRef,
  guessHardwareFamily,
  parseCanId,
  toHex3,
  protocolFromDb,
  isObdAddress,
  defaultProtocolFor,
  resolveSaveProtocol,
  resolveManualDtcEcuFile,
  brandFromManufacturer,
} from "@/lib/ecu";

// Reference / template test: pure functions, table-driven, no mocks. New
// src/lib suites should look roughly like this. See docs/TESTING.md.

describe("normalizeAbsRef", () => {
  it("strips dots, spaces and dashes and upper-cases", () => {
    expect(normalizeAbsRef("10.0961-1464.3")).toBe("10096114643");
    expect(normalizeAbsRef("0 265 231 456")).toBe("0265231456");
    expect(normalizeAbsRef("abc-1")).toBe("ABC1");
  });

  it("is idempotent", () => {
    const once = normalizeAbsRef("10.0961-1464.3");
    expect(normalizeAbsRef(once)).toBe(once);
  });
});

describe("guessHardwareFamily", () => {
  it.each([
    ["10.0961-1464.3", "MK61"],
    ["10.0960-0000.0", "MK60"],
    ["10.0970-1234.5", "MK70"],
    ["10.0200-1111.2", "MK20"],
    ["0 265 950 001", "Bosch Gen 9"],
    ["0 265 231 999", "Bosch 8.x"],
    ["0 265 089 123", "Bosch 8.0"],
  ])("%s -> %s", (pn, family) => {
    expect(guessHardwareFamily(pn)).toBe(family);
  });

  it("returns null for an unknown pattern", () => {
    expect(guessHardwareFamily("99.9999-0000.0")).toBeNull();
    expect(guessHardwareFamily("")).toBeNull();
  });
});

describe("parseCanId", () => {
  it("accepts 0x-prefixed, bare hex and padded strings", () => {
    expect(parseCanId("0x740")).toBe(0x740);
    expect(parseCanId("740")).toBe(0x740);
    expect(parseCanId("  740 ")).toBe(0x740);
  });

  it("rejects out-of-range and garbage as null", () => {
    expect(parseCanId("800")).toBeNull(); // > 0x7ff
    expect(parseCanId("-1")).toBeNull();
    expect(parseCanId("zzz")).toBeNull();
    expect(parseCanId(null)).toBeNull();
    expect(parseCanId(undefined)).toBeNull();
    expect(parseCanId("")).toBeNull();
  });
});

describe("toHex3", () => {
  it("upper-cases and zero-pads to 3", () => {
    expect(toHex3(0x7)).toBe("007");
    expect(toHex3(0x740)).toBe("740");
    expect(toHex3(0x7df)).toBe("7DF");
  });
});

describe("protocolFromDb", () => {
  it.each([
    ["VWTP2.0", "VWTP20"],
    ["TP20", "VWTP20"],
    ["KWP2000", "KWP2000"],
    ["UDS", "UDS"],
    ["ISO15765", "UDS"],
  ])("%s -> %s", (input, expected) => {
    expect(protocolFromDb(input)).toBe(expected);
  });

  it("is null for empty / unknown", () => {
    expect(protocolFromDb(null)).toBeNull();
    expect(protocolFromDb("something else")).toBeNull();
  });
});

describe("isObdAddress / defaultProtocolFor", () => {
  it("recognises the broadcast + 8 ECU slots", () => {
    expect(isObdAddress(0x7df)).toBe(true);
    expect(isObdAddress(0x7e0)).toBe(true);
    expect(isObdAddress(0x7e7)).toBe(true);
    expect(isObdAddress(0x7e8)).toBe(false);
    expect(isObdAddress(0x740)).toBe(false);
    expect(isObdAddress(null)).toBe(false);
  });

  it("defaults OBD range to OBD2 and everything else to KWP2000", () => {
    expect(defaultProtocolFor(0x7df)).toBe("OBD2");
    expect(defaultProtocolFor(0x740)).toBe("KWP2000");
    expect(defaultProtocolFor(null)).toBeNull();
  });
});

describe("brandFromManufacturer", () => {
  it.each([
    ["Renault SAS", "Renault"],
    ["DACIA", "Renault"],
    ["Nissan Motor", "Nissan"],
    ["Mitsubishi", "Mitsubishi"],
  ])("%s -> %s", (input, expected) => {
    expect(brandFromManufacturer(input)).toBe(expected);
  });

  it("returns null rather than guessing 'Other'", () => {
    expect(brandFromManufacturer("Volkswagen")).toBeNull();
    expect(brandFromManufacturer(null)).toBeNull();
  });
});

describe("resolveSaveProtocol", () => {
  it("prefers the technician's live protocol selection over the discovery probe's guess", () => {
    // e.g. the probe read a short response and guessed KWP2000, but the
    // operator then switched to UDS by hand and it actually worked.
    expect(resolveSaveProtocol("UDS", "KWP2000")).toBe("UDS");
  });

  it("falls back to the probed value when there is no live selection", () => {
    expect(resolveSaveProtocol(null, "KWP2000")).toBe("KWP2000");
    expect(resolveSaveProtocol(undefined, "UDS")).toBe("UDS");
  });

  it("is null when neither side knows the protocol", () => {
    expect(resolveSaveProtocol(null, null)).toBeNull();
  });

  it("keeps the live selection even when the probe found nothing at all", () => {
    expect(resolveSaveProtocol("OBD2", null)).toBe("OBD2");
  });
});

describe("resolveManualDtcEcuFile", () => {
  it("uses the DDT4ALL ecu_file when the unit is linked to one", () => {
    expect(resolveManualDtcEcuFile("UDS", "PSA_ABS", "0265244185")).toBe("PSA_ABS");
  });

  it("falls back to the normalised ABS reference when there is no DDT4ALL link", () => {
    // e.g. 476601KD2A — no DDT4ALL file, no recognisable hardware family;
    // the ABS reference is the only thing left to key the row on.
    expect(resolveManualDtcEcuFile("UDS", null, "476601KD2A")).toBe("476601KD2A");
    expect(resolveManualDtcEcuFile(null, undefined, "4766.01-KD2.A")).toBe("476601KD2A");
  });

  it("always uses VAG_WIKI on the VW TP2.0 tab, same as the scan-time lookup", () => {
    // VW TP2.0 DTCs are the VAG 5-digit number on the wire — VAG_WIKI is
    // already the shared table every VWTP20 scan resolves descriptions
    // from, DDT4ALL link or not.
    expect(resolveManualDtcEcuFile("VWTP20", "SOME_OTHER_FILE", "1J0907379")).toBe("VAG_WIKI");
  });

  it("is null when there is truly nothing to key on", () => {
    expect(resolveManualDtcEcuFile("UDS", null, null)).toBeNull();
    expect(resolveManualDtcEcuFile("UDS", null, "")).toBeNull();
    expect(resolveManualDtcEcuFile("UDS", null, "...")).toBeNull(); // strips to nothing
  });
});
