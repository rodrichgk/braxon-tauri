import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/tauri';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import {
  ExclamationTriangleIcon, ArrowDownTrayIcon, WrenchScrewdriverIcon,
  CheckCircleIcon, ClockIcon, BanknotesIcon, ArrowUturnLeftIcon,
  ArchiveBoxIcon, ChatBubbleLeftRightIcon, DocumentTextIcon, SparklesIcon,
} from '@heroicons/react/24/outline';

/* ── Types (mirror RemanAnalytics / DayCount / OutcomeBreakdown /
     FamilyOutcome / TechnicianActivity in src-tauri/src/reman.rs) ──── */

interface DayCount {
  date: string;
  count: number;
}

interface DayAmount {
  date: string;
  totalTtc: number;
}

// `inProgress` is always 0 as of 2026-08-28 — `data.outcomes` is now
// close-date-scoped (see reman_analytics's "Outcome mix, by close date"
// doc comment), and a query that only ever returns already-closed jobs
// has nothing to put there. Kept on the type since `OutcomeBreakdown` is
// still the wire shape; not read anywhere in this file anymore.
interface OutcomeBreakdown {
  repaired: number;
  nonRepairable: number;
  noFaultFound: number;
  standardExchange: number;
  sold: number;
  sentToSubcontractor: number;
  other: number;
  inProgress: number;
}

interface FamilyOutcome {
  family: string;
  outcomes: OutcomeBreakdown;
}

// outcomes' `inProgress` is real here (unlike the range-scoped donut
// above) — this is the current outcome of the exact job set `units`
// counts, regardless of when each one closed, so a technician's
// still-open touches show up rather than being silently dropped.
interface TechnicianActivity {
  techId: string;
  techName?: string;
  units: number;
  outcomes: OutcomeBreakdown;
}

// Mirrors reman::ComebackStat — a raw count, not a rate (see its doc
// comment in reman.rs for why: the linked prior job can fall outside the
// selected window entirely, so dividing by this window's own volume would
// mix two different time periods into one misleading percentage).
interface ComebackStat {
  label: string;
  comebacks: number;
}

// Mirrors reman::ShopStatusSnapshot — a live "where are the open jobs
// right now" breakdown, requested directly in place of the old per-day
// intake average ("units in per day is not very important for me and it
// seems to be wrong anyway"): "the most interesting data is the units
// that are in the shop, in hands of technicians or waiting for
// information or devis." Bucketed from each open job's latest
// Intervention TypeCode — see shop_status_core's doc comment in reman.rs
// for exactly which TypeCode maps to which bucket (checked live against
// real jobs, not guessed). First version summed every open bench job into
// `totalOpen` regardless of `Commande.StatutDossier`, reporting 9461 —
// called out immediately as nonsense. `awaitingCustomerAgreement`
// (StatutDossier = "ATTENTE ACCORD") is kept as its own explicit number,
// deliberately excluded from `totalOpen` and every bucket below — a
// commercial backlog of pending quotes never touched by a technician
// (confirmed live, 0/300 sampled had even one Intervention row), not
// shop-floor presence.
interface ShopStatusSnapshot {
  totalOpen: number;
  withTechnician: number;
  awaitingParts: number;
  awaitingInfo: number;
  awaitingDevis: number;
  awaitingCleaning: number;
  other: number;
  awaitingCustomerAgreement: number;
}

