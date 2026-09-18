import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getScanServiceUrl,
  setScanServiceUrl,
  getLabelPrinter,
  setLabelPrinter,
  parsePrinterTarget,
  buildScanUrl,
  buildScanToken,
  parseScan,
  SCAN_ENTITIES,
  SCAN_ROUTES,
  type ScanEntity,
} from "@/lib/braxonScan";

const DEFAULT_SERVICE_URL = "https://192.168.77.182:8481";
const DEFAULT_LABEL_PRINTER = "192.168.77.32:9100";

beforeEach(() => {
  localStorage.clear();
});

describe("getScanServiceUrl / setScanServiceUrl", () => {
  it("returns the built-in default when nothing is stored", () => {
    expect(getScanServiceUrl()).toBe(DEFAULT_SERVICE_URL);
  });

  it("round-trips a stored URL and strips trailing slashes on save", () => {
    setScanServiceUrl("https://scan.example:9000///");
    expect(localStorage.getItem("scanServiceUrl")).toBe("https://scan.example:9000");
    expect(getScanServiceUrl()).toBe("https://scan.example:9000");
  });

  it("treats a blank saved value as 'unset' (removes the key, back to default)", () => {
    setScanServiceUrl("https://x");
    setScanServiceUrl("   ");
    expect(localStorage.getItem("scanServiceUrl")).toBeNull();
    expect(getScanServiceUrl()).toBe(DEFAULT_SERVICE_URL);
  });

  it("falls back to the default when a stored value is only whitespace", () => {
    localStorage.setItem("scanServiceUrl", "    ");
    expect(getScanServiceUrl()).toBe(DEFAULT_SERVICE_URL);
  });

  describe("with a hostile localStorage", () => {
    afterEach(() => vi.restoreAllMocks());

    it("getScanServiceUrl swallows a throwing getItem and returns the default", () => {
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("denied");
      });
      expect(getScanServiceUrl()).toBe(DEFAULT_SERVICE_URL);
    });

    it("setScanServiceUrl swallows a throwing setItem", () => {
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("quota");
      });
      expect(() => setScanServiceUrl("https://x")).not.toThrow();
    });
  });
});

describe("getLabelPrinter / setLabelPrinter", () => {
  it("returns the default only when the key was never set", () => {
    expect(getLabelPrinter()).toBe(DEFAULT_LABEL_PRINTER);
  });

  it("keeps a deliberately-blank saved value as 'no printer, use PDF'", () => {
    setLabelPrinter("");
    expect(localStorage.getItem("braxonLabelPrinter")).toBe("");
    expect(getLabelPrinter()).toBe("");
  });

  it("trims on save and on read", () => {
    setLabelPrinter("  10.0.0.9:9100  ");
    expect(getLabelPrinter()).toBe("10.0.0.9:9100");
  });
});

describe("parsePrinterTarget", () => {
  it("defaults the port to 9100 when only a host is given", () => {
    expect(parsePrinterTarget("192.168.1.5")).toEqual({ host: "192.168.1.5", port: 9100 });
  });

  it("parses host:port", () => {
    expect(parsePrinterTarget("printer.local:6101")).toEqual({ host: "printer.local", port: 6101 });
  });

  it("rejects an out-of-range or zero port", () => {
    expect(parsePrinterTarget("host:0")).toBeNull();
    expect(parsePrinterTarget("host:99999")).toBeNull();
  });

  it("rejects malformed targets", () => {
    expect(parsePrinterTarget("")).toBeNull();
    expect(parsePrinterTarget("has space")).toBeNull();
    expect(parsePrinterTarget("host:12:34")).toBeNull();
    expect(parsePrinterTarget("http://host:9100")).toBeNull();
  });
});

describe("SCAN_ENTITIES / SCAN_ROUTES", () => {
  it("routes each entity to a page", () => {
    expect(SCAN_ENTITIES).toEqual(["job", "abs", "stock"]);
    expect(SCAN_ROUTES).toEqual({ job: "reman", abs: "signal", stock: "reman" });
  });
});

