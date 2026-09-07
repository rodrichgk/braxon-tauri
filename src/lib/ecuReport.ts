// Data model + verdict logic for the ECU (Signal HIL) test report — the
// electronic-side counterpart to hydraulicReport.ts.
//
// The Signal HIL bench doesn't emit one structured "report" frame the way
// the F2-EVO hydraulic board does, so this draft is assembled from what
// the app already knows: the DTC scan (Diagnostics.tsx), the ECU
// identification (21 80 / DDT4ALL match), CAN bus activity (passive
// sniffer), the WSS channel assignments, plus the readings a technician
// keys in (motor current peak, supply voltage, per-speed wheel readback)
// since the bench has no shunt of its own to measure those.

import type { Verdict } from '@/lib/hydraulicReport';
export type { Verdict } from '@/lib/hydraulicReport';

/** One decoded fault code — a structural subset of Diagnostics.tsx's DTCEntry. */
export interface EcuDtcEntry {
  code: string;
  description: string;
  udsStatus?: number;
  rawValue: number;
  ecuName?: string;
  /** `cross-unit` = text borrowed from another unit's fault table. */
  dtcSource?: 'ecu-exact' | 'ddt-exact' | 'cross-unit';
}

/** Snapshot of a DTC scan — a structural subset of Diagnostics.tsx's DTCScan. */
export interface EcuDtcSnapshot {
  timestamp: string;
  protocol: string;
  brand: string;
  codes: EcuDtcEntry[];
  /** ECU sent 7F <sid> <nrc> (nrc != 0x78). */
  nrc?: { sid: number; code: number };
  /** A positive response to the DTC service was actually parsed. */
  gotPositive: boolean;
  /** The scan ran but the ECU never answered on the response ID. */
  noResponse?: boolean;
}

export interface EcuIdent {
  absRef?: string;
  manufacturer?: string;
  wssType?: string;
  /** Renault / Nissan / Mitsubishi / Other */
  brand?: string;
  /** DDT4ALL / selected model name, once known. */
  ecuName?: string;
  hardwareFamily?: string;
  protocol?: string;
  /** Request / response CAN IDs, hex e.g. "740" / "760". */
  sendId?: string;
  recvId?: string;
  /** From KWP 21 80: supplier (3 ASCII), version + soft (4-hex each). */
  supplier?: string;
  version?: string;
  soft?: string;
  identifiedAt?: string;
}

export interface CanActivity {
  seen: boolean;
  frameCount: number;
  uniqueIds: number;
  /** Bus bitrate label if configured, e.g. "500 kbit/s". */
  bitrate?: string;
  topIds?: { id: number; count: number; hint?: string }[];
  /** Rolling window (seconds) the counts were gathered over. */
  windowSec?: number;
  observedAt?: string;
}

/** One row of the "wheel-speed readback vs. current" curve. */
export interface WheelCurvePoint {
  /** Commanded test speed (km/h) fed to the WSS generator. */
  speedKmh: number;
  /** Per-wheel value the ECU reported back at that speed (km/h), or null. */
  fl: number | null;
  fr: number | null;
  rl: number | null;
  rr: number | null;
  /** ABS / pump-motor current draw measured at that point (A), or null. */
  currentA: number | null;
}

export interface WssChannelSummary {
  wheel: 'FL' | 'FR' | 'RL' | 'RR';
  canId: number | null;
  byteIdx: number | null;
  kmhPerHz: number | null;
  assigned: boolean;
}

export interface EcuReportManual {
  operator?: string;
  /** Peak pump-motor / system current during an active test (A). */
  currentPeakA?: number | null;
  /** Quiescent current with ignition on, ABS idle (A). */
  currentIdleA?: number | null;
  /** Supply voltage at the ECU during the test (V). */
  voltageV?: number | null;
  /** Injected WSS drive currents for the selected variant, free text
   *  (e.g. "DF11 7 / 14 mA"). Prefilled from the Signal Tester variant. */
  injectedMa?: string;
  /** Reference / spec bounds the technician wants on the report. */
  currentSpecMinA?: number | null;
  currentSpecMaxA?: number | null;
  voltageSpecMinV?: number | null;
  notes?: string;
  /** Manual override of the computed verdict. */
  verdictOverride?: Verdict | null;
}

export interface EcuReportDraft {
  ident: EcuIdent;
  can: CanActivity | null;
  dtc: EcuDtcSnapshot | null;
  wssChannels: WssChannelSummary[];
  /** The readback-vs-current curve, edited in the report card. */
  curve: WheelCurvePoint[];
  manual: EcuReportManual;
  updatedAt: string;
}

export function emptyEcuReportDraft(): EcuReportDraft {
  return {
    ident: {},
    can: null,
    dtc: null,
    wssChannels: (['FL', 'FR', 'RL', 'RR'] as const).map(wheel => ({
      wheel, canId: null, byteIdx: null, kmhPerHz: null, assigned: false,
    })),
    curve: [],
    manual: {},
    updatedAt: new Date().toISOString(),
  };
}

export function ecuReportHasData(d: EcuReportDraft | null): d is EcuReportDraft {
  if (!d) return false;
  return Boolean(
    d.ident.absRef || d.ident.ecuName || d.ident.sendId ||
    d.dtc || d.can?.seen ||
    d.curve.some(p => p.fl !== null || p.fr !== null || p.rl !== null || p.rr !== null || p.currentA !== null) ||
    d.manual.currentPeakA != null || d.manual.voltageV != null || d.manual.notes,
  );
}

