"use client";
import { Valve } from '@/types/abs';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import { BeakerIcon } from '@heroicons/react/24/outline';

interface ValveIndicatorProps {
  valve: Valve;
  selected?: boolean;
  onClick?: () => void;
}

export function ValveIndicator({ valve, selected, onClick }: ValveIndicatorProps) {
  const statusColors = {
    active: {
      gradient: 'from-emerald-400 to-emerald-600',
      shadow: 'shadow-emerald-200',
      ring: 'ring-emerald-400',
      icon: 'text-emerald-200'
    },
    inactive: {
      gradient: 'from-red-400 to-red-600',
      shadow: 'shadow-red-200',
      ring: 'ring-red-400',
      icon: 'text-red-200'
    },
    testing: {
      gradient: 'from-amber-400 to-amber-600',
      shadow: 'shadow-amber-200',
      ring: 'ring-amber-400',
      icon: 'text-amber-200'
    }
  };

  const healthColor = valve.health >= 80 ? 'text-emerald-100' :
                     valve.health >= 50 ? 'text-amber-100' : 'text-red-100';

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={clsx(
        'relative w-full max-w-[180px] h-40',              // fixed height
        'rounded-lg bg-white dark:bg-gray-800',            // light card
        'shadow-sm hover:shadow-md transition-shadow',     // soft shadow
        'flex flex-col justify-between p-4',               // padding
        selected
          ? 'ring-2 ring-indigo-400'
          : 'ring-1 ring-transparent hover:ring-indigo-200',
      )}
    >
      {/* Header */}
      <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">
        {valve.name}
      </div>

      {/* Health bar */}
      <div className="w-full">
        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className={clsx(
              'h-full rounded-full transition-all duration-300',
              valve.health > 60
                ? 'bg-green-400'
                : valve.health > 30
                ? 'bg-yellow-400'
                : 'bg-red-400'
            )}
            style={{ width: `${valve.health}%` }}
          />
        </div>
        <div className="mt-1 text-xs font-medium text-gray-600 dark:text-gray-300">
          {valve.health}%
        </div>
      </div>

      {/* Testing pulse effect */}
      {valve.status === 'testing' && (
        <div
          className="absolute inset-0 rounded-lg pointer-events-none"
          style={{
            boxShadow: '0 0 0 rgba(59, 130, 246, 0.5)',
            animation: 'pulse 2s infinite ease-in-out',
          }}
        />
      )}

      {/* Inline keyframes */}
      <style jsx>{`
        @keyframes pulse {
          0% {
            box-shadow: 0 0 0 rgba(59, 130, 246, 0.5);
          }
          50% {
            box-shadow: 0 0 12px rgba(59, 130, 246, 0.25);
          }
          100% {
            box-shadow: 0 0 0 rgba(59, 130, 246, 0.5);
          }
        }
      `}</style>
    </motion.button>

  );
}
