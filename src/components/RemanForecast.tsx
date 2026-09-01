import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/tauri';
import { motion, AnimatePresence } from 'framer-motion';
import { SparklesIcon, ChevronDownIcon, ChevronUpIcon, ArrowPathIcon, ScaleIcon, ChartBarIcon } from '@heroicons/react/24/outline';

// New units can land on the bench at any time — re-fetch periodically so
// the panel doesn't go stale while it's sitting open. Requested directly:
// "we're receiving units in about 10 minutes the forecast should update
// right?" Originally 3 minutes to balance staying current against
// hammering the 4D server with a full 20000-row historical scan on every
// tick; brought down to 60 seconds ("3 minutes is a lot let's bring it down
// to 60 seconds"), then to 30 seconds (2026-08-02) once the backend gained
// a shared Postgres cache in front of 4D (see docs/reman-schema.md) — the
// 180-day historical scan no longer runs live at all, and the two
// remaining live queries are cached fleet-wide with a matching
// LIVE_CACHE_TTL_SECONDS, so a faster client poll here doesn't mean more
// 4D load, just fresher reads of the shared cache. Still only while this
// panel is actually mounted (Open queue, unfiltered view), not polled
// elsewhere.
const AUTO_REFRESH_MS = 30 * 1000;

// The comparison panel used to persist a frozen "morning baseline"
// prediction, compared against a separately-tracked id list — dropped
// entirely (see commands::reman_compare_forecast_to_actual for the full
// history). "Predicted" is now always the same live number shown at the
// top of the panel; "Actual" is everything closed shop-wide today. Both
// sides come from one plain live query, no persistence, no separate
// tracked-id state to keep in sync. Only polled while this section is
// actually open — "do not overload the server" — on the same cadence as
// the main panel, since a tech closing out a job wants to see it land
// here without a long wait and this query is cheap.
const COMPARISON_REFRESH_MS = AUTO_REFRESH_MS;

/* ── Types (mirror PredictedMix / FamilyForecast / OpenQueueForecast in
     src-tauri/src/reman.rs) ──────────────────────────────────────────── */

interface PredictedMix {
  repaired: number;
  nonRepairable: number;
  noFaultFound: number;
  standardExchange: number;
  sold: number;
  sentToSubcontractor: number;
  other: number;
}

interface FamilyForecast {
  family: string;
  unitsWithTech: number;
  historicalSample: number;
  predicted: PredictedMix;
}

interface OpenQueueForecastData {
  unitsWithTech: number;
  unforecastable: number;
  predicted: PredictedMix;
  byFamily: FamilyForecast[];
  lookbackDays: number;
}

// Mirrors OutcomeBreakdown / ForecastComparison in src-tauri/src/commands.rs
interface ActualOutcomes {
  repaired: number;
  nonRepairable: number;
  noFaultFound: number;
  standardExchange: number;
  sold: number;
  sentToSubcontractor: number;
  other: number;
  inProgress: number;
}

// Mirrors ForecastAccuracyDay in src-tauri/src/commands.rs — one row per
// day the 17:25 daily snapshot has captured (see reman.rs's
// try_run_forecast_snapshot). Built storage-only at first ("it doesn't
// need to be displayed"); surfaced here once a real week of data existed
// and was asked for directly: "how was the prediction, are we spot on or
// way off... can we look at it in the app?"
interface ForecastAccuracyDay {
  date: string;
  unitsWithTech: number;
  predicted: PredictedMix;
  actual: ActualOutcomes;
}

interface ForecastComparison {
  // Size of the *cumulative* today population (currently open + already
  // closed today) — grows through the day, never shrinks. Deliberately
  // not the same number as the main panel's live unitsWithTech, which
  // moves both ways — see reman::forecast_today_cumulative's doc comment.
  unitsToday: number;
  predicted: PredictedMix;
  actual: ActualOutcomes;
}

