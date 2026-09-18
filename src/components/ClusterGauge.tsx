/** Radial gauge for a cluster-bench signal — same SVG face/needle language
 *  as `PressureGauge` (arc, ticks, needle, big readout), generalized to an
 *  arbitrary `[min, max]` + unit instead of the hydraulic bench's fixed
 *  0-400 Bar scale, and interactive: dragging the range input underneath
 *  moves the needle live. Used by `ClusterBenchDashboard` so setting a
 *  gauge value reads as "driving a dial", not filling in a form field. */

const START_ANGLE = -135;
const SWEEP = 270;

function polar(deg: number, r: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: 100 + r * Math.sin(rad), y: 100 - r * Math.cos(rad) };
}

function arcPath(fromDeg: number, toDeg: number, r: number) {
  const p1 = polar(fromDeg, r);
  const p2 = polar(toDeg, r);
  const large = toDeg - fromDeg > 180 ? 1 : 0;
  return `M ${p1.x} ${p1.y} A ${r} ${r} 0 ${large} 1 ${p2.x} ${p2.y}`;
}

export interface ClusterGaugeProps {
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  /** Slider increment. Defaults to whatever makes a 100-step sweep. */
  step?: number;
  disabled?: boolean;
  onChange?: (value: number) => void;
}

export default function ClusterGauge({
  label, value, min, max, unit = '', step, disabled, onChange,
}: ClusterGaugeProps) {
  const range = max - min || 1;
  const clamped = Math.max(min, Math.min(max, value));
  const angle = START_ANGLE + ((clamped - min) / range) * SWEEP;
  const decimals = range < 20 ? 1 : 0;

  return (
    // w-full + max-w, not a fixed width: this sits in a grid cell sized to
    // the frame's own signal count (see ClusterBenchDashboard's FrameCard),
    // so it fills up to 128px but shrinks gracefully if a cell is ever
    // narrower than that instead of overflowing it.
    <div className="flex flex-col items-center gap-1 w-full max-w-[128px]">
      {/* Dims as one unit when disabled — the slider below has its own
       *  disabled:opacity-40, so this doesn't double up with that one. */}
      <svg viewBox="0 0 200 200" className={`w-full ${disabled ? 'opacity-40' : ''}`}>
        <circle cx="100" cy="100" r="92" className="fill-elevated stroke-border" strokeWidth={1.5} />
        <path d={arcPath(START_ANGLE, START_ANGLE + SWEEP, 80)} fill="none" stroke="currentColor" className="text-border" strokeWidth="10" strokeLinecap="round" />
        <path d={arcPath(START_ANGLE, angle, 80)} fill="none" stroke="currentColor" className="text-accent" strokeWidth="10" strokeLinecap="round" />
        <g transform={`rotate(${angle} 100 100)`}>
          {/* Fixed contrasting color, independent of the arc's — otherwise
           *  the needle visually disappears into the arc at high readings
           *  (same reasoning as PressureGauge's always-danger needle). */}
          <line x1="100" y1="100" x2="100" y2="38" stroke="currentColor" className="text-danger" strokeWidth="3" strokeLinecap="round" />
        </g>
        <circle cx="100" cy="100" r="6" className="fill-text-primary" />
        <text x="100" y="140" textAnchor="middle" className="fill-text-primary font-bold" fontSize="26">
          {clamped.toFixed(decimals)}
          {unit && <tspan fontSize="11" dx="2">{unit}</tspan>}
        </text>
      </svg>
      <span className={`text-[10px] font-semibold tracking-wide text-center leading-tight ${disabled ? 'text-text-tertiary' : 'text-text-secondary'}`}>{label}</span>
      {onChange && (
        <input
          type="range"
          aria-label={label}
          disabled={disabled}
          min={min}
          max={max}
          step={step ?? Math.max(range / 100, 0.01)}
          value={clamped}
          onChange={e => onChange(Number(e.target.value))}
          className="w-full h-1.5 bg-elevated rounded-full appearance-none cursor-pointer accent-accent disabled:opacity-40 disabled:cursor-not-allowed"
        />
      )}
    </div>
  );
}
