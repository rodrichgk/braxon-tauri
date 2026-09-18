// A small, dependency-free PID controller.
//
// Written for the F2-EVO hydraulic bench pre-charge loop (see
// HydraulicBenchDashboard.tsx): the original .NET app regulated pump
// pressure toward the loaded unit's working / master-cylinder pressure with
// a fixed ±5 bar deadband and a constant 800-step jog either way — plain
// bang-bang. This replaces that inner correction with a real PID whose
// output is a signed "step count" the caller turns into a `Step:<n>;<dir>`
// command.
//
// Design notes:
//  - Discrete, irregular sample interval: `update()` takes the actual `dt`
//    (seconds) since the previous call and clamps it to a sane window, so a
//    stalled telemetry stream can't produce a huge derivative spike or
//    integral jump on the frame it resumes.
//  - Derivative on the *measurement*, not the error (default). For a fixed
//    setpoint the two differ only in sign; the point is that if the
//    setpoint is ever stepped, the derivative term doesn't kick.
//  - Anti-windup: the integral term is accumulated in *output units*
//    (`iTerm += ki * error * dt`) and hard-clamped to `integralLimit`; on
//    top of that, if the total output is already saturated and the error
//    would push the integral further into saturation, that frame's integral
//    growth is rolled back (conditional integration).
//  - `output` is clamped symmetrically to `outputLimit`.

export interface PidGains {
  /** Proportional gain — output units per unit of error. */
  kp: number;
  /** Integral gain — output units per (unit of error · second). */
  ki: number;
  /** Derivative gain — output units per (unit of error / second). */
  kd: number;
}

export interface PidOptions extends PidGains {
  /** Symmetric clamp on the returned `output`: `[-outputLimit, outputLimit]`. */
  outputLimit: number;
  /**
   * Clamp on the integral term (in output units), for anti-windup.
   * Defaults to `outputLimit`.
   */
  integralLimit?: number;
  /**
   * Take the derivative from the change in measurement rather than the
   * change in error (default `true`). Avoids a derivative spike when the
   * setpoint moves.
   */
  derivativeOnMeasurement?: boolean;
  /** Lower clamp on `dt` (seconds). Default `0.02`. */
  minDt?: number;
  /** Upper clamp on `dt` (seconds). Default `1.0`. */
  maxDt?: number;
}

export interface PidStep {
  /** Final, clamped controller output. */
  output: number;
  /** Proportional contribution. */
  p: number;
  /** Integral contribution (post anti-windup). */
  i: number;
  /** Derivative contribution. */
  d: number;
  /** `setpoint - measurement` for this update. */
  error: number;
  /** Whether `output` hit `outputLimit` this update. */
  saturated: boolean;
}

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export class PidController {
  private kp: number;
  private ki: number;
  private kd: number;
  private outputLimit: number;
  private integralLimit: number;
  private derivativeOnMeasurement: boolean;
  private minDt: number;
  private maxDt: number;

  private iTerm = 0;
  private lastMeasurement = 0;
  private lastError = 0;
  private primed = false;

  constructor(opts: PidOptions) {
    this.kp = opts.kp;
    this.ki = opts.ki;
    this.kd = opts.kd;
    this.outputLimit = Math.abs(opts.outputLimit);
    this.integralLimit = Math.abs(opts.integralLimit ?? opts.outputLimit);
    this.derivativeOnMeasurement = opts.derivativeOnMeasurement ?? true;
    this.minDt = opts.minDt ?? 0.02;
    this.maxDt = opts.maxDt ?? 1.0;
  }

  /** Wipe integral + derivative history (e.g. after leaving a hysteresis hold). */
  reset(): void {
    this.iTerm = 0;
    this.lastMeasurement = 0;
    this.lastError = 0;
    this.primed = false;
  }

  setGains(g: Partial<PidGains>): void {
    if (g.kp !== undefined) this.kp = g.kp;
    if (g.ki !== undefined) this.ki = g.ki;
    if (g.kd !== undefined) this.kd = g.kd;
  }

  /**
   * @param setpoint     target value
   * @param measurement  current measured value
   * @param dt           seconds since the previous `update()` (clamped internally)
   */
  update(setpoint: number, measurement: number, dt: number): PidStep {
    const step = clamp(Number.isFinite(dt) ? dt : this.minDt, this.minDt, this.maxDt);
    const error = setpoint - measurement;

    const p = this.kp * error;

    let d = 0;
    if (this.primed) {
      const rate = this.derivativeOnMeasurement
        ? -(measurement - this.lastMeasurement) / step
        : (error - this.lastError) / step;
      d = this.kd * rate;
    }

    // Tentative integral, clamped to its own limit.
    const iTermCandidate = clamp(
      this.iTerm + this.ki * error * step,
      -this.integralLimit,
      this.integralLimit,
    );

    let outputRaw = p + iTermCandidate + d;

    // Conditional integration: if we're already saturated and the error is
    // still driving us further into the rail, don't let the integral grow
    // this frame — hold it at its previous value.
    let iTerm = iTermCandidate;
    if (outputRaw > this.outputLimit && error > 0) iTerm = this.iTerm;
    else if (outputRaw < -this.outputLimit && error < 0) iTerm = this.iTerm;

    outputRaw = p + iTerm + d;
    const output = clamp(outputRaw, -this.outputLimit, this.outputLimit);

    this.iTerm = iTerm;
    this.lastMeasurement = measurement;
    this.lastError = error;
    this.primed = true;

    return {
      output,
      p,
      i: iTerm,
      d,
      error,
      saturated: Math.abs(outputRaw) >= this.outputLimit,
    };
  }
}