interface RemanAnalyticsData {
  fromDate: string;
  toDate: string;
  totalIntake: number;
  dailyIntake: DayCount[];
  // Scoped by close date (LigCde.DateDernInterv BETWEEN fromDate/toDate),
  // not by when the job arrived — corrected 2026-08-28, see reman.rs's
  // "Outcome mix, by close date" doc comment for why (picking "Today" as
  // the range used to show an empty donut while 19 real jobs had closed
  // that day). `totalIntake`/`dailyIntake` above stay intake-date-scoped
  // — "units in" genuinely means arrivals.
  outcomes: OutcomeBreakdown;
  topFamilies: FamilyOutcome[];
  dailyTechnicianActivity: DayCount[];
  technicians: TechnicianActivity[];
  // Rough first pass — see reman.rs's RemanAnalytics.daily_revenue doc
  // comment for the known limitations (per-order not per-line amounts,
  // DateDernInterv used as a "closest available proxy" for close date).
  dailyRevenue: DayAmount[];
  totalRevenue: number;
  comebackCount: number;
  // Of comebackCount, how many followed a previous job whose outcome
  // doesn't reflect an unresolved defect — RAS, or a warranty claim
  // refused as a different fault / other stated reason. Excluded from the
  // two breakdowns below, which are scoped to genuine repair-quality
  // signals (see WARRANTY_REFUSAL_FIELDS's doc comment in reman.rs).
  comebackExcludedCount: number;
  comebacksByTechnician: ComebackStat[];
  comebacksByFamily: ComebackStat[];
}

const outcomeTotal = (o: OutcomeBreakdown) =>
  o.repaired + o.nonRepairable + o.noFaultFound + o.standardExchange + o.sold + o.sentToSubcontractor + o.other + o.inProgress;
const outcomeDecided = (o: OutcomeBreakdown) => outcomeTotal(o) - o.inProgress;
// "Transformation rate" — repaired, exchanged, or sold are all a
// successful outcome for a unit that came in, as opposed to ND/NFF
// (nothing was done) or sent-to-subcontractor/other. Requested directly:
// "it's not the repair rate but transformation rate... how many do we
// repair or exchange or sell, that's what's important. the mix."
const outcomeTransformed = (o: OutcomeBreakdown) => o.repaired + o.standardExchange + o.sold;

// iOS-system-color inspired palette, consistent with the app's existing
// success/warning/danger/accent theme tokens (see tailwind.config.js);
// extra hues added for outcomes this app's palette has no token for yet
// (sold, subcontractor, unclassified).
const COLOR_REPAIRED = 'rgb(var(--color-success-rgb))';
const COLOR_ND = 'rgb(var(--color-danger-rgb))';
const COLOR_NFF = 'rgb(var(--color-warning-rgb))';
const COLOR_EXCHANGE = 'rgb(var(--color-accent-rgb))';
const COLOR_SOLD = '#32ade6';
const COLOR_SUBCONTRACTOR = '#af52de';
const COLOR_OTHER = 'rgb(var(--color-text-tertiary-rgb) / 0.8)';
const COLOR_REVENUE = '#ffd60a';

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const eurFormatter = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const formatEUR = (n: number) => eurFormatter.format(n);

// Matches LIVE_CACHE_TTL_SECONDS (reman.rs, 15s as of 2026-08-31 — halved
// from 30s after "up to a minute" turned out to be this TTL's own
// worst-case delay, see INTERVENTIONS_REFRESH_MS in Reman.tsx) — polling
// faster than the cache's own TTL would just re-read the same cached
// payload every time, never anything fresher.
const SHOP_STATUS_REFRESH_MS = 15 * 1000;

type QuickRange = 'today' | '30d' | '90d' | '6m' | '1y';

// Technician leaderboard sort — "add some sorting thing, where i can
// choose to sort by the one with highest repairs, exchanges, sells, nff,
// nd." Order here is also the <select> option order.
const TECH_SORT_OPTIONS = ['units', 'repaired', 'exchange', 'sold', 'nff', 'nd', 'subcontractor', 'other'] as const;
type TechSortBy = typeof TECH_SORT_OPTIONS[number];

function rangeFor(quick: QuickRange): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  if (quick === 'today') { /* from === to, both today */ }
  else if (quick === '30d') from.setDate(from.getDate() - 30);
  else if (quick === '90d') from.setDate(from.getDate() - 90);
  else if (quick === '6m') from.setMonth(from.getMonth() - 6);
  else from.setFullYear(from.getFullYear() - 1);
  return { from: toISO(from), to: toISO(to) };
}

