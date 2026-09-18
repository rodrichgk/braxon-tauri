import { describe, it, expect } from "vitest";
import {
  emptyEcuReportDraft,
  ecuReportHasData,
  activeDtcCount,
  curveIssues,
  peakCurrent,
  computeEcuVerdict,
  ecuReasonSummary,
  type EcuReportDraft,
  type EcuDtcSnapshot,
  type WheelCurvePoint,
} from "@/lib/ecuReport";

const snapshot = (over: Partial<EcuDtcSnapshot> = {}): EcuDtcSnapshot => ({
  timestamp: "2026-01-01T00:00:00Z",
  protocol: "UDS",
  brand: "Renault",
  codes: [],
  gotPositive: true,
  ...over,
});

const point = (over: Partial<WheelCurvePoint> = {}): WheelCurvePoint => ({
  speedKmh: 50,
  fl: 50,
  fr: 50,
  rl: 50,
  rr: 50,
  currentA: null,
  ...over,
});

const draft = (over: Partial<EcuReportDraft> = {}): EcuReportDraft => ({
  ...emptyEcuReportDraft(),
  ...over,
});

describe("emptyEcuReportDraft", () => {
  it("has four unassigned WSS channels and no data", () => {
    const d = emptyEcuReportDraft();
    expect(d.wssChannels.map((c) => c.wheel)).toEqual(["FL", "FR", "RL", "RR"]);
    expect(d.wssChannels.every((c) => !c.assigned)).toBe(true);
    expect(d.can).toBeNull();
    expect(d.dtc).toBeNull();
    expect(d.curve).toEqual([]);
    expect(ecuReportHasData(d)).toBe(false);
  });
});

describe("ecuReportHasData", () => {
  it("is false for null and an empty draft", () => {
    expect(ecuReportHasData(null)).toBe(false);
    expect(ecuReportHasData(emptyEcuReportDraft())).toBe(false);
  });

  it.each<[string, Partial<EcuReportDraft>]>([
    ["an ABS ref", { ident: { absRef: "10.0961-1464.3" } }],
    ["an ECU name", { ident: { ecuName: "ABS X95" } }],
    ["a DTC snapshot", { dtc: snapshot() }],
    ["CAN seen", { can: { seen: true, frameCount: 1, uniqueIds: 1 } }],
    ["a curve reading", { curve: [point({ currentA: 12 })] }],
    ["a manual current", { manual: { currentPeakA: 30 } }],
    ["manual notes", { manual: { notes: "hi" } }],
  ])("is true when there is %s", (_label, over) => {
    expect(ecuReportHasData(draft(over))).toBe(true);
  });
});

describe("activeDtcCount", () => {
  it("is 0 for null", () => {
    expect(activeDtcCount(null)).toBe(0);
  });

  it("counts codes with no status or with bit 0/3 set (testFailed|confirmed)", () => {
    const dtc = snapshot({
      codes: [
        { code: "C1", description: "", rawValue: 1 }, // no status -> counts
        { code: "C2", description: "", rawValue: 2, udsStatus: 0x09 }, // counts
        { code: "C3", description: "", rawValue: 3, udsStatus: 0x08 }, // counts (bit 3)
        { code: "C4", description: "", rawValue: 4, udsStatus: 0x01 }, // counts (bit 0)
        { code: "C5", description: "", rawValue: 5, udsStatus: 0x00 }, // pending/historic -> no
        { code: "C6", description: "", rawValue: 6, udsStatus: 0x04 }, // no
      ],
    });
    expect(activeDtcCount(dtc)).toBe(4);
  });
});

describe("curveIssues", () => {
  it("flags a wheel off commanded speed by >15% and >=3 km/h", () => {
    const issues = curveIssues([point({ speedKmh: 50, fl: 50, fr: 40, rl: 50, rr: 50 })]);
    expect(issues).toEqual([{ wheel: "FR", speedKmh: 50, readback: 40, expected: 50 }]);
  });

  it("does not flag small absolute deltas near zero", () => {
    // 2 km/h off 10 -> 20% but < 3 km/h absolute
    expect(curveIssues([point({ speedKmh: 10, fl: 10, fr: 8, rl: 10, rr: 10 })])).toEqual([]);
  });

  it("ignores null readings and non-positive commanded speed", () => {
    expect(curveIssues([point({ speedKmh: 0, fl: 999, fr: null, rl: null, rr: null })])).toEqual([]);
    expect(curveIssues([point({ speedKmh: 50, fl: null, fr: null, rl: null, rr: null })])).toEqual([]);
  });
});