// Same palette as RemanAnalytics.tsx, kept in sync so the two pages read
// as one visual language.
const COLOR_REPAIRED = 'rgb(var(--color-success-rgb))';
const COLOR_ND = 'rgb(var(--color-danger-rgb))';
const COLOR_NFF = 'rgb(var(--color-warning-rgb))';
const COLOR_EXCHANGE = 'rgb(var(--color-accent-rgb))';
const COLOR_SOLD = '#32ade6';
const COLOR_SUBCONTRACTOR = '#af52de';
const COLOR_OTHER = 'rgb(var(--color-text-tertiary-rgb) / 0.8)';

// Rounding each bucket independently (`Math.round`) can make the
// displayed parts not add up to the displayed whole — e.g. raw values
// 6.6/2.6/0.3/5.6/0.9 (true sum 18.0) round to 7/3/0/6/1 = 17. Flagged
// directly: "the numbers don't add up." Standard largest-remainder
// rounding: floor everything, then hand the leftover units to whichever
// values had the biggest fractional part, so the rounded parts always
// sum to exactly `target`.
function roundToSum(values: number[], target: number): number[] {
  const floors = values.map(v => Math.floor(v));
  const remainder = target - floors.reduce((a, b) => a + b, 0);
  const order = values
    .map((v, i) => ({ i, frac: v - floors[i] }))
    .sort((a, b) => b.frac - a.frac);
  const result = [...floors];
  for (let k = 0; k < remainder && k < order.length; k++) {
    result[order[k].i] += 1;
  }
  return result;
}

function mixTotal(m: PredictedMix): number {
  return m.repaired + m.nonRepairable + m.noFaultFound + m.standardExchange + m.sold + m.sentToSubcontractor + m.other;
}

