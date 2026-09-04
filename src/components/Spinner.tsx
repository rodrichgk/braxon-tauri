import { ArrowPathIcon } from '@heroicons/react/24/outline';

// Requested directly: "i almost see no loading animations, go around and
// find where you can add them" — nearly every loading state across the
// REMAN pages was plain static grey text (no icon, no motion at all).
// This is the one shared spinner all of them now use, matching the
// existing "refreshing" indicator's exact look (InterventionsTab's
// ArrowPathIcon) so the whole app reads as one consistent style instead
// of several different spinner treatments.
export default function Spinner({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return <ArrowPathIcon className={`${className} animate-spin shrink-0`} aria-hidden="true" />;
}

// Same spinner + label, inline — the common "Loading…" replacement used
// wherever a bare <p>{t('common.loading')}</p> used to sit alone.
export function LoadingRow({
  label,
  className = 'flex items-center justify-center gap-1.5 py-2 text-text-tertiary',
  spinnerClassName = 'w-3.5 h-3.5',
}: {
  label: string;
  className?: string;
  spinnerClassName?: string;
}) {
  return (
    <div className={className}>
      <Spinner className={spinnerClassName} />
      <span>{label}</span>
    </div>
  );
}