/** Real, current faults only (testFailed | confirmedDTC), matching
 *  Diagnostics.tsx's own parseUDSPayload filter. */
export function activeDtcCount(dtc: EcuDtcSnapshot | null): number {
  if (!dtc) return 0;
  return dtc.codes.filter(c => c.udsStatus === undefined || (c.udsStatus & 0x09) !== 0).length;
}

export interface CurveIssue {
  wheel: 'FL' | 'FR' | 'RL' | 'RR';
  speedKmh: number;
  readback: number;
  expected: number;
}

/** Points where a wheel readback is off the commanded speed by >15% (and
 *  ≥3 km/h absolute, so a near-zero point isn't flagged on rounding). */
export function curveIssues(curve: WheelCurvePoint[]): CurveIssue[] {
  const out: CurveIssue[] = [];
  for (const p of curve) {
    if (p.speedKmh <= 0) continue;
    (['fl', 'fr', 'rl', 'rr'] as const).forEach((k, i) => {
      const v = p[k];
      if (v === null) return;
      const off = Math.abs(v - p.speedKmh);
      if (off >= 3 && off / p.speedKmh > 0.15) {
        out.push({ wheel: (['FL', 'FR', 'RL', 'RR'] as const)[i], speedKmh: p.speedKmh, readback: v, expected: p.speedKmh });
      }
    });
  }
  return out;
}

export function peakCurrent(d: EcuReportDraft): number | null {
  const manual = d.manual.currentPeakA;
  const fromCurve = d.curve.map(p => p.currentA).filter((v): v is number => v !== null);
  const curvePeak = fromCurve.length ? Math.max(...fromCurve) : null;
  if (manual != null && curvePeak != null) return Math.max(manual, curvePeak);
  return manual ?? curvePeak;
}

/**
 * FAIL on a confirmed fault or an explicit manual FAIL. REVIEW when
 * something is unverified or out of tolerance (no CAN comms, ECU not
 * identified, current/voltage out of the entered spec, a wheel curve that
 * doesn't track, a DTC scan that errored). PASS only when the ECU was
 * reached, answered clean, and every entered reading is in spec.
 * A manual override always wins.
 */
export function computeEcuVerdict(d: EcuReportDraft | null): Verdict | null {
  if (!ecuReportHasData(d)) return null;
  if (d.manual.verdictOverride) return d.manual.verdictOverride;

  const faults = activeDtcCount(d.dtc);
  if (faults > 0) return 'fail';

  const peak = peakCurrent(d);
  const overCurrent = peak != null && d.manual.currentSpecMaxA != null && peak > d.manual.currentSpecMaxA;
  const underCurrent = peak != null && d.manual.currentSpecMinA != null && peak < d.manual.currentSpecMinA;
  const lowVoltage = d.manual.voltageV != null && d.manual.voltageSpecMinV != null && d.manual.voltageV < d.manual.voltageSpecMinV;

  const reviewReasons =
    (d.can && !d.can.seen) ||
    (d.dtc?.noResponse === true) ||
    (d.dtc != null && !d.dtc.gotPositive && !d.dtc.nrc) ||
    !d.ident.ecuName ||
    overCurrent || underCurrent || lowVoltage ||
    curveIssues(d.curve).length > 0;

  if (reviewReasons) return 'review';
  return 'pass';
}

/** Plain-language "why" line built from the draft — mirrors the hydraulic
 *  report's reasonSummary. */
export function ecuReasonSummary(d: EcuReportDraft | null): string {
  if (!ecuReportHasData(d)) return '';
  const parts: string[] = [];

  const faults = d.dtc ? activeDtcCount(d.dtc) : 0;
  if (faults > 0) {
    const list = d.dtc!.codes
      .filter(c => c.udsStatus === undefined || (c.udsStatus & 0x09) !== 0)
      .map(c => c.code).join(', ');
    parts.push(`${faults} active fault code${faults > 1 ? 's' : ''} — ${list}`);
  } else if (d.dtc?.gotPositive) {
    parts.push('ECU reports no stored faults');
  } else if (d.dtc?.nrc) {
    parts.push(`DTC read rejected (7F ${d.dtc.nrc.sid.toString(16)} ${d.dtc.nrc.code.toString(16)})`);
  } else if (d.dtc?.noResponse) {
    parts.push('no answer to the DTC request');
  }

  if (d.can) parts.push(d.can.seen ? `CAN bus active (${d.can.uniqueIds} IDs)` : 'no CAN traffic seen');
  if (!d.ident.ecuName) parts.push('ECU not identified against the database');

  const peak = peakCurrent(d);
  if (peak != null) {
    const over = d.manual.currentSpecMaxA != null && peak > d.manual.currentSpecMaxA;
    const under = d.manual.currentSpecMinA != null && peak < d.manual.currentSpecMinA;
    parts.push(`motor current peak ${peak.toFixed(1)} A${over ? ' — over spec' : under ? ' — under spec' : ''}`);
  }
  if (d.manual.voltageV != null) {
    const low = d.manual.voltageSpecMinV != null && d.manual.voltageV < d.manual.voltageSpecMinV;
    parts.push(`supply ${d.manual.voltageV.toFixed(1)} V${low ? ' — low' : ''}`);
  }

  const ci = curveIssues(d.curve);
  if (ci.length > 0) {
    const wheels = [...new Set(ci.map(i => i.wheel))].join(', ');
    parts.push(`wheel readback off commanded speed on ${wheels}`);
  }

  if (parts.length === 0) return 'ECU reached, communication and fault memory clean, all entered readings within spec.';
  return parts.join('  ·  ');
}
