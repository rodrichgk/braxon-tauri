import { Valve } from '@/types/abs';
import clsx from 'clsx';
import { motion } from 'framer-motion';

interface ValveIndicatorProps {
  valve: Valve;
  selected?: boolean;
  onClick?: () => void;
}

// Bench Report finding: this component — a core, frequently-rendered
// tile (one per valve, inside ABSTester.tsx) — ignored the design-token
// system entirely, hardcoding raw Tailwind grays/indigo/green/yellow/red
// instead of this app's actual bg-card/border/accent/success/warning/
// danger tokens. Called out as the single most visible "two different
// apps" moment in the review: a technician moving between REMAN and
// Valve Testing would notice the visual seam before reading a label.
export function ValveIndicator({ valve, selected, onClick }: ValveIndicatorProps) {
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={clsx(
        'relative w-full max-w-[180px] h-40',
        'rounded-lg bg-card border border-border',
        'shadow-sm hover:shadow-md transition-shadow',
        'flex flex-col justify-between p-4',
        selected
          ? 'ring-2 ring-accent'
          : 'ring-1 ring-transparent hover:ring-accent/30',
      )}
    >
      {/* Header */}
      <div className="text-sm font-semibold text-text-primary">
        {valve.name}
      </div>

      {/* Health bar */}
      <div className="w-full">
        <div className="h-2 bg-elevated rounded-full overflow-hidden">
          <div
            className={clsx(
              'h-full rounded-full transition-all duration-300',
              valve.health > 60
                ? 'bg-success'
                : valve.health > 30
                ? 'bg-warning'
                : 'bg-danger'
            )}
            style={{ width: `${valve.health}%` }}
          />
        </div>
        <div className="mt-1 text-xs font-medium text-text-secondary">
          {valve.health}%
        </div>
      </div>

      {/* Testing pulse effect — see .pulse-ring in globals.css */}
      {valve.status === 'testing' && (
        <div className="absolute inset-0 rounded-lg pointer-events-none pulse-ring" />
      )}
    </motion.button>
  );
}
