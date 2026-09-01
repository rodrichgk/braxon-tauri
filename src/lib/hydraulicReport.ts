// Types mirroring src-tauri/src/f2evo.rs's hydraulic::ParsedReport, plus the
// shared verdict logic — used by both HydraulicTestReport.tsx (the full
// report view) and HydraulicBenchDashboard.tsx (the quick completion
// banner), so "does this count as a pass" is defined in exactly one place.
// Field names are snake_case on purpose — this module has no
// #[serde(rename_all)] directive, matching the existing Telemetry/
// ChannelPressure types in the same Rust file.

export type ValveStatusKind = 'ok' | 'marginal' | 'fault' | 'informational';
export interface ValveResult {
  label: string;
  status: ValveStatusKind;
  code?: number;
}

export type MotorStatusKind = 'ok' | 'warning_low' | 'warning_over' | 'warning_other' | 'unconfirmed';
export interface MotorResult {
  status: MotorStatusKind;
  current_amps: number | null;
}

export interface PressureCycle {
  label: string;
  passed: boolean;
  channel_pressures: [number | null, number | null, number | null, number | null];
  pump_pressure: number | null;
  // Channel numbers (1-4) flagged within this specific cycle — used to
  // tell whether a fault came from an "outlet test" phase specifically,
  // since the "channel pressure should track pump pressure" recovery
  // check the auto-repair flow uses only makes sense for that phase.
  faulted_channels: number[];
}

export interface PressureTestResult {
  cycles: PressureCycle[];
  completed: boolean | null;
  // Distinct channel numbers (1-4) whose "Channel Pressure N = X Bar"
  // line carried a board-appended " - error!!" suffix (confirmed against
  // the decompiled SendReport(), which ignores anything past "Bar").
  // Drives the auto-repair flow's targeted Programs Cycle selection.
  faulted_channels: number[];
}

export interface ParsedReport {
  valves: ValveResult[];
  motor: MotorResult | null;
  pressure: PressureTestResult | null;
}

export type Verdict = 'pass' | 'review' | 'fail';

export function reportHasData(parsed: ParsedReport | null): parsed is ParsedReport {
  return !!parsed && (parsed.valves.length > 0 || !!parsed.motor || !!parsed.pressure);
}

// Any hard fault or an explicitly-failed pressure test is FAIL; anything
// ambiguous (marginal valve, motor warning/unconfirmed, or a pressure test
// that never reached its final line) is REVIEW; otherwise PASS.
export function computeVerdict(parsed: ParsedReport | null): Verdict | null {
  if (!reportHasData(parsed)) return null;

  const hardFault =
    parsed.valves.some(v => v.status === 'fault') ||
    parsed.pressure?.completed === false;
  if (hardFault) return 'fail';

  const needsReview =
    parsed.valves.some(v => v.status === 'marginal') ||
    (parsed.motor && parsed.motor.status !== 'ok') ||
    (parsed.pressure && parsed.pressure.completed === null);
  if (needsReview) return 'review';

  return 'pass';
}