export default function RemanForecast() {
  const { t } = useTranslation();
  const [data, setData] = useState<OpenQueueForecastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [, forceTick] = useState(0);
  const [comparison, setComparison] = useState<ForecastComparison | null>(null);
  const [comparing, setComparing] = useState(false);
  const [compareError, setCompareError] = useState('');
  const [showComparison, setShowComparison] = useState(false);
  const comparisonLoadedRef = useRef(false);
  const [history, setHistory] = useState<ForecastAccuracyDay[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const historyLoadedRef = useRef(false);

  const load = useCallback((isFirst: boolean) => {
    if (isFirst) setLoading(true); else setRefreshing(true);
    setError('');
    return invoke<OpenQueueForecastData>('reman_forecast_open_queue')
      .then(r => { setData(r); setLastUpdated(new Date()); })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => { if (isFirst) setLoading(false); else setRefreshing(false); });
  }, []);

  useEffect(() => {
    let cancelled = false;
    load(true);
    const interval = setInterval(() => { if (!cancelled) load(false); }, AUTO_REFRESH_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [load]);

  const loadComparison = useCallback(() => {
    const isFirst = !comparisonLoadedRef.current;
    if (isFirst) setComparing(true);
    setCompareError('');
    return invoke<ForecastComparison>('reman_compare_forecast_to_actual')
      .then(r => { setComparison(r); comparisonLoadedRef.current = true; })
      .catch((err: unknown) => setCompareError(err instanceof Error ? err.message : String(err)))
      .finally(() => { if (isFirst) setComparing(false); });
  }, []);

  // Only fetches/polls while the section is actually expanded — closing it
  // stops the interval rather than refreshing something hidden.
  useEffect(() => {
    if (!showComparison) return;
    let cancelled = false;
    loadComparison();
    const interval = setInterval(() => { if (!cancelled) loadComparison(); }, COMPARISON_REFRESH_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [showComparison, loadComparison]);

  const toggleComparison = () => setShowComparison(s => !s);

  // Fetched once on expand, not polled — this only changes once a day
  // (the 17:25 snapshot), unlike the live sections above. A manual
  // refresh button covers the rare case of checking right after a new
  // snapshot lands.
  const loadHistory = useCallback(() => {
    setHistoryLoading(true);
    setHistoryError('');
    return invoke<ForecastAccuracyDay[]>('reman_forecast_accuracy_history')
      .then(r => { setHistory(r); historyLoadedRef.current = true; })
      .catch((err: unknown) => setHistoryError(err instanceof Error ? err.message : String(err)))
      .finally(() => setHistoryLoading(false));
  }, []);

  useEffect(() => {
    if (showHistory && !historyLoadedRef.current) loadHistory();
  }, [showHistory, loadHistory]);

  const toggleHistory = () => setShowHistory(s => !s);

  // Ticks the "updated Xm ago" label once a minute without re-fetching.
  useEffect(() => {
    const tick = setInterval(() => forceTick(n => n + 1), 60 * 1000);
    return () => clearInterval(tick);
  }, []);

  const agoLabel = useMemo(() => {
    if (!lastUpdated) return null;
    const minutes = Math.floor((Date.now() - lastUpdated.getTime()) / 60000);
    return minutes < 1 ? t('reman.forecast.updated_now') : t('reman.forecast.updated_ago', { minutes });
  }, [lastUpdated, t]);

  const segments = useMemo(() => {
    if (!data) return [];
    const m = data.predicted;
    const raw = [
      { key: 'repaired', label: t('reman.analytics.outcome_repaired'), value: m.repaired, color: COLOR_REPAIRED },
      { key: 'exchange', label: t('reman.analytics.outcome_exchange'), value: m.standardExchange, color: COLOR_EXCHANGE },
      { key: 'sold', label: t('reman.analytics.outcome_sold'), value: m.sold, color: COLOR_SOLD },
      { key: 'nff', label: t('reman.analytics.outcome_nff'), value: m.noFaultFound, color: COLOR_NFF },
      { key: 'nd', label: t('reman.analytics.outcome_nd'), value: m.nonRepairable, color: COLOR_ND },
      { key: 'subcontractor', label: t('reman.analytics.outcome_subcontractor'), value: m.sentToSubcontractor, color: COLOR_SUBCONTRACTOR },
      { key: 'other', label: t('reman.analytics.outcome_other'), value: m.other, color: COLOR_OTHER },
    ];
    const rounded = roundToSum(raw.map(s => s.value), Math.round(mixTotal(m)));
    return raw.map((s, i) => ({ ...s, rounded: rounded[i] })).filter(s => s.value > 0.05);
  }, [data, t]);

  const total = data ? mixTotal(data.predicted) : 0;

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-4 animate-pulse">
        <div className="h-3.5 w-40 bg-elevated rounded" />
        <div className="h-6 w-full bg-elevated rounded-full mt-3" />
      </div>
    );
  }
  // A background refresh failure (network blip, server briefly
  // unreachable) shouldn't blank out a panel that already has good data —
  // only the very first load failing, or a genuinely empty bench, hides it.
  if ((error && !data) || !data || data.unitsWithTech === 0) {
    return null;
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4 relative overflow-hidden">
      <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full bg-accent/10 blur-2xl pointer-events-none" />
      <div className="flex items-start justify-between gap-3 relative">
        <div>
          <div className="flex items-center gap-1.5">
            <SparklesIcon className="w-3.5 h-3.5 text-accent" />
            <h3 className="text-sm font-semibold text-text-primary">{t('reman.forecast.title')}</h3>
            <button
              onClick={() => load(false)}
              disabled={refreshing}
              title={t('reman.forecast.refresh')}
              className="text-text-tertiary hover:text-accent transition-colors disabled:opacity-50"
            >
              <ArrowPathIcon className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <p className="text-[11px] text-text-tertiary mt-0.5">
            {t('reman.forecast.subtitle', { count: data.unitsWithTech })}
            {agoLabel && <span className="opacity-70"> · {agoLabel}</span>}
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-bold text-text-primary leading-none">{data.unitsWithTech}</div>
          <div className="text-[10px] text-text-tertiary mt-0.5">{t('reman.forecast.with_tech')}</div>
        </div>
      </div>

      {/* Stacked mix bar */}
      <div className="mt-3.5 flex h-3 rounded-full overflow-hidden bg-elevated">
        {segments.map(s => (
          <div
            key={s.key}
            style={{ width: `${(s.value / (total || 1)) * 100}%`, backgroundColor: s.color }}
            title={`${s.label}: ~${s.rounded}`}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
        {segments.map(s => (
          <div key={s.key} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-[11px] text-text-secondary">{s.label}</span>
            <span className="text-[11px] font-semibold text-text-primary">
              ~{s.rounded}
            </span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border gap-2">
        <p className="text-[10px] text-text-tertiary italic pr-3">
          {t('reman.forecast.caveat', { days: data.lookbackDays })}
          {data.unforecastable > 0 && ` ${t('reman.forecast.unforecastable', { count: data.unforecastable })}`}
        </p>
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={toggleComparison}
            className="flex items-center gap-0.5 text-[11px] font-medium text-accent hover:opacity-70 transition-opacity"
          >
            <ScaleIcon className="w-3 h-3" />
            {t('reman.forecast.compare')}
            {showComparison ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />}
          </button>
          <button
            onClick={toggleHistory}
            className="flex items-center gap-0.5 text-[11px] font-medium text-accent hover:opacity-70 transition-opacity"
          >
            <ChartBarIcon className="w-3 h-3" />
            {t('reman.forecast.history')}
            {showHistory ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />}
          </button>
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-0.5 text-[11px] font-medium text-accent hover:opacity-70 transition-opacity"
          >
            {t('reman.forecast.by_family')}
            {expanded ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />}
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {showComparison && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pt-3 border-t border-border mt-3">
              {comparing && <p className="text-xs text-text-tertiary">{t('common.loading')}</p>}
              {compareError && <p className="text-xs text-danger">{compareError}</p>}
              {comparison && (
                <ForecastComparisonView comparison={comparison} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {showHistory && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pt-3 border-t border-border mt-3">
              {historyLoading && <p className="text-xs text-text-tertiary">{t('common.loading')}</p>}
              {historyError && <p className="text-xs text-danger">{historyError}</p>}
              {history && (
                history.length === 0
                  ? <p className="text-xs text-text-tertiary italic">{t('reman.forecast.history_empty')}</p>
                  : <ForecastHistoryView days={history} onRefresh={loadHistory} refreshing={historyLoading} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pt-3 space-y-1.5">
              {data.byFamily.map(f => {
                const famTotal = mixTotal(f.predicted);
                const topOutcome = famTotal > 0 ? [
                  { label: t('reman.analytics.outcome_repaired'), v: f.predicted.repaired, c: COLOR_REPAIRED },
                  { label: t('reman.analytics.outcome_exchange'), v: f.predicted.standardExchange, c: COLOR_EXCHANGE },
                  { label: t('reman.analytics.outcome_sold'), v: f.predicted.sold, c: COLOR_SOLD },
                  { label: t('reman.analytics.outcome_nff'), v: f.predicted.noFaultFound, c: COLOR_NFF },
                  { label: t('reman.analytics.outcome_nd'), v: f.predicted.nonRepairable, c: COLOR_ND },
                  { label: t('reman.analytics.outcome_subcontractor'), v: f.predicted.sentToSubcontractor, c: COLOR_SUBCONTRACTOR },
                ].sort((a, b) => b.v - a.v)[0] : null;
                return (
                  <div
                    key={f.family}
                    className="grid grid-cols-[minmax(0,1.4fr)_2.5rem_minmax(0,1fr)_auto] items-center gap-2 text-[11px]"
                  >
                    <span className="text-text-secondary truncate" title={f.family}>{f.family}</span>
                    <span className="text-text-tertiary text-right shrink-0">{f.unitsWithTech}×</span>
                    {topOutcome && topOutcome.v > 0 ? (
                      <span className="flex items-center gap-1 text-text-tertiary truncate">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: topOutcome.c }} />
                        {t('reman.forecast.likely', { outcome: topOutcome.label })}
                      </span>
                    ) : (
                      <span className="text-text-tertiary italic">{t('reman.forecast.no_history')}</span>
                    )}
                    <span className="text-text-tertiary shrink-0 text-right">
                      {t('reman.forecast.sample', { count: f.historicalSample })}
                    </span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ForecastComparisonView({ comparison }: { comparison: ForecastComparison }) {
  const { t } = useTranslation();
  const { predicted, actual, unitsToday } = comparison;

  const rawRows: { label: string; predicted: number; actual: number; color: string }[] = [
    { label: t('reman.analytics.outcome_repaired'), predicted: predicted.repaired, actual: actual.repaired, color: COLOR_REPAIRED },
    { label: t('reman.analytics.outcome_exchange'), predicted: predicted.standardExchange, actual: actual.standardExchange, color: COLOR_EXCHANGE },
    { label: t('reman.analytics.outcome_sold'), predicted: predicted.sold, actual: actual.sold, color: COLOR_SOLD },
    { label: t('reman.analytics.outcome_nff'), predicted: predicted.noFaultFound, actual: actual.noFaultFound, color: COLOR_NFF },
    { label: t('reman.analytics.outcome_nd'), predicted: predicted.nonRepairable, actual: actual.nonRepairable, color: COLOR_ND },
    { label: t('reman.analytics.outcome_subcontractor'), predicted: predicted.sentToSubcontractor, actual: actual.sentToSubcontractor, color: COLOR_SUBCONTRACTOR },
    { label: t('reman.analytics.outcome_other'), predicted: predicted.other, actual: actual.other, color: COLOR_OTHER },
  ];
  // Same largest-remainder fix as the main panel's legend — round each
  // predicted bucket so they sum to exactly unitsToday rather than
  // independently rounding each one.
  const roundedPredicted = roundToSum(rawRows.map(r => r.predicted), Math.round(mixTotal(predicted)));
  const rows = rawRows.map((r, i) => ({ ...r, predictedRounded: roundedPredicted[i] }));

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-text-tertiary">
        {t('reman.forecast.compare_subtitle', { count: unitsToday })}
      </p>
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1 text-[11px]">
        <span className="text-text-tertiary font-medium">{t('reman.forecast.compare_outcome')}</span>
        <span className="text-text-tertiary font-medium text-right">{t('reman.forecast.compare_predicted')}</span>
        <span className="text-text-tertiary font-medium text-right">{t('reman.forecast.compare_actual')}</span>
        {rows.map(r => (
          <div key={r.label} className="contents">
            <span className="flex items-center gap-1.5 text-text-secondary">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
              {r.label}
            </span>
            <span className="text-text-tertiary text-right">~{r.predictedRounded}</span>
            <span className="text-text-primary font-semibold text-right">{r.actual}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function actualTotal(a: ActualOutcomes): number {
  return a.repaired + a.nonRepairable + a.noFaultFound + a.standardExchange + a.sold + a.sentToSubcontractor + a.other;
}

// Requested directly: "we must have at least a week of data now right,
// how was the prediction... can we look at it in the app?" Two views on
// the same captured history: an aggregate outcome-mix comparison (the
// question that actually matters — was the *rate* right, not just the
// count — computed only from days with at least one real closure, so
// e.g. a shop-closed weekend with 0 actual doesn't silently pull the mix
// toward nothing) and a per-day bench-size-vs-closed table, which makes
// the "predicted is total WIP, actual is one day's throughput" distinction
// visible rather than something only explained in a caveat sentence.
function ForecastHistoryView({
  days, onRefresh, refreshing,
}: {
  days: ForecastAccuracyDay[];
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const { t } = useTranslation();

  const openDays = days.filter(d => actualTotal(d.actual) > 0);
  const totalClosures = openDays.reduce((sum, d) => sum + actualTotal(d.actual), 0);

  const aggregateRows = useMemo(() => {
    const keys: { key: keyof PredictedMix; label: string; color: string }[] = [
      { key: 'repaired', label: t('reman.analytics.outcome_repaired'), color: COLOR_REPAIRED },
      { key: 'standardExchange', label: t('reman.analytics.outcome_exchange'), color: COLOR_EXCHANGE },
      { key: 'sold', label: t('reman.analytics.outcome_sold'), color: COLOR_SOLD },
      { key: 'noFaultFound', label: t('reman.analytics.outcome_nff'), color: COLOR_NFF },
      { key: 'nonRepairable', label: t('reman.analytics.outcome_nd'), color: COLOR_ND },
      { key: 'sentToSubcontractor', label: t('reman.analytics.outcome_subcontractor'), color: COLOR_SUBCONTRACTOR },
      { key: 'other', label: t('reman.analytics.outcome_other'), color: COLOR_OTHER },
    ];
    const predictedSum = keys.map(k => openDays.reduce((sum, d) => sum + d.predicted[k.key], 0));
    const actualSum = keys.map(k => openDays.reduce((sum, d) => sum + d.actual[k.key], 0));
    const predictedTotal = predictedSum.reduce((a, b) => a + b, 0);
    return keys
      .map((k, i) => ({
        label: k.label,
        color: k.color,
        predictedPct: predictedTotal > 0 ? (predictedSum[i] / predictedTotal) * 100 : 0,
        actualPct: totalClosures > 0 ? (actualSum[i] / totalClosures) * 100 : 0,
      }))
      .filter(r => r.predictedPct > 0.5 || r.actualPct > 0.5);
  }, [openDays, totalClosures, t]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-text-tertiary">
          {t('reman.forecast.history_subtitle', { days: openDays.length, closures: totalClosures })}
        </p>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          title={t('reman.forecast.refresh')}
          className="text-text-tertiary hover:text-accent transition-colors disabled:opacity-50 shrink-0"
        >
          <ArrowPathIcon className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {aggregateRows.length > 0 && (
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1 text-[11px]">
          <span className="text-text-tertiary font-medium">{t('reman.forecast.compare_outcome')}</span>
          <span className="text-text-tertiary font-medium text-right">{t('reman.forecast.history_predicted_pct')}</span>
          <span className="text-text-tertiary font-medium text-right">{t('reman.forecast.history_actual_pct')}</span>
          {aggregateRows.map(r => (
            <div key={r.label} className="contents">
              <span className="flex items-center gap-1.5 text-text-secondary">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                {r.label}
              </span>
              <span className="text-text-tertiary text-right">{r.predictedPct.toFixed(0)}%</span>
              <span className="text-text-primary font-semibold text-right">{r.actualPct.toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}

      <div className="pt-2 border-t border-border space-y-1">
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 text-[10px] text-text-tertiary font-medium">
          <span>{t('reman.forecast.history_date')}</span>
          <span className="text-right">{t('reman.forecast.history_bench')}</span>
          <span className="text-right">{t('reman.forecast.history_closed')}</span>
        </div>
        {[...days].reverse().map(d => {
          const closed = actualTotal(d.actual);
          const isOpen = closed > 0;
          return (
            <div key={d.date} className="grid grid-cols-[1fr_auto_auto] gap-x-3 text-[11px]">
              <span className="text-text-secondary">{d.date}</span>
              <span className="text-text-tertiary text-right">{d.unitsWithTech}</span>
              <span className={`text-right ${isOpen ? 'text-text-primary font-semibold' : 'text-text-tertiary italic'}`}>
                {isOpen ? closed : t('reman.forecast.history_shop_closed')}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