describe("buildScanToken", () => {
  it("builds the compact offline form", () => {
    expect(buildScanToken("abs", "10.0961-1464.3")).toBe("braxon:abs:10.0961-1464.3");
  });
});

describe("buildScanUrl", () => {
  it("assembles /s/<pcId>/<entity>/<key> with a percent-encoded label", () => {
    const url = buildScanUrl("https://svc:8481", "PC-01", "job", "17503301", "ACME (X95)");
    expect(url).toBe("https://svc:8481/s/PC-01/job/17503301?label=ACME%20(X95)");
  });

  it("strips a trailing slash from the base and encodes pcId + key", () => {
    const url = buildScanUrl("https://svc/", "PC 1", "stock", "a/b c");
    expect(url).toBe("https://svc/s/PC%201/stock/a%2Fb%20c");
  });

  it("caps the label at 200 chars before encoding", () => {
    const url = buildScanUrl("https://svc", "PC", "abs", "K", "x".repeat(500));
    const label = new URL(url).searchParams.get("label")!;
    expect(label).toHaveLength(200);
  });

  it("omits the query entirely when no label is given", () => {
    expect(buildScanUrl("https://svc", "PC", "abs", "K")).toBe("https://svc/s/PC/abs/K");
  });
});

describe("parseScan — bare token form", () => {
  it("parses braxon:<entity>:<key>", () => {
    expect(parseScan("braxon:job:17503301")).toEqual({ entity: "job", key: "17503301" });
  });

  it("lower-cases the entity and trims the key", () => {
    expect(parseScan("BRAXON:ABS:  KEY123  ")).toEqual({ entity: "abs", key: "KEY123" });
  });

  it("keeps colons that belong to the key", () => {
    expect(parseScan("braxon:stock:a:b:c")).toEqual({ entity: "stock", key: "a:b:c" });
  });

  it("rejects an unknown entity in token form", () => {
    expect(parseScan("braxon:widget:123")).toBeNull();
  });
});

describe("parseScan — URL form", () => {
  it("parses a full scan-service URL with a label", () => {
    expect(parseScan("https://svc:8481/s/PC-01/abs/KEY?label=Hello%20World")).toEqual({
      entity: "abs",
      key: "KEY",
      pcId: "PC-01",
      label: "Hello World",
    });
  });

  it("decodes a percent-encoded pcId and key", () => {
    expect(parseScan("https://svc/s/PC%201/job/a%2Fb")).toEqual({
      entity: "job",
      key: "a/b",
      pcId: "PC 1",
    });
  });

  it("returns null when the path root is not /s/", () => {
    expect(parseScan("https://svc/x/PC/abs/KEY")).toBeNull();
  });

  it("returns null for an unknown entity segment", () => {
    expect(parseScan("https://svc/s/PC/widget/KEY")).toBeNull();
  });

  it("returns null when a segment is missing (trailing slash / empty key)", () => {
    expect(parseScan("https://svc/s/PC/abs/")).toBeNull();
    expect(parseScan("https://svc/s/PC/abs")).toBeNull();
  });

  it("returns null when there are extra path segments", () => {
    expect(parseScan("https://svc/s/PC/abs/KEY/extra")).toBeNull();
  });

  it("returns null for a non-URL string", () => {
    expect(parseScan("not a url at all")).toBeNull();
    expect(parseScan("")).toBeNull();
    expect(parseScan("   ")).toBeNull();
  });
});

describe("buildScanUrl -> parseScan round-trip", () => {
  it.each<[ScanEntity, string, string | undefined]>([
    ["job", "17503301", "ACME Corp (Renault X95)"],
    ["abs", "10.0961-1464.3", undefined],
    ["stock", "weird key / with spaces & symbols", "lbl"],
  ])("%s / %s", (entity, key, label) => {
    const url = buildScanUrl("https://svc:8481", "PC-77", entity, key, label);
    expect(parseScan(url)).toEqual({
      entity,
      key,
      pcId: "PC-77",
      ...(label ? { label } : {}),
    });
  });
});
