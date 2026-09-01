const GAUGE_MAX = 400;

/** Radial pressure gauge — mirrors the 0-400 scale, 5-tick face from the
 * original bench UI (Menometri: GaugePump/Gauge1-4), redrawn as SVG instead
 * of a hand-rotated bitmap. Shared between the live dashboard and the test
 * report view so both read off the exact same face.
 */
export default function PressureGauge({ label, value, secondary, showSecondary = false, error = false }: {
  label: string;
  value: number;
  secondary?: number;
  showSecondary?: boolean;
  /** This specific channel was flagged by the board itself (a "Channel
   * Pressure N = X Bar" line with the " - error!!" suffix — see
   * PressureCycle.faulted_channels), independent of where the raw value
   * happens to fall on the 0-400 scale below. Forces the danger styling
   * and an explicit ERROR tag, since the board's own fault call is a
   * stronger signal than the gauge's own >350 heuristic and shouldn't be
   * silently indistinguishable from a merely-high-but-fine reading. */
  error?: boolean;
}) {
  const clamped = Math.max(0, Math.min(GAUGE_MAX, value));
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

  const danger = error || clamped > 350;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg viewBox="0 0 200 200" className="w-full max-w-[140px]">
        {/* Face */}
        <circle cx="100" cy="100" r="92" className={error ? 'fill-elevated stroke-danger' : 'fill-elevated stroke-border'} strokeWidth={error ? 2.5 : 1.5} />
        {/* Background arc */}
        <path d={arcPath(startAngle, startAngle + sweep, 80)} fill="none" stroke="currentColor" className="text-border" strokeWidth="6" strokeLinecap="round" />
        {/* Filled arc */}
        <path
          d={arcPath(startAngle, angle, 80)}
          fill="none"
          stroke="currentColor"
          className={danger ? 'text-danger' : 'text-accent'}
          strokeWidth="6"
          strokeLinecap="round"
        />
        {/* Ticks */}
        {ticks.map(t => {
          const tAngle = startAngle + (t / GAUGE_MAX) * sweep;
          const outer = polar(tAngle, 80);
          const inner = polar(tAngle, 70);
          const textPt = polar(tAngle, 60);
          return (
            <g key={t}>
              <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="currentColor" className="text-text-tertiary" strokeWidth="1.5" />
              <text x={textPt.x} y={textPt.y} textAnchor="middle" dominantBaseline="middle" className="fill-text-tertiary" fontSize="9">{t}</text>
            </g>
          );
        })}
        {/* Needle */}
        <g transform={`rotate(${angle} 100 100)`}>
          <line x1="100" y1="100" x2="100" y2="34" stroke="currentColor" className="text-danger" strokeWidth="2.5" strokeLinecap="round" />
        </g>
        <circle cx="100" cy="100" r="5" className="fill-text-primary" />
        {/* Readout */}
        <text x="100" y="140" textAnchor="middle" className={error ? 'fill-danger font-bold' : 'fill-text-primary font-bold'} fontSize="24">
          {clamped.toFixed(0)}
        </text>
        {showSecondary && secondary !== undefined && (
          <text x="100" y="156" textAnchor="middle" className="fill-text-tertiary" fontSize="11">
            | {secondary.toFixed(0)}
          </text>
        )}
      </svg>
      <span className={['text-[11px] font-semibold tracking-wide', error ? 'text-danger' : 'text-text-secondary'].join(' ')}>{label}</span>
      {error && <span className="text-[9px] font-bold text-danger tracking-wide">ERROR</span>}
    </div>
  );
}