describe("peakCurrent", () => {
  it("takes the max of the manual value and the curve peak", () => {
    expect(peakCurrent(draft({ manual: { currentPeakA: 20 }, curve: [point({ currentA: 35 })] }))).toBe(35);
    expect(peakCurrent(draft({ manual: { currentPeakA: 40 }, curve: [point({ currentA: 35 })] }))).toBe(40);
  });

  it("falls back to whichever side is present, else null", () => {
    expect(peakCurrent(draft({ manual: { currentPeakA: 12 } }))).toBe(12);
    expect(peakCurrent(draft({ curve: [point({ currentA: 8 }), point({ currentA: 15 })] }))).toBe(15);
    expect(peakCurrent(draft())).toBeNull();
  });
});

describe("computeEcuVerdict", () => {
  it("is null without data", () => {
    expect(computeEcuVerdict(emptyEcuReportDraft())).toBeNull();
  });

  it("a manual override always wins", () => {
    const d = draft({ dtc: snapshot({ codes: [{ code: "C1", description: "", rawValue: 1 }] }), manual: { verdictOverride: "pass" } });
    expect(computeEcuVerdict(d)).toBe("pass");
  });

  it("FAILs on an active fault", () => {
    const d = draft({ dtc: snapshot({ codes: [{ code: "C1391", description: "", rawValue: 1, udsStatus: 0x09 }] }) });
    expect(computeEcuVerdict(d)).toBe("fail");
  });

  it("REVIEWs when the ECU was not identified", () => {
    const d = draft({ dtc: snapshot(), ident: {} });
    expect(computeEcuVerdict(d)).toBe("review");
  });

  it("REVIEWs on no CAN traffic / over-current / low voltage", () => {
    expect(
      computeEcuVerdict(draft({ ident: { ecuName: "X" }, can: { seen: false, frameCount: 0, uniqueIds: 0 } })),
    ).toBe("review");
    expect(
      computeEcuVerdict(draft({ ident: { ecuName: "X" }, manual: { currentPeakA: 90, currentSpecMaxA: 60 } })),
    ).toBe("review");
    expect(
      computeEcuVerdict(draft({ ident: { ecuName: "X" }, manual: { voltageV: 10, voltageSpecMinV: 12 } })),
    ).toBe("review");
  });

  it("PASSes only when reached, clean, and in spec", () => {
    const d = draft({
      ident: { ecuName: "ABS X95" },
      can: { seen: true, frameCount: 100, uniqueIds: 8 },
      dtc: snapshot({ gotPositive: true }),
      manual: { currentPeakA: 30, currentSpecMaxA: 60, currentSpecMinA: 10, voltageV: 13.5, voltageSpecMinV: 12 },
      curve: [point()],
    });
    expect(computeEcuVerdict(d)).toBe("pass");
  });
});

describe("ecuReasonSummary", () => {
  it("is empty without data", () => {
    expect(ecuReasonSummary(null)).toBe("");
    expect(ecuReasonSummary(emptyEcuReportDraft())).toBe("");
  });

  it("lists active fault codes", () => {
    const d = draft({
      dtc: snapshot({
        codes: [
          { code: "C1391", description: "", rawValue: 1, udsStatus: 0x09 },
          { code: "C1235", description: "", rawValue: 2, udsStatus: 0x01 },
        ],
      }),
    });
    expect(ecuReasonSummary(d)).toContain("2 active fault codes — C1391, C1235");
  });

  it("summarises a clean reached ECU when nothing notable is set", () => {
    // Only an ECU name -> hasData true, but no dtc/can/current/voltage/curve
    // pushes anything, so the all-clear sentence is returned.
    expect(ecuReasonSummary(draft({ ident: { ecuName: "ABS X95" } }))).toMatch(/clean/i);
  });

  it("notes when no CAN traffic was seen and the ECU is unidentified", () => {
    const d = draft({ can: { seen: false, frameCount: 0, uniqueIds: 0 }, dtc: snapshot({ gotPositive: true }) });
    const summary = ecuReasonSummary(d);
    expect(summary).toContain("no CAN traffic seen");
    expect(summary).toContain("ECU not identified");
  });
});
