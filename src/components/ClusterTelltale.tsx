/** One dashboard telltale lamp — a real cluster's warning icon, dim when
 *  off and lit (amber) when on, click to toggle. Used by
 *  `ClusterBenchDashboard` for every 1-bit signal in a profile, instead of
 *  a plain checkbox — the point of the bench is to look like the thing it's
 *  testing reads. */

export interface ClusterTelltaleProps {
  label: string;
  active: boolean;
  disabled?: boolean;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  onToggle?: () => void;
}

export default function ClusterTelltale({ label, active, disabled, icon: Icon, onToggle }: ClusterTelltaleProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onToggle}
      className={[
        // w-full + max-w — same reasoning as ClusterGauge: this sits in a
        // grid cell sized to the frame's signal count, so it should shrink
        // gracefully rather than overflow a narrower cell.
        'flex flex-col items-center gap-1 rounded-lg p-2 w-full max-w-[88px] border transition-colors',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        active
          ? 'bg-warning/15 border-warning/30 text-warning hover:bg-warning/25'
          : 'bg-elevated border-border text-text-tertiary hover:text-text-secondary',
      ].join(' ')}
    >
      <Icon className="w-6 h-6" />
      <span className="text-[9px] font-medium leading-tight text-center">{label}</span>
    </button>
  );
}
