import { describe, it, expect } from "vitest";
import {
  reportHasData,
  computeVerdict,
  type ParsedReport,
  type ValveResult,
  type MotorResult,
  type PressureTestResult,
  type PressureCycle,
} from "@/lib/hydraulicReport";

const valve = (status: ValveResult["status"], label = "Valve 1"): ValveResult => ({ label, status });

const motor = (status: MotorResult["status"]): MotorResult => ({ status, current_amps: 12 });

const cycle = (overrides: Partial<PressureCycle> = {}): PressureCycle => ({
  label: "Cycle",
  passed: true,
  channel_pressures: [10, 10, 10, 10],
  pump_pressure: 100,
  faulted_channels: [],
  ...overrides,
});

const pressure = (overrides: Partial<PressureTestResult> = {}): PressureTestResult => ({
  cycles: [cycle()],
  completed: true,
  faulted_channels: [],
  ...overrides,
});

const empty: ParsedReport = { valves: [], motor: null, pressure: null };

describe("reportHasData", () => {
  it("is false for null and for a fully-empty report", () => {
    expect(reportHasData(null)).toBe(false);
    expect(reportHasData(empty)).toBe(false);
  });

  it("is true when any one of the three sections carries data", () => {
    expect(reportHasData({ ...empty, valves: [valve("ok")] })).toBe(true);
    expect(reportHasData({ ...empty, motor: motor("ok") })).toBe(true);
    expect(reportHasData({ ...empty, pressure: pressure() })).toBe(true);
  });
});

describe("computeVerdict", () => {
  it("returns null when there is nothing to judge", () => {
    expect(computeVerdict(null)).toBeNull();
    expect(computeVerdict(empty)).toBeNull();
  });

  it("PASS: all valves ok/informational, motor ok, pressure completed", () => {
    const r: ParsedReport = {
      valves: [valve("ok"), valve("informational", "Valve 2")],
      motor: motor("ok"),
      pressure: pressure({ completed: true }),
    };
    expect(computeVerdict(r)).toBe("pass");
  });

  it("PASS: a lone informational valve still counts as data and passes", () => {
    expect(computeVerdict({ ...empty, valves: [valve("informational")] })).toBe("pass");
  });

  it("FAIL: a hard valve fault", () => {
    expect(computeVerdict({ ...empty, valves: [valve("ok"), valve("fault", "Valve 3")] })).toBe(
      "fail",
    );
  });

  it("FAIL: an explicitly-failed pressure test (completed === false)", () => {
    expect(computeVerdict({ ...empty, pressure: pressure({ completed: false }) })).toBe("fail");
  });

  it.each<[MotorResult["status"]]>([
    ["warning_low"],
    ["warning_over"],
    ["warning_other"],
    ["unconfirmed"],
  ])("REVIEW: motor status %s", (status) => {
    expect(computeVerdict({ ...empty, motor: motor(status) })).toBe("review");
  });

  it("REVIEW: a marginal valve", () => {
    expect(computeVerdict({ ...empty, valves: [valve("marginal")] })).toBe("review");
  });

  it("REVIEW: a pressure test that never reached its final line (completed === null)", () => {
    expect(computeVerdict({ ...empty, pressure: pressure({ completed: null }) })).toBe("review");
  });

  it("precedence: a hard fault outranks anything ambiguous", () => {
    const r: ParsedReport = {
      valves: [valve("marginal", "Valve 1"), valve("fault", "Valve 2")],
      motor: motor("unconfirmed"),
      pressure: pressure({ completed: null }),
    };
    expect(computeVerdict(r)).toBe("fail");
  });

  it("precedence: review beats pass when a fault is absent", () => {
    const r: ParsedReport = {
      valves: [valve("ok"), valve("marginal", "Valve 2")],
      motor: motor("ok"),
      pressure: pressure({ completed: true }),
    };
    expect(computeVerdict(r)).toBe("review");
  });
});
