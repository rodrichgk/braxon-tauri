const GAUGE_MAX = 400;

/** Radial pressure gauge — mirrors the 0-400 scale, 5-tick face from the
 * original bench UI (Menometri: GaugePump/Gauge1-4), redrawn as SVG instead
 * of a hand-rotated bitmap. Shared between the live dashboard and the test
 * report view so both read off the exact same face.
 */
const DEFAULT_DANGER_THRESHOLD = 350;

export default function PressureGauge({
  label, value, secondary, showSecondary = false, error = false, noData = false, dangerThreshold = DEFAULT_DANGER_THRESHOLD,
}: {
  label: string;
  value: number;
  secondary?: number;
  showSecondary?: boolean;
  /** Bench Report finding: this was a flat 350 for every unit, regardless
   * of what's actually under test — `AbsModelOption.pressioneMax` (a real,
   * per-model spec already fetched and shown as a static text badge
   * elsewhere on this dashboard) was never threaded into the gauge that's
   * supposed to be showing whether a live reading is actually in spec.
   * A model with a 120-150 bar working range reading 200 used to still
   * paint "safe" — accurate only by coincidence, for whichever model
   * happens to have a real range near 350. Falls back to the original
   * flat value when no model-specific one is available (nothing resolved
   * yet, or this model's spec itself wasn't imported). */
  dangerThreshold?: number;
  /** This specific channel was flagged by the board itself (a "Channel
   * Pressure N = X Bar" line with the " - error!!" suffix — see
   * PressureCycle.faulted_channels), independent of where the raw value
   * happens to fall on the 0-400 scale below. Forces the danger styling
   * and an explicit ERROR tag, since the board's own fault call is a
   * stronger signal than the gauge's own >350 heuristic and shouldn't be
   * silently indistinguishable from a merely-high-but-fine reading. */
  error?: boolean;
  /** Bench Report finding: the live dashboard always passed `value ?? 0`
   * when telemetry hadn't arrived yet (just connected, just reset), so
   * every gauge confidently read "0" — visually indistinguishable from a
   * genuine zero-bar reading. The Current/Temperature tiles right next to
   * these gauges already show "—" for the same case; this brings the
   * gauges in line. Needle parks at rest and the readout shows "—"
   * instead of a number, and this overrides `error` — a fault call means
   * nothing without a real reading behind it. */
  noData?: boolean;
}) {
  const clamped = noData ? 0 : Math.max(0, Math.min(GAUGE_MAX, value));
  const startAngle = -135;
  const sweep = 270;
  const angle = startAngle + (clamped / GAUGE_MAX) * sweep;
  const ticks = [0, 100, 200, 300, 400];

  const polar = (deg: number, r: number) => {
    const rad = (deg * Math.PI) / 180;
    return { x: 100 + r * Math.sin(rad), y: 100 - r * Math.cos(rad) };
  };

  const arcPath = (fromDeg: number, toDeg: number, r: number) => {
    const p1 = polar(fromDeg, r);
    const p2 = polar(toDeg, r);
    const large = toDeg - fromDeg > 180 ? 1 : 0;
    return `M ${p1.x} ${p1.y} A ${r} ${r} 0 ${large} 1 ${p2.x} ${p2.y}`;
  };

  // noData wins over a board-flagged error — a fault call means nothing
  // without a real reading behind it (and, practically, the board can't
  // have flagged a channel BRAXON hasn't received any telemetry for yet).
  const effectiveError = error && !noData;
  const danger = effectiveError || (!noData && clamped > dangerThreshold);

  return (
    <div className="flex flex-col items-center gap-1.5">
      {/* Bench Report finding (polish): 140px/9px tick labels read fine
          up close but small for a hands-busy bench glance — a modest
          bump, not the bigger "bench view" display mode the report
          proposes separately as its own feature. */}
      <svg viewBox="0 0 200 200" className={`w-full max-w-[160px] ${noData ? 'opacity-40' : ''}`}>
        {/* Face */}
        <circle cx="100" cy="100" r="92" className={effectiveError ? 'fill-elevated stroke-danger' : 'fill-elevated stroke-border'} strokeWidth={effectiveError ? 2.5 : 1.5} />
        {/* Background arc */}
        <path d={arcPath(startAngle, startAngle + sweep, 80)} fill="none" stroke="currentColor" className="text-border" strokeWidth="6" strokeLinecap="round" />
        {/* Filled arc */}
        {!noData && (
          <path
            d={arcPath(startAngle, angle, 80)}
            fill="none"
            stroke="currentColor"
            className={danger ? 'text-danger' : 'text-accent'}
            strokeWidth="6"
            strokeLinecap="round"
          />
        )}
        {/* Ticks */}
        {ticks.map(t => {
          const tAngle = startAngle + (t / GAUGE_MAX) * sweep;
          const outer = polar(tAngle, 80);
          const inner = polar(tAngle, 70);
          const textPt = polar(tAngle, 60);
          return (
            <g key={t}>
              <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="currentColor" className="text-text-tertiary" strokeWidth="1.5" />
              <text x={textPt.x} y={textPt.y} textAnchor="middle" dominantBaseline="middle" className="fill-text-tertiary" fontSize="10">{t}</text>
            </g>
          );
        })}
        {/* Needle — parked at rest (0) rather than rotated when there's no
            reading to point at. */}
        {!noData && (
          <g transform={`rotate(${angle} 100 100)`}>
            <line x1="100" y1="100" x2="100" y2="34" stroke="currentColor" className="text-danger" strokeWidth="2.5" strokeLinecap="round" />
          </g>
        )}
        <circle cx="100" cy="100" r="5" className="fill-text-primary" />
        {/* Readout — "Bar" is confirmed (this whole gauge mirrors the
            original bench's 0-400 Bar scale), so it's shown outright.
            The secondary value (see PressureGauge.tsx's `secondary` prop
            doc comment / f2evo.rs's ChannelPressure doc comment) isn't —
            all that's confirmed about it is *where* it comes from in the
            frame, not what it physically represents, so rather than
            invent a label this codebase hasn't earned yet, an honest
            native SVG tooltip says exactly that much and no more. */}
        <text x="100" y="140" textAnchor="middle" className={effectiveError ? 'fill-danger font-bold' : 'fill-text-primary font-bold'} fontSize="24">
          {noData ? '—' : clamped.toFixed(0)}
          {!noData && <tspan fontSize="11" dx="2">Bar</tspan>}
        </text>
        {!noData && showSecondary && secondary !== undefined && (
          <g>
            <title>Second reading carried in the same telemetry frame — meaning not yet confirmed.</title>
            <text x="100" y="156" textAnchor="middle" className="fill-text-tertiary" fontSize="11">
              | {secondary.toFixed(0)} Bar
            </text>
          </g>
        )}
      </svg>
      <span className={['text-[11px] font-semibold tracking-wide', effectiveError ? 'text-danger' : 'text-text-secondary'].join(' ')}>{label}</span>
      {effectiveError && <span className="text-[9px] font-bold text-danger tracking-wide">ERROR</span>}
    </div>
  );
}