function KpiCard({
  icon, label, value, sub, tooltip,
}: { icon: React.ReactNode; label: string; value: string; sub?: string; tooltip?: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-start gap-3" title={tooltip}>
      <div className="w-9 h-9 rounded-lg bg-accent/10 text-accent flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        {/* Was truncate + one line — labels like "Transformation rate" /
            "Active technicians" / "Warranty comebacks" clipped to
            "Transformation ..." even with visible room to spare below.
            Wraps instead; the card's height is already flexible. */}
        <p className="text-[11px] text-text-tertiary leading-snug">{label}</p>
        <p className="text-xl font-bold text-text-primary leading-tight mt-0.5">{value}</p>
        {sub && <p className="text-[11px] text-text-tertiary mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        {subtitle && <p className="text-[11px] text-text-tertiary mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

const tickStyle = { fontSize: 10, fill: 'rgb(var(--color-text-tertiary-rgb))' };

function tooltipStyle() {
  return {
    contentStyle: {
      background: 'var(--color-card)',
      border: '1px solid var(--color-border)',
      borderRadius: 10,
      fontSize: 11,
      color: 'var(--color-text-primary)',
    },
    labelStyle: { color: 'var(--color-text-secondary)' },
  };
}

export default function RemanAnalytics() {
  const { t } = useTranslation();
  const [quick, setQuick] = useState<QuickRange | null>('6m');
  const [from, setFrom] = useState(() => rangeFor('6m').from);
  const [to, setTo] = useState(() => rangeFor('6m').to);
  const [data, setData] = useState<RemanAnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Live "right now" view — independent of the historical date-range
  // controls below, requested directly as headline content: "the most
  // interesting data is the units that are in the shop." The "mix of
  // outcomes" half of that same request is answered by `data.outcomes`
  // now that it's close-date-scoped (see RemanAnalyticsData.outcomes'
  // doc comment) — no separate live/day-scoped state needed for it
  // anymore, the Range picker above already covers "today" correctly.
  const [shopStatus, setShopStatus] = useState<ShopStatusSnapshot | null>(null);
  const [shopStatusError, setShopStatusError] = useState('');
  // Technician leaderboard view — "add the option to see transformation
  // rate" — units touched (existing) vs. transformation rate (new), same
  // technician order either way.
  const [techView, setTechView] = useState<'units' | 'transformation'>('units');
  const [techSortBy, setTechSortBy] = useState<TechSortBy>('units');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    invoke<RemanAnalyticsData>('reman_analytics', { fromDate: from, toDate: to })
      .then(r => { if (!cancelled) setData(r); })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [from, to]);

  useEffect(() => {
    let cancelled = false;
    const fetchShopStatus = () => {
      invoke<ShopStatusSnapshot>('reman_shop_status')
        .then(r => { if (!cancelled) { setShopStatus(r); setShopStatusError(''); } })
        .catch((err: unknown) => { if (!cancelled) setShopStatusError(err instanceof Error ? err.message : String(err)); });
    };
    fetchShopStatus();
    const interval = setInterval(fetchShopStatus, SHOP_STATUS_REFRESH_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const pickQuick = (q: QuickRange) => {
    setQuick(q);
    const r = rangeFor(q);
    setFrom(r.from);
    setTo(r.to);
  };

  const transformationRatePct = useMemo(() => {
    if (!data) return null;
    const decided = outcomeDecided(data.outcomes);
    if (decided === 0) return null;
    return Math.round((outcomeTransformed(data.outcomes) / decided) * 100);
  }, [data]);

  const outcomePieData = useMemo(() => {
    if (!data) return [];
    const o = data.outcomes;
    return [
      { key: 'repaired', name: t('reman.analytics.outcome_repaired'), value: o.repaired, color: COLOR_REPAIRED },
      { key: 'exchange', name: t('reman.analytics.outcome_exchange'), value: o.standardExchange, color: COLOR_EXCHANGE },
      { key: 'sold', name: t('reman.analytics.outcome_sold'), value: o.sold, color: COLOR_SOLD },
      { key: 'nff', name: t('reman.analytics.outcome_nff'), value: o.noFaultFound, color: COLOR_NFF },
      { key: 'nd', name: t('reman.analytics.outcome_nd'), value: o.nonRepairable, color: COLOR_ND },
      { key: 'subcontractor', name: t('reman.analytics.outcome_subcontractor'), value: o.sentToSubcontractor, color: COLOR_SUBCONTRACTOR },
      { key: 'other', name: t('reman.analytics.outcome_other'), value: o.other, color: COLOR_OTHER },
    ].filter(d => d.value > 0);
  }, [data, t]);

  const familyChartData = useMemo(() => {
    if (!data) return [];
    return data.topFamilies.map(f => ({
      family: f.family,
      [t('reman.analytics.outcome_repaired')]: f.outcomes.repaired,
      [t('reman.analytics.outcome_exchange')]: f.outcomes.standardExchange,
      [t('reman.analytics.outcome_sold')]: f.outcomes.sold,
      [t('reman.analytics.outcome_nff')]: f.outcomes.noFaultFound,
      [t('reman.analytics.outcome_nd')]: f.outcomes.nonRepairable,
      [t('reman.analytics.outcome_subcontractor')]: f.outcomes.sentToSubcontractor,
      [t('reman.analytics.outcome_other')]: f.outcomes.other,
    }));
  }, [data, t]);

  const sortedTechnicians = useMemo(() => {
    if (!data) return [];
    const keyFor: Record<TechSortBy, (t: TechnicianActivity) => number> = {
      units: t => t.units,
      repaired: t => t.outcomes.repaired,
      exchange: t => t.outcomes.standardExchange,
      sold: t => t.outcomes.sold,
      nff: t => t.outcomes.noFaultFound,
      nd: t => t.outcomes.nonRepairable,
      subcontractor: t => t.outcomes.sentToSubcontractor,
      other: t => t.outcomes.other,
    };
    return [...data.technicians].sort((a, b) => keyFor[techSortBy](b) - keyFor[techSortBy](a));
  }, [data, techSortBy]);

  const technicianChartData = useMemo(() => {
    return sortedTechnicians.slice(0, 12).map(tech => ({
      tech: tech.techName || t('reman.analytics.tech_unknown', { id: tech.techId }),
      [t('reman.analytics.outcome_repaired')]: tech.outcomes.repaired,
      [t('reman.analytics.outcome_exchange')]: tech.outcomes.standardExchange,
      [t('reman.analytics.outcome_sold')]: tech.outcomes.sold,
      [t('reman.analytics.outcome_nff')]: tech.outcomes.noFaultFound,
      [t('reman.analytics.outcome_nd')]: tech.outcomes.nonRepairable,
      [t('reman.analytics.outcome_subcontractor')]: tech.outcomes.sentToSubcontractor,
      [t('reman.analytics.outcome_other')]: tech.outcomes.other,
    }));
  }, [sortedTechnicians, t]);

  const shopStatusBuckets = useMemo(() => {
    if (!shopStatus) return [];
    return [
      { key: 'with_technician', label: t('reman.analytics.shop_with_technician'), value: shopStatus.withTechnician, icon: <WrenchScrewdriverIcon className="w-4 h-4" /> },
      { key: 'awaiting_parts', label: t('reman.analytics.shop_awaiting_parts'), value: shopStatus.awaitingParts, icon: <ArchiveBoxIcon className="w-4 h-4" /> },
      { key: 'awaiting_info', label: t('reman.analytics.shop_awaiting_info'), value: shopStatus.awaitingInfo, icon: <ChatBubbleLeftRightIcon className="w-4 h-4" /> },
      { key: 'awaiting_devis', label: t('reman.analytics.shop_awaiting_devis'), value: shopStatus.awaitingDevis, icon: <DocumentTextIcon className="w-4 h-4" /> },
      { key: 'awaiting_cleaning', label: t('reman.analytics.shop_awaiting_cleaning'), value: shopStatus.awaitingCleaning, icon: <SparklesIcon className="w-4 h-4" /> },
      { key: 'other', label: t('reman.analytics.shop_other'), value: shopStatus.other, icon: <ClockIcon className="w-4 h-4" /> },
    ].filter(b => b.value > 0);
  }, [shopStatus, t]);

  const QUICK_RANGES: { id: QuickRange; label: string }[] = [
    { id: 'today', label: t('reman.analytics.range_today') },
    { id: '30d', label: t('reman.analytics.range_30d') },
    { id: '90d', label: t('reman.analytics.range_90d') },
    { id: '6m', label: t('reman.analytics.range_6m') },
    { id: '1y', label: t('reman.analytics.range_1y') },
  ];

  return (
    <div className="space-y-4">
      {/* Where the open jobs actually are — live, "right now," independent
          of the date-range controls below. This used to be a plain
          Commande.StatutDossier bar list scoped to the selected historical
          range; updated in place rather than left redundant next to a new
          card, after the first version of this replacement (a standalone
          "Shop status" card above this one) reported total_open=9461 and
          was correctly called out as nonsense — see shop_status_core's doc
          comment in reman.rs for the full diagnosis (ATTENTE ACCORD, 7055
          of that number, is a commercial backlog never touched by a
          technician, not shop-floor presence; CLOTURE, another 2359, is
          administratively dead). */}
      <ChartCard title={t('reman.analytics.chart_open_status_title')} subtitle={t('reman.analytics.chart_open_status_sub')}>
        {shopStatusError && <p className="text-xs text-danger">{shopStatusError}</p>}
        {!shopStatusError && !shopStatus && <p className="text-xs text-text-tertiary">{t('reman.analytics.loading')}</p>}
        {shopStatus && (
          <>
            <p className="text-3xl font-bold text-text-primary leading-none">{shopStatus.totalOpen.toLocaleString()}</p>
            <p className="text-[11px] text-text-tertiary mt-1">{t('reman.analytics.shop_total_open')}</p>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {shopStatusBuckets.map(b => (
                <span
                  key={b.key}
                  className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-elevated border border-border text-text-secondary"
                >
                  <span className="text-accent">{b.icon}</span>
                  {b.label}
                  <span className="font-bold text-text-primary">{b.value.toLocaleString()}</span>
                </span>
              ))}
            </div>
            {shopStatus.awaitingCustomerAgreement > 0 && (
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-xs text-text-secondary">
                  <span className="font-bold text-text-primary">{shopStatus.awaitingCustomerAgreement.toLocaleString()}</span>{' '}
                  {t('reman.analytics.shop_awaiting_agreement_label')}
                </p>
                <p className="text-[10px] text-text-tertiary mt-0.5">{t('reman.analytics.shop_awaiting_agreement_hint')}</p>
              </div>
            )}
          </>
        )}
      </ChartCard>

      {/* Date range controls */}
      <div className="bg-card border border-border rounded-xl p-3 flex flex-wrap items-center gap-3">
        <div className="flex gap-1.5">
          {QUICK_RANGES.map(r => (
            <button
              key={r.id}
              onClick={() => pickQuick(r.id)}
              className={[
                'text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border transition-all',
                quick === r.id
                  ? 'bg-accent text-white border-accent'
                  : 'bg-elevated border-border text-text-secondary hover:text-text-primary hover:border-accent/30',
              ].join(' ')}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto text-xs">
          <input
            type="date"
            value={from}
            max={to}
            onChange={e => { setQuick(null); setFrom(e.target.value); }}
            className="bg-elevated border border-border rounded-lg px-2 py-1.5 text-text-primary text-xs focus:outline-none focus:ring-1 focus:ring-accent/40"
            style={{ colorScheme: 'inherit' }}
          />
          <span className="text-text-tertiary">→</span>
          <input
            type="date"
            value={to}
            min={from}
            max={toISO(new Date())}
            onChange={e => { setQuick(null); setTo(e.target.value); }}
            className="bg-elevated border border-border rounded-lg px-2 py-1.5 text-text-primary text-xs focus:outline-none focus:ring-1 focus:ring-accent/40"
            style={{ colorScheme: 'inherit' }}
          />
        </div>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 flex items-start gap-2">
          <ExclamationTriangleIcon className="w-4 h-4 text-danger shrink-0 mt-0.5" />
          <div>
            <p className="text-xs text-danger">{error}</p>
            <p className="text-[10px] text-danger/70 mt-1">{t('reman.network_hint')}</p>
          </div>
        </div>
      )}

      {loading && !data && (
        <div className="text-center py-16 text-text-tertiary text-sm">{t('reman.analytics.loading')}</div>
      )}

      {data && (
        <div className={loading ? 'opacity-50 transition-opacity space-y-4' : 'space-y-4 transition-opacity'}>
          {/* KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <KpiCard
              icon={<ArrowDownTrayIcon className="w-4.5 h-4.5" />}
              label={t('reman.analytics.kpi_intake')}
              value={data.totalIntake.toLocaleString()}
            />
            <KpiCard
              icon={<CheckCircleIcon className="w-4.5 h-4.5" />}
              label={t('reman.analytics.kpi_transformation_rate')}
              value={transformationRatePct !== null ? `${transformationRatePct}%` : '—'}
              sub={t('reman.analytics.kpi_transformation_rate_sub', { count: outcomeDecided(data.outcomes) })}
              tooltip={t('reman.analytics.kpi_transformation_rate_tooltip')}
            />
            <KpiCard
              icon={<WrenchScrewdriverIcon className="w-4.5 h-4.5" />}
              label={t('reman.analytics.kpi_technicians')}
              value={String(data.technicians.length)}
              sub={t('reman.analytics.kpi_technicians_sub')}
            />
            <KpiCard
              icon={<BanknotesIcon className="w-4.5 h-4.5" />}
              label={t('reman.analytics.kpi_revenue')}
              value={formatEUR(data.totalRevenue)}
              sub={t('reman.analytics.kpi_revenue_sub')}
              tooltip={t('reman.analytics.kpi_revenue_tooltip')}
            />
            <KpiCard
              icon={<ArrowUturnLeftIcon className="w-4.5 h-4.5" />}
              label={t('reman.analytics.kpi_comebacks')}
              value={data.comebackCount.toLocaleString()}
              sub={
                data.comebackExcludedCount > 0
                  ? t('reman.analytics.kpi_comebacks_sub_with_nff', { count: data.comebackExcludedCount })
                  : t('reman.analytics.kpi_comebacks_sub')
              }
              tooltip={t('reman.analytics.kpi_comebacks_tooltip')}
            />
          </div>

          {/* Daily revenue — rough estimate, closed jobs only */}
          <ChartCard
            title={t('reman.analytics.chart_revenue_title')}
            subtitle={t('reman.analytics.chart_revenue_sub')}
          >
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.dailyRevenue} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="date" tick={tickStyle} minTickGap={30} />
                <YAxis tick={tickStyle} width={48} tickFormatter={v => formatEUR(v)} />
                <Tooltip {...tooltipStyle()} formatter={v => formatEUR(Number(v))} />
                <Bar dataKey="totalTtc" name={t('reman.analytics.legend_revenue')} fill={COLOR_REVENUE} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Outcome breakdown donut — close-date-scoped (see
                RemanAnalyticsData.outcomes' doc comment), so this is
                correct for any range, including picking "Today": it now
                shows the real day's outcome mix directly, no separate
                per-day view needed. */}
            <ChartCard title={t('reman.analytics.chart_outcomes_title')} subtitle={t('reman.analytics.chart_outcomes_sub')}>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={outcomePieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {outcomePieData.map(entry => <Cell key={entry.key} fill={entry.color} />)}
                  </Pie>
                  <Tooltip {...tooltipStyle()} />
                  <Legend
                    layout="vertical"
                    align="right"
                    verticalAlign="middle"
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 11, color: 'var(--color-text-secondary)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Technician daily activity */}
            <ChartCard title={t('reman.analytics.chart_tech_activity_title')} subtitle={t('reman.analytics.chart_tech_activity_sub')}>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={data.dailyTechnicianActivity} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="date" tick={tickStyle} minTickGap={30} />
                  <YAxis tick={tickStyle} allowDecimals={false} width={32} />
                  <Tooltip {...tooltipStyle()} />
                  <Line type="monotone" dataKey="count" name={t('reman.analytics.legend_units')}
                    stroke={COLOR_REPAIRED} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Top families, stacked outcome bars */}
          {familyChartData.length > 0 && (
            <ChartCard title={t('reman.analytics.chart_families_title')} subtitle={t('reman.analytics.chart_families_sub')}>
              <ResponsiveContainer width="100%" height={Math.max(220, familyChartData.length * 34)}>
                <BarChart data={familyChartData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                  <XAxis type="number" tick={tickStyle} allowDecimals={false} />
                  <YAxis type="category" dataKey="family" tick={tickStyle} width={90} />
                  <Tooltip {...tooltipStyle()} />
                  <Bar dataKey={t('reman.analytics.outcome_repaired')} stackId="o" fill={COLOR_REPAIRED} radius={[0, 0, 0, 0]} />
                  <Bar dataKey={t('reman.analytics.outcome_exchange')} stackId="o" fill={COLOR_EXCHANGE} />
                  <Bar dataKey={t('reman.analytics.outcome_sold')} stackId="o" fill={COLOR_SOLD} />
                  <Bar dataKey={t('reman.analytics.outcome_nff')} stackId="o" fill={COLOR_NFF} />
                  <Bar dataKey={t('reman.analytics.outcome_nd')} stackId="o" fill={COLOR_ND} />
                  <Bar dataKey={t('reman.analytics.outcome_subcontractor')} stackId="o" fill={COLOR_SUBCONTRACTOR} />
                  <Bar dataKey={t('reman.analytics.outcome_other')} stackId="o" fill={COLOR_OTHER} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* Technician leaderboard — requested directly: "use the same
              thing we used for outcome per family" (the stacked bars
              below, reusing familyChartData's exact structure/colors) and
              "add some sorting thing... sort by the one with highest
              repairs, exchanges, sells, nff, nd." Units-touched mode
              keeps the plain bar list; outcome-mix mode is the same
              stacked BarChart as "Repairability by family," just keyed by
              technician. The sort control applies to both. */}
          {data.technicians.length > 0 && (
            <ChartCard title={t('reman.analytics.chart_tech_leaderboard_title')} subtitle={t('reman.analytics.chart_tech_leaderboard_sub')}>
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <div className="flex gap-1 bg-elevated border border-border rounded-lg p-0.5 w-fit">
                  {(['units', 'transformation'] as const).map(view => (
                    <button
                      key={view}
                      type="button"
                      onClick={() => setTechView(view)}
                      className={[
                        'text-[11px] font-semibold px-2.5 py-1 rounded-md transition-all',
                        techView === view ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary',
                      ].join(' ')}
                    >
                      {t(view === 'units' ? 'reman.analytics.tech_view_units' : 'reman.analytics.tech_view_mix')}
                    </button>
                  ))}
                </div>
                <select
                  value={techSortBy}
                  onChange={e => setTechSortBy(e.target.value as TechSortBy)}
                  className="ml-auto bg-elevated border border-border rounded-lg px-2 py-1 text-[11px] text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/40"
                >
                  {TECH_SORT_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{t(`reman.analytics.tech_sort_${opt}`)}</option>
                  ))}
                </select>
              </div>

              {techView === 'units' ? (
                <div className="space-y-1.5">
                  {sortedTechnicians.slice(0, 12).map((tech, i) => {
                    const max = sortedTechnicians[0]?.units || 1;
                    const pct = Math.max(4, Math.round((tech.units / max) * 100));
                    return (
                      <div key={tech.techId} className="flex items-center gap-2.5">
                        <span className="text-[10px] text-text-tertiary w-4 text-right shrink-0">{i + 1}</span>
                        <span className="text-xs text-text-secondary w-32 truncate shrink-0">
                          {tech.techName || t('reman.analytics.tech_unknown', { id: tech.techId })}
                        </span>
                        <div className="flex-1 h-4 bg-elevated rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-accent/70" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs font-semibold text-text-primary w-10 text-right shrink-0">
                          {tech.units}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(220, technicianChartData.length * 34)}>
                  <BarChart data={technicianChartData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                    <XAxis type="number" tick={tickStyle} allowDecimals={false} />
                    <YAxis type="category" dataKey="tech" tick={tickStyle} width={100} />
                    <Tooltip {...tooltipStyle()} />
                    <Bar dataKey={t('reman.analytics.outcome_repaired')} stackId="o" fill={COLOR_REPAIRED} radius={[0, 0, 0, 0]} />
                    <Bar dataKey={t('reman.analytics.outcome_exchange')} stackId="o" fill={COLOR_EXCHANGE} />
                    <Bar dataKey={t('reman.analytics.outcome_sold')} stackId="o" fill={COLOR_SOLD} />
                    <Bar dataKey={t('reman.analytics.outcome_nff')} stackId="o" fill={COLOR_NFF} />
                    <Bar dataKey={t('reman.analytics.outcome_nd')} stackId="o" fill={COLOR_ND} />
                    <Bar dataKey={t('reman.analytics.outcome_subcontractor')} stackId="o" fill={COLOR_SUBCONTRACTOR} />
                    <Bar dataKey={t('reman.analytics.outcome_other')} stackId="o" fill={COLOR_OTHER} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
              <p className="text-[10px] text-text-tertiary mt-3 italic">
                {t('reman.analytics.tech_name_caveat')}
              </p>
            </ChartCard>
          )}

          {/* Warranty comebacks — LigCde.SuiviGar_AncNoInterv, raw counts
              not rates, see ComebackStat's doc comment in reman.rs */}
          {(data.comebacksByTechnician.length > 0 || data.comebacksByFamily.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {data.comebacksByTechnician.length > 0 && (
                <ChartCard
                  title={t('reman.analytics.chart_comebacks_tech_title')}
                  subtitle={t('reman.analytics.chart_comebacks_tech_sub')}
                >
                  <div className="space-y-1.5">
                    {data.comebacksByTechnician.map((c, i) => {
                      const max = data.comebacksByTechnician[0]?.comebacks || 1;
                      const pct = Math.max(4, Math.round((c.comebacks / max) * 100));
                      return (
                        <div key={c.label} className="flex items-center gap-2.5">
                          <span className="text-[10px] text-text-tertiary w-4 text-right shrink-0">{i + 1}</span>
                          <span className="text-xs text-text-secondary w-32 truncate shrink-0">{c.label}</span>
                          <div className="flex-1 h-4 bg-elevated rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-danger/70" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs font-semibold text-text-primary w-10 text-right shrink-0">
                            {c.comebacks}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </ChartCard>
              )}
              {data.comebacksByFamily.length > 0 && (
                <ChartCard
                  title={t('reman.analytics.chart_comebacks_family_title')}
                  subtitle={t('reman.analytics.chart_comebacks_family_sub')}
                >
                  <div className="space-y-1.5">
                    {data.comebacksByFamily.map((c, i) => {
                      const max = data.comebacksByFamily[0]?.comebacks || 1;
                      const pct = Math.max(4, Math.round((c.comebacks / max) * 100));
                      return (
                        <div key={c.label} className="flex items-center gap-2.5">
                          <span className="text-[10px] text-text-tertiary w-4 text-right shrink-0">{i + 1}</span>
                          <span className="text-xs text-text-secondary w-32 truncate shrink-0" title={c.label}>
                            {c.label}
                          </span>
                          <div className="flex-1 h-4 bg-elevated rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-danger/70" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs font-semibold text-text-primary w-10 text-right shrink-0">
                            {c.comebacks}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </ChartCard>
              )}
            </div>
          )}
          {data.comebackExcludedCount > 0 && (
            <p className="text-[10px] text-text-tertiary italic -mt-2">
              {t('reman.analytics.comebacks_nff_caveat', { count: data.comebackExcludedCount })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
