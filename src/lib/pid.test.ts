import { describe, it, expect } from "vitest";
import { PidController } from "@/lib/pid";

const gains = { kp: 10, ki: 2, kd: 1 };

describe("PidController", () => {
  it("drives output toward the setpoint for a positive error", () => {
    const pid = new PidController({ ...gains, outputLimit: 800 });
    const step = pid.update(100, 90, 0.1); // error = +10
    expect(step.error).toBe(10);
    expect(step.p).toBe(100); // kp * error
    expect(step.output).toBeGreaterThan(0);
  });

  it("clamps output symmetrically to outputLimit", () => {
    const pid = new PidController({ ...gains, outputLimit: 50 });
    const up = pid.update(1000, 0, 0.1);
    expect(up.output).toBe(50);
    expect(up.saturated).toBe(true);

    const pid2 = new PidController({ ...gains, outputLimit: 50 });
    const down = pid2.update(0, 1000, 0.1);
    expect(down.output).toBe(-50);
    expect(down.saturated).toBe(true);
  });

  it("clamps dt into [minDt, maxDt] so a stalled stream can't spike the derivative", () => {
    const pid = new PidController({ ...gains, outputLimit: 10_000, minDt: 0.02, maxDt: 1 });
    pid.update(100, 100, 0.1); // prime
    const huge = pid.update(100, 90, 999); // dt clamped to 1.0
    const same = new PidController({ ...gains, outputLimit: 10_000, minDt: 0.02, maxDt: 1 });
    same.update(100, 100, 0.1);
    const ref = same.update(100, 90, 1.0);
    expect(huge.output).toBeCloseTo(ref.output, 6);
  });

  it("anti-windup: integral is frozen while the output is railed and error pushes further in", () => {
    const pid = new PidController({ kp: 1, ki: 10, kd: 0, outputLimit: 100, integralLimit: 500 });
    // Sustained +50 error: P alone (=50) plus one integral step (=50) hits the
    // 100 rail on frame 1, so from frame 2 on the integral must stop growing.
    let last = pid.update(50, 0, 0.1);
    for (let k = 0; k < 30; k++) last = pid.update(50, 0, 0.1);
    expect(last.output).toBe(100);
    expect(last.saturated).toBe(true);
    // Held at its frame-1 value, nowhere near integralLimit (500).
    expect(last.i).toBe(50);
  });

  it("derivative-on-measurement does not kick on a setpoint step", () => {
    const pid = new PidController({ kp: 0, ki: 0, kd: 100, outputLimit: 10_000, derivativeOnMeasurement: true });
    pid.update(0, 0, 0.1); // prime with measurement 0
    const afterSetpointStep = pid.update(500, 0, 0.1); // setpoint jumps, measurement steady
    expect(afterSetpointStep.d).toBeCloseTo(0, 10); // ±0, no derivative kick
  });

  it("reset() wipes integral + derivative history", () => {
    const pid = new PidController({ ...gains, outputLimit: 800 });
    for (let k = 0; k < 5; k++) pid.update(100, 0, 0.1);
    pid.reset();
    const fresh = pid.update(100, 100, 0.1); // zero error right after reset
    expect(fresh.i).toBe(0);
    expect(fresh.d).toBe(0);
  });

  it("tolerates a non-finite dt", () => {
    const pid = new PidController({ ...gains, outputLimit: 800 });
    const step = pid.update(100, 90, Number.NaN);
    expect(Number.isFinite(step.output)).toBe(true);
  });
});
