import { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/tauri';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MagnifyingGlassIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  BriefcaseIcon,
  UserGroupIcon,
  ArchiveBoxIcon,
  ShoppingCartIcon,
  ExclamationTriangleIcon,
  ChartBarIcon,
  UserCircleIcon,
  ArrowPathIcon,
  ShieldCheckIcon,
  PlusIcon,
  CheckCircleIcon,
  BanknotesIcon,
  XMarkIcon,
  ClockIcon,
  WrenchScrewdriverIcon,
  BookmarkIcon,
  BeakerIcon,
  CpuChipIcon,
  SignalIcon,
  ArrowUturnLeftIcon,
  ClipboardDocumentCheckIcon,
  PaperAirplaneIcon,
  SparklesIcon,
  DocumentTextIcon,
  TrashIcon,
  LockClosedIcon,
  QrCodeIcon,
} from '@heroicons/react/24/outline';
import { useSession, UserRole } from '@/contexts/SessionContext';
import RemanAnalytics from '@/components/RemanAnalytics';
import ScanModal from '@/components/ScanModal';
import Spinner, { LoadingRow } from '@/components/Spinner';
import RemanForecast from '@/components/RemanForecast';
import RemanRoster from '@/components/RemanRoster';
import RemanFinance from '@/components/RemanFinance';
import RepairKnowledgeBase, {
  EntryForm, EMPTY_FORM,
  type KnowledgeTagSuggestions, type KnowledgeEntry as KnowledgeEntryRecord, type EntryFormState,
} from '@/components/RepairKnowledgeBase';
import { useTestSession } from '@/contexts/TestSessionContext';
import { TEST_ACTION_SECTIONS, TEST_ACTION_SECTION_LABELS, type TestActionItem } from '@/lib/testsActionsSystematiques';

// Queue worklists (Suivi d'interventions, Suivi service commercial, Attente
// de nettoyage, etc.) change as technicians work through jobs — requested
// directly: "these should update, of course only when it's active as well
// nd not overload the db." Only the currently-selected queue tab refetches
// (switching queues/tabs restarts this effect for the new one and drops
// the old interval), and the whole page unmounts when navigating away from
// REMAN entirely (see App.tsx's currentPage switch), so nothing polls while
// out of view. Was 60 seconds (before that, 3 minutes), deliberately not
// lowered further at the time because reman_search_interventions still hit
// 4D directly on every poll — halving the interval would've doubled that
// direct load. Reported directly as still too slow ("60 seconds is a
// lot"), which is what finally made wiring this into the shared Postgres
// cache (reman.rs's "Search caching" doc comment) worth doing: up to 15
// clients watching the same queue now share one real 4D scan per
// LIVE_CACHE_TTL_SECONDS window instead of each hitting 4D on their own
// timer, so this can come down without multiplying real load. Matches
// LIVE_CACHE_TTL_SECONDS/SHOP_STATUS_REFRESH_MS (reman.rs / RemanAnalytics.tsx) —
// polling faster than the cache's own TTL would just re-read the same
// cached payload every time.
// Halved again, 30s -> 15s, matching LIVE_CACHE_TTL_SECONDS (reman.rs) —
// reported directly: a colleague's change from the native 4D client
// could take "up to a minute" to show up here. That was exactly this
// constant's + the cache TTL's worst-case sum when both sat at 30s (a
// change landing right after a cache refresh, then this client's own
// poll landing inside that stale window before trying again). Halving
// both closes that gap to ~30s worst case.
const INTERVENTIONS_REFRESH_MS = 15 * 1000;

/* ── Types (mirror src-tauri/src/reman.rs) ─────────────────── */

// Hydraulic-vs-ECU lexical hint from the client-reported symptom, ABS
// (Type_Service=101) jobs only — mirrors reman::AbsFaultHint. See
// classify_abs_fault_hint's doc comment in reman.rs for methodology and
// the real-data numbers behind it.
type AbsFaultHint = 'hydraulic' | 'ecu';

// A technician's own confirmed read on a unit — mirrors
// reman::VerifiedFaultType. Always takes precedence over absFaultHint
// wherever both are shown.
type VerifiedFaultTypeValue = 'hydraulic' | 'ecu' | 'both';

// Mirrors reman::VerifiedFaultTypeRecord.
interface VerifiedFaultTypeRecord {
  faultType: VerifiedFaultTypeValue;
  verifiedByTechName?: string;
  verifiedAt?: string;
}

interface InterventionSummary {
  id: string;
  reference?: string;
  clientName?: string;
  codeArt?: string;
  libelleArt?: string;
  // ArticleMeteor.Designation — same "family" reman_analytics's
  // top_families/comebacks_by_family already use.
  family?: string;
  vehiclePlate?: string;
  vehicleModel?: string;
  limLivraison?: string;
  dateDernInterv?: string;
  statut?: string;
  // LigCde.Garantie ("SG" in the real 4D grid) — only ever populated for
  // the Open queue (see reman.rs), always false elsewhere.
  underWarranty?: boolean;
  absFaultHint?: AbsFaultHint;
  // LigCde.SuiviGar_AncNoInterv is set — a warranty comeback from a prior
  // job. List-level only knows "yes/no"; the resolved link (who/when/
  // outcome) is InterventionDetail.previousJob, detail-view only.
  hasPreviousJob?: boolean;
  verifiedFaultType?: VerifiedFaultTypeRecord;
}

// Mirrors reman::PreviousJobLink.
interface PreviousJobLink {
  id: string;
  reference?: string;
  dateDernInterv?: string;
  techName?: string;
  statut?: string;
  outcome: JobOutcomeFlags;
  // RAS, or SGRAS/SGRefuseePanneDiff/SGRefuseeAutreMotif — none of these
  // mean the original repair failed (confirmed directly by the workflow
  // owner). Drives the neutral-vs-danger styling below.
  warrantyRefused: boolean;
}

interface InterventionLine {
  id: string;
  codeArt?: string;
  libArt?: string;
  prixHt?: string;
  prixNet?: string;
}

interface ClientAddress {
  id: string;
  adr1?: string;
  adr2?: string;
  cp?: string;
  ville?: string;
  nomContact?: string;
}

// One row of the job's full step history (mirrors reman::InterventionStep)
// — confirmed live 2026-08-03 against a real 4D screenshot: the step
// grid's "intervention" column is typeLibelle, and each step's own comment
// (empty for most steps) is its own commentaire.
interface InterventionStep {
  id: string;
  date?: string;
  heure?: string;
  techId?: string;
  techName?: string;
  typeCode?: string;
  typeLibelle?: string;
  commentaire?: string;
}

// The "OFFRE RETENUE" checkboxes plus Garantie/ND/RAS — mirrors
// reman::JobOutcomeFlags.
interface JobOutcomeFlags {
  underWarranty: boolean;
  nonRepairable: boolean;
  noFaultFound: boolean;
  reparation: boolean;
  vente: boolean;
  echangeStandard: boolean;
  avance: boolean;
}

// Mirrors reman::JobAmounts.
interface JobAmounts {
  prixHt?: string;
  remise?: string;
  mtLignes?: string;
  mtPort?: string;
  mtHtTotal?: string;
  mtTva?: string;
  mtTtc?: string;
}

interface InterventionDetail extends InterventionSummary {
  commentaire?: string;
  clientId?: string;
  clientVille?: string;
  clientCp?: string;
  clientContact?: string;
  clientTel?: string;
  clientEmail?: string;
  address?: ClientAddress;
  refClient?: string;
  marque?: string;
  famille?: string;
  segmentation?: string;
  service?: string;
  delaiLigne?: string;
  commentaireClient?: string;
  commentaireInterne?: string;
  outcome: JobOutcomeFlags;
  amounts: JobAmounts;
  tempsPasse?: string;
  steps: InterventionStep[];
  lines: InterventionLine[];
  // LigCde.Soldée — lets the UI hide write actions (add a step, close as
  // repaired) once a job is already closed.
  soldee: boolean;
  // NoInt_ParamTest ids already recorded for this job across any step —
  // seeds the Tests & Actions checklist so items checked on an earlier
  // ER/ATN step don't reset when the form reopens.
  testsActionsSelected: number[];
  previousJob?: PreviousJobLink;
  // Accessories attached to this job (e.g. "Support de fixation") and
  // whether each one's physical presence has been confirmed — see
  // reman.rs's accessoires_for doc comment. Empty for jobs with none.
  accessoires: AccessoireRecord[];
  // Commande.Representant — who this job is assigned to on the
  // commercial/dispatch side, a distinct concept from "who last worked on
  // it" (steps[0]/TechDernInterv). Reported directly as a real gap: see
  // representant_name's doc comment in reman.rs. representantName is only
  // set for the handful of codes hand-confirmed against a real name —
  // representantCode (the raw 2-3 letter initials) is always shown even
  // when the name isn't resolvable.
  representantCode?: string;
  representantName?: string;
}

interface AccessoireRecord {
  id: string;
  label: string;
  confirmed: boolean;
}

// Mirrors src-tauri/src/reman.rs's HydraulicReportSummary — a report saved
// from the F2-EVO Hydraulic dashboard against this job (see
// HydraulicBenchDashboard.tsx's handleSaveReport).
interface HydraulicReportSummary {
  id: number;
  reportType: string;
  reportText: string;
  createdAt: string;
}

// Mirrors src-tauri/src/reman.rs's JobLockStatus — see
// reman_acquire_job_lock's doc comment and InterventionRow's lock effect.
interface JobLockStatus {
  heldByMe: boolean;
  lockedByOther: boolean;
  otherTechName?: string;
}

interface ClientSummary {
  id: string;
  nom?: string;
  ville?: string;
  tel?: string;
  cp?: string;
}

interface ClientDetail extends ClientSummary {
  intitule?: string;
  fax?: string;
  email?: string;
  commentaire?: string;
  addresses: ClientAddress[];
}

interface ArticleSummary {
  codeArt: string;
  designation?: string;
  constructeur?: string;
  famille?: string;
}

interface StockUnit {
  id: string;
  noIdentif?: string;
  localisation?: string;
  dateSortie?: string;
}

// Internal core/stock-unit processing (repaired-for-restock, confirmed-
// fine, or scrapped), distinct from a customer job — see reman.rs's
// StockProcessingRecord doc comment for how this is identified
// (NomClient empty, confirmed live 100% clean across 824 sampled rows).
interface StockProcessingRecord {
  ligcdeId: string;
  date?: string;
  typeCode?: string;
  outcome?: string;
}

interface ArticleStockDetail extends ArticleSummary {
  stock: StockUnit[];
  swapQty?: string;
  processingHistory: StockProcessingRecord[];
}

// One article's most recent core-processing event — feeds the Stock
// tab's default view (before any search term is typed). Superset of
// ArticleSummary, so it can be handed straight to ArticleRow.
interface RecentStockActivity extends ArticleSummary {
  lastProcessedDate?: string;
  lastOutcome?: string;
  lastTypeCode?: string;
}

// Réparation/R.A.S. = SWAP both mean the core unit is fine or was fixed
// and is going back into stock as swap-ready; Non Dépannable = Défect
// means it's scrapped. TypeCode-based (not the raw label text) so it
// doesn't depend on exact French wording matching everywhere it's used.
function stockOutcomeTone(typeCode?: string): 'ready' | 'scrapped' | 'other' {
  if (typeCode === 'R' || typeCode === 'RAS') return 'ready';
  if (typeCode === 'ND') return 'scrapped';
  return 'other';
}

interface AchatRequestSummary {
  id: string;
  noDemande?: string;
  dateDemande?: string;
  codeArticle?: string;
  descriptif?: string;
  qte?: string;
  qteRecue?: string;
  etape?: string;
  nomTech?: string;
}

// Every reman_search_* command caps at 50 rows server-side (see reman.rs) —
// used to show "50+" instead of implying that's the true total.
const RESULT_CAP = 50;

type Tab = 'interventions' | 'mine' | 'achat' | 'clients' | 'stock' | 'analytics' | 'knowledge' | 'roster' | 'finance';

// Bench Report finding: "claim a technician" was a dead end — inert hint
// text with no way to actually get to My Jobs, where claiming happens.
// A plain callback prop would mean threading it through InterventionsTab
// and InterventionRow, neither of which otherwise cares about page-level
// tabs, just to reach AddStepForm three levels down — this context is
// scoped to that one cross-cutting need instead. Provided once by
// RemanPage, consumed only where it's actually used.
const ChangeTabContext = createContext<((tab: Tab) => void) | null>(null);

// Only this REMAN technician id (Gabhy Kiba) can see/use the roster admin
// page — requested directly ("hidden for everyone else but me"). Kept in
// sync with reman.rs's ROSTER_ADMIN_TECH_ID; enforced again server-side
// there too, this is just what hides the tab in the UI.
const ROSTER_ADMIN_TECH_ID = '3569';

interface TechnicianOption {
  techId: string;
  techName: string;
}

// Mirrors InterventionQueue in src-tauri/src/reman.rs — see
// docs/reman-schema.md "Intervention status / workflow queues".
type InterventionQueueId =
  | 'open' | 'closed' | 'commercial' | 'subcontractor'
  | 'awaiting_parts' | 'awaiting_info' | 'awaiting_cleaning' | 'repair_in_progress';

// Mirrors CATEGORIZED_TYPE_CODES and InterventionQueue::type_codes() in
// reman.rs — used only to decide, the instant a step is added, whether
// the job's new TypeCode means it no longer belongs in the currently-
// selected queue, so it can be dropped from view immediately instead of
// sitting stale until the next INTERVENTIONS_REFRESH_MS poll. Reported
// directly: "60 seconds is a lot." Deliberately conservative — this only
// ever *removes* a row it's sure no longer matches; it never tries to
// guess that a row should newly *appear*, which would need the same
// staleness/date logic reman_search_interventions applies server-side.
const CATEGORIZED_TYPE_CODES = ['TES', 'AP', 'ARC', 'ATN', 'ARD', 'ST'];
const QUEUE_REQUIRED_TYPE_CODE: Partial<Record<InterventionQueueId, string>> = {
  awaiting_parts: 'AP',
  awaiting_info: 'ARC',
  awaiting_cleaning: 'ATN',
  repair_in_progress: 'ER',
};
function stepLeavesQueue(stepType: string, queue: InterventionQueueId): boolean {
  const required = QUEUE_REQUIRED_TYPE_CODE[queue];
  if (required) return stepType !== required;
  if (queue === 'open') return CATEGORIZED_TYPE_CODES.includes(stepType);
  return false;
}

function defaultQueueForRole(role: UserRole | null | undefined): InterventionQueueId {
  return role === 'commercial' ? 'commercial' : 'open';
}

/* ── Small shared bits ──────────────────────────────────────── */

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <span className="text-text-tertiary">{label}</span>
      <p className="text-text-secondary mt-0.5">{value}</p>
    </div>
  );
}

// One saved hydraulic report — collapsed to type + timestamp by default
// (report text is a raw sticky-log dump, often long), expanding inline on
// click rather than needing its own popup/drawer. Delete uses the same
// inline trash-icon -> confirm/cancel pattern as Jobs.tsx's job delete,
// rather than a popup dialog, to stay consistent with the rest of the app.
function HydraulicReportRow({ report, onDelete, i18nPrefix = 'hydraulic_report' }: { report: HydraulicReportSummary; onDelete: (id: number) => Promise<void>; i18nPrefix?: 'hydraulic_report' | 'ecu_report' }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleting(true);
    try {
      await onDelete(report.id);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-elevated overflow-hidden">
      <div className="w-full flex items-center justify-between gap-2 px-2.5 py-2">
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="flex-1 flex items-center justify-between gap-2 text-left min-w-0"
        >
          <span className="text-[11px] font-semibold text-accent shrink-0">
            {t(`reman.${i18nPrefix}_${report.reportType}`, { defaultValue: report.reportType })}
          </span>
          <span className="text-[10px] text-text-tertiary text-right truncate">
            {new Date(report.createdAt).toLocaleString()}
          </span>
        </button>
        {confirmDelete ? (
          <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="text-[10px] px-2 py-1 bg-danger/10 text-danger border border-danger/20 rounded-md hover:bg-danger/20 transition-all font-medium disabled:opacity-50"
            >
              {deleting ? '…' : t('common.delete')}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }}
              className="text-[10px] px-2 py-1 bg-card border border-border text-text-secondary rounded-md hover:text-text-primary transition-all"
            >
              {t('common.cancel')}
            </button>
          </div>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
            title={t(`reman.${i18nPrefix}_confirm_delete`)}
            className="shrink-0 p-1 rounded-md text-text-tertiary hover:text-danger hover:bg-danger/10 transition-colors"
          >
            <TrashIcon className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {expanded && (
        <pre className="text-[10px] text-text-secondary whitespace-pre-wrap font-mono max-h-52 overflow-y-auto leading-relaxed px-2.5 pb-2.5 border-t border-border pt-2">
          {report.reportText}
        </pre>
      )}
    </div>
  );
}

// Secondary detail (client contact, financials) that a technician rarely
// needs but commercial does — requested directly: "we don't really need
// the client information... or even the price information [inline], all
// of that can still be displayed for the commercial... pop ups on the
// sides linked with the central card... instead of making the central
// card just longer." A right-edge drawer, one click away from the job
// card, rather than another inline block. Same backdrop/motion convention
// as Valves.tsx's modal (fixed backdrop + spring-eased panel), adapted to
// slide in from the edge instead of scaling in centered.
function SidePanel({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <motion.div
        key="panel-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-40"
        onClick={onClose}
      />
      <motion.div
        key="panel"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 34 }}
        className="fixed inset-y-0 right-0 z-50 w-full max-w-xs bg-card border-l border-border shadow-2xl overflow-y-auto"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-card">
          <span className="text-sm font-semibold text-text-primary">{title}</span>
          <button
            type="button"
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary transition-colors"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-3 text-xs">{children}</div>
      </motion.div>
    </>
  );
}

function useDebounced(value: string, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

/* ── Interventions tab ──────────────────────────────────────── */

// Reuses the "Réparation/Vente/Echange/Avance/ND/RAS" checkboxes from
// LigCde as small badges — the first four share the same real-world
// concepts as the analytics outcome legend (reman.analytics.outcome_*),
// just sourced from these raw flags instead of classify_outcome, so those
// keys are reused directly rather than duplicated. underWarranty is shown
// here too (not just the Open-queue row header badge) since this panel is
// reachable from every queue, where that header badge never renders.
// Bench Report finding: every outcome rendered as the same blue pill,
// discarding the red/green semantics `RemanAnalytics.tsx` (COLOR_REPAIRED/
// COLOR_ND/COLOR_NFF/COLOR_EXCHANGE) already applies to these exact
// categories — a negative outcome (ND) looked identical to a positive one
// (Réparé) here. Mapped onto the same four design-token colors that
// component uses (this app has no "sold"/"subcontractor" token, so those
// two share `accent` with vente/avance rather than inventing new hex).
// `underWarranty` specifically also matches the row-header pill's own
// `success` styling — same fact, same color, wherever it shows up.
type OutcomeTone = 'success' | 'accent' | 'warning' | 'danger';
function OutcomeBadges({ outcome }: { outcome: JobOutcomeFlags }) {
  const { t } = useTranslation();
  const allItems: { show?: boolean; label: string; tone: OutcomeTone }[] = [
    { show: outcome.underWarranty, label: t('reman.under_warranty'), tone: 'success' },
    { show: outcome.reparation, label: t('reman.analytics.outcome_repaired'), tone: 'success' },
    { show: outcome.vente, label: t('reman.analytics.outcome_sold'), tone: 'accent' },
    { show: outcome.echangeStandard, label: t('reman.analytics.outcome_exchange'), tone: 'accent' },
    { show: outcome.avance, label: t('reman.outcome_avance'), tone: 'accent' },
    { show: outcome.nonRepairable, label: t('reman.analytics.outcome_nd'), tone: 'danger' },
    { show: outcome.noFaultFound, label: t('reman.analytics.outcome_nff'), tone: 'warning' },
  ];
  const items = allItems.filter(i => i.show);
  if (items.length === 0) return null;
  const toneClass: Record<OutcomeTone, string> = {
    success: 'bg-success/10 text-success border-success/20',
    accent: 'bg-accent/10 text-accent border-accent/20',
    warning: 'bg-warning/10 text-warning border-warning/20',
    danger: 'bg-danger/10 text-danger border-danger/20',
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map(i => (
        <span
          key={i.label}
          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md border ${toneClass[i.tone]}`}
        >
          {i.label}
        </span>
      ))}
    </div>
  );
}

// Requested directly: "before closing you have to check that you put
// the mounting back onto the abs" — surfaces each accessory attached to
// the job (e.g. "Support de fixation") with a one-tap confirm, and closing
// is now blocked server-side (reman.rs's close_job_as_repaired) until
// every one is checked. Only rendered when the job actually has
// accessories — most jobs don't.
// Deliberately does NOT trust `a.confirmed` (the stored `CtrlPresence`
// flag) as satisfying the check on its own — reported directly: "as long
// as [I] don't click 'i checked the support is present' it shouldn't let
// me close a job." A prior version gated on the stored flag alone, which
// silently let a close through whenever `CtrlPresence` already happened
// to be `True` (e.g. set at some earlier point unrelated to *this* close
// attempt) — exactly the case reported. Every accessory now needs an
// explicit click in `acknowledged` *this session*, regardless of what the
// database already says; `AddStepForm` resets `acknowledged` fresh every
// time "Close as Réparation" is (re)selected, so it's a real per-attempt
// gesture, not a one-time state that can go stale.
function AccessoiresPanel({
  ligcdeId, accessoires, acknowledged, onAcknowledge, onUpdated,
}: {
  ligcdeId: string;
  accessoires: AccessoireRecord[];
  acknowledged: Set<string>;
  onAcknowledge: (accessoireId: string) => void;
  onUpdated: (detail: InterventionDetail) => void;
}) {
  const { t } = useTranslation();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const confirm = async (accessoireId: string) => {
    setConfirmingId(accessoireId);
    setError('');
    try {
      // Still writes CtrlPresence = True server-side (harmless/idempotent
      // if it was already true) — the DB stays a correct record of "has
      // this ever been confirmed," even though closing now depends on the
      // fresh local click, not on reading that value back.
      onUpdated(await invoke<InterventionDetail>('reman_confirm_accessoire', { ligcdeId, accessoireId }));
      onAcknowledge(accessoireId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConfirmingId(null);
    }
  };

  return (
    <div className="rounded-lg p-2.5 space-y-1.5 border bg-elevated border-border">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-text-secondary">
        <ClipboardDocumentCheckIcon className="w-3.5 h-3.5" />
        {t('reman.accessoires_title')}
      </div>
      <div className="space-y-1">
        {accessoires.map(a => {
          const isAcknowledged = acknowledged.has(a.id);
          return (
            <div key={a.id} className="flex items-center justify-between gap-2 text-[11px]">
              <span className={isAcknowledged ? 'text-text-secondary' : 'text-warning font-medium'}>{a.label}</span>
              {isAcknowledged ? (
                <span className="flex items-center gap-1 text-success shrink-0">
                  <CheckCircleIcon className="w-3.5 h-3.5" />
                  {t('reman.accessoire_confirmed')}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => confirm(a.id)}
                  disabled={confirmingId === a.id}
                  className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-warning text-white hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0"
                >
                  {confirmingId === a.id && <Spinner className="w-3 h-3" />}
                  {confirmingId === a.id ? t('common.loading') : t('reman.accessoire_confirm_button')}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {error && <p className="text-danger text-[10px]">{error}</p>}
    </div>
  );
}

// A verified value always wins over the lexical hint — solid background
// when confirmed by a technician, translucent when it's still just a
// guess from intake symptom text, so the two are never visually confused.
function FaultTypeBadge({ hint, verified }: { hint?: AbsFaultHint; verified?: VerifiedFaultTypeRecord }) {
  const { t } = useTranslation();
  const value = verified?.faultType ?? hint;
  if (!value) return null;
  const isVerified = Boolean(verified);
  // Confirmed and guessed need different wording, not just different
  // colors — "Likely hydraulic" on a technician-confirmed badge reads as
  // still-uncertain, which defeats the point of verifying it.
  const label = t(
    isVerified
      ? value === 'hydraulic' ? 'reman.verified_fault_type_hydraulic'
        : value === 'ecu' ? 'reman.verified_fault_type_ecu'
        : 'reman.fault_type_both'
      : value === 'hydraulic' ? 'reman.abs_fault_hint_hydraulic'
        : 'reman.abs_fault_hint_ecu'
  );
  const tooltip = isVerified
    ? t('reman.verified_fault_type_tooltip', { name: verified?.verifiedByTechName || '?' })
    : t('reman.abs_fault_hint_tooltip');
  const colorClass = !isVerified
    ? value === 'hydraulic' ? 'bg-warning/10 text-warning border-warning/20' : 'bg-accent/10 text-accent border-accent/20'
    : value === 'hydraulic' ? 'bg-warning text-white border-warning'
      : value === 'ecu' ? 'bg-accent text-white border-accent'
      : 'bg-success text-white border-success';
  return (
    <span
      title={tooltip}
      className={`flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-md border ${colorClass}`}
    >
      {isVerified && <CheckCircleIcon className="w-3 h-3" />}
      {value !== 'ecu' && <BeakerIcon className="w-3 h-3" />}
      {value !== 'hydraulic' && <CpuChipIcon className="w-3 h-3" />}
      {label}
    </span>
  );
}

// One step in the job's full history — click to expand its own comment
// (nothing to expand if the step has none). Same collapsible idiom as
// InterventionRow itself, "one level deeper" to match how the user
// described wanting this: "click on each step and open it."
function StepHistoryRow({ step }: { step: InterventionStep }) {
  const [open, setOpen] = useState(false);
  const hasComment = Boolean(step.commentaire);
  return (
    <div className="bg-elevated rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => hasComment && setOpen(o => !o)}
        className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-left ${
          hasComment ? 'cursor-pointer hover:bg-card/60 transition-colors' : 'cursor-default'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-text-tertiary shrink-0">{[step.date, step.heure].filter(Boolean).join(' ')}</span>
          <span className="text-text-secondary truncate">{step.typeLibelle || step.typeCode}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {step.techName && <span className="text-text-tertiary">{step.techName}</span>}
          {hasComment && (
            open ? <ChevronUpIcon className="w-3 h-3 text-text-tertiary" /> : <ChevronDownIcon className="w-3 h-3 text-text-tertiary" />
          )}
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open && hasComment && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            {/* Bench Report finding: unlike HydraulicReportRow's own long
                text a few hundred lines away (max-h-52 overflow-y-auto),
                this had no height cap at all — a long pasted diagnostic
                note could stretch a history row indefinitely. */}
            <p className="px-2.5 pb-2 text-text-secondary whitespace-pre-line max-h-52 overflow-y-auto">{step.commentaire}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StepHistory({ steps }: { steps: InterventionStep[] }) {
  const { t } = useTranslation();
  if (steps.length === 0) return null;
  return (
    <div>
      <span className="text-text-tertiary font-medium">{t('reman.step_history_title')}</span>
      <div className="mt-1.5 space-y-1">
        {steps.map(step => <StepHistoryRow key={step.id} step={step} />)}
      </div>
    </div>
  );
}

// Unified step form (2026-08-04) — was three separate always-expanded
// forms stacked on top of each other (AddRepairStepForm/
// MarkAwaitingCleaningForm/CloseAsRepairedForm); requested directly to
// collapse them into one "Add a step" control with a dropdown, only
// expanding to the fields the selected step actually needs, so the job
// card doesn't grow a full form's worth of vertical space per write
// action. Still exactly the same three write paths underneath (ER, ATN,
// R) — this only changes how they're presented, not what they do. Other
// step types have their own undiscovered side effects (see
// docs/reman-schema.md) and stay out of scope until separately
// investigated. Uses the same claimed-technician identity as "My Jobs"
// (useSession's remanTechId/remanTechName) rather than any new identity
// plumbing — a write is attributed to whichever REMAN technician this
// BRAXON login has claimed.
const CAUSE_PANNE_OPTIONS: { code: number; label: string }[] = [
  { code: 1, label: 'Usure normale' },
  { code: 2, label: 'Casse' },
  { code: 3, label: 'Surtension' },
  { code: 4, label: 'Chute de liquide' },
  { code: 5, label: 'Oxydation anormale' },
];

// Tests & Actions Systématiques — only Type_Service 101 (ABS/Direction
// Assistée/Transmission) and 102 (Compteur/Multimedia) have real,
// live-verified NoInt_ParamTest ids so far (see
// src/lib/testsActionsSystematiques.ts). 103 is deliberately excluded:
// every open 103 job checked live in the native 4D client refused to even
// open the Tests & Actions screen ("Cet article n'est pas paramétré pour
// les tests"), so 4D itself doesn't require this checklist there either.
// 100 stays out because it's genuinely unverified, not because it's known
// to be exempt. Items with noIntParamTest === null (not yet verified,
// e.g. ABS code 039, Multimedia code 102) are filtered out of the
// selectable list entirely — showing a checkbox nobody can use is worse
// than not showing it.
const TESTS_ACTIONS_SECTIONS_BY_SERVICE: Record<string, { label: string; items: TestActionItem[] }[]> = {
  '101': [
    { label: 'Général', items: TEST_ACTION_SECTIONS.GENERAL },
    { label: TEST_ACTION_SECTION_LABELS.ABS, items: TEST_ACTION_SECTIONS.ABS },
    { label: TEST_ACTION_SECTION_LABELS.DIRECTION_ASSISTEE, items: TEST_ACTION_SECTIONS.DIRECTION_ASSISTEE },
    { label: TEST_ACTION_SECTION_LABELS.TRANSMISSION, items: TEST_ACTION_SECTIONS.TRANSMISSION },
  ],
  '102': [
    { label: 'Général', items: TEST_ACTION_SECTIONS.GENERAL },
    { label: TEST_ACTION_SECTION_LABELS.COMPTEUR, items: TEST_ACTION_SECTIONS.COMPTEUR },
    { label: TEST_ACTION_SECTION_LABELS.MULTIMEDIA, items: TEST_ACTION_SECTIONS.MULTIMEDIA },
  ],
};

// Mirrors JOB_ALREADY_CLOSED_ERROR in src-tauri/src/reman.rs exactly — the
// two are cross-referenced in each other's doc comment so a wording change
// on either side is easy to notice needs mirroring on the other. Matched
// on (not just displayed) because a write rejected for this specific
// reason should also trigger an immediate detail refetch — see
// AddStepForm's onStaleClose and its use in InterventionRow.
const JOB_ALREADY_CLOSED_ERROR =
  'This job was already closed by someone else since you last loaded it. Reopen the job to see the current state.';

type StepType = 'ER' | 'ATN' | 'NET' | 'VAL' | 'R' | 'TES';

// Personal, per-technician quick-pick lists — saved once, reused across
// jobs instead of retyped/reselected every time. Entirely BRAXON's own
// Postgres; see reman.rs's "Saved notes & Tests/Actions presets" section.
interface SavedComment {
  id: number;
  text: string;
}
interface SavedTestActionPreset {
  id: number;
  name: string;
  service: string;
  paramIds: number[];
}

function AddStepForm({
  ligcdeId, service, testsActionsSelected, accessoires, onAdded, onClosed, onAccessoiresUpdated, onStaleClose,
  onIntentToEdit, lockedByOther, lockedByName,
}: {
  ligcdeId: string;
  service?: string;
  testsActionsSelected?: number[];
  accessoires: AccessoireRecord[];
  // stepType is passed alongside the refreshed detail so a parent list
  // (InterventionsTab/MyJobsTab) can tell whether this job just left the
  // currently-viewed queue (e.g. marked "Attente de nettoyage" while
  // viewing "Réparation en cours") and drop it from view immediately,
  // instead of waiting for the next poll — same idea as onClosed already
  // does for a full close.
  onAdded: (detail: InterventionDetail, stepType: string) => void;
  onClosed: (detail: InterventionDetail) => void;
  // Confirming an accessory here doesn't add a step or close the job —
  // just refreshes the job's own accessoires state, same detail-merge
  // shape as onAdded but kept separate so it's clear at the call site
  // this isn't a step submission.
  onAccessoiresUpdated: (detail: InterventionDetail) => void;
  // Fired when a write is rejected specifically because the job was
  // already closed by someone else since this view last loaded it (see
  // JOB_ALREADY_CLOSED_ERROR / job_is_closed in reman.rs). Reported
  // directly as a real concern: "if a technician does something, and
  // you're still seeing the old stuff, and you try to let say close the
  // job or something, it's gonna be a mess." The backend now refuses that
  // write outright instead of silently overwriting the real outcome — this
  // callback is the other half: pulling the parent's stale `detail` back
  // in sync immediately, so the form disappears (soldee flips true) and
  // the card shows the real, current state instead of leaving the error
  // banner sitting over a card that still looks editable.
  onStaleClose: () => void;
  // Bench Report finding: the edit lock used to be acquired the moment a
  // job *card* expanded — comparing several jobs side by side (an
  // explicit use case the expandable-card pattern invites) put every one
  // of them in "view only" for coworkers, whether or not anyone actually
  // meant to write to them. It now acquires only once this form itself
  // is opened — `onIntentToEdit` reports that moment up to the parent,
  // which starts polling the lock and hands the result back down here as
  // `lockedByOther`/`lockedByName`, so the "+ Add a step" toggle stays
  // freely clickable (just looking at what options exist needs no lock)
  // and only the step picker/write fields swap for a view-only banner.
  onIntentToEdit: (editing: boolean) => void;
  lockedByOther?: boolean;
  lockedByName?: string;
}) {
  const { t } = useTranslation();
  const { currentUser } = useSession();
  const changeTab = useContext(ChangeTabContext);
  const [expanded, setExpanded] = useState(false);
  // null = the step-type menu is showing, nothing picked yet — requested
  // directly: clicking "+" should present a real choice, not a dropdown
  // that's already sitting on a default (ER).
  const [stepType, setStepType] = useState<StepType | null>(null);
  const [comment, setComment] = useState('');
  const [causePanne, setCausePanne] = useState<number>(CAUSE_PANNE_OPTIONS[0].code);
  const [niveauPanne, setNiveauPanne] = useState<number>(1);
  // TES-only: the optional NFF/ND choice, confirmed mutually exclusive
  // live (only one can genuinely apply to a job at a time) — 'none' is a
  // real, expected choice too (the workflow owner: "not mandatory").
  const [tesFaultChoice, setTesFaultChoice] = useState<'none' | 'nff' | 'nd'>('none');
  // Tests & Actions Systématiques — requested directly to be available on
  // every step (ER/ATN/close), not just close, so a tech can log what they
  // already checked as they go instead of all at once at the end. Still
  // *mandatory* (matching 4D's native client) only at close, and only for
  // the Type_Service codes with live-verified NoInt_ParamTest ids so far
  // (see TESTS_ACTIONS_SECTIONS_BY_SERVICE above).
  const [selectedParamIds, setSelectedParamIds] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const testsActionsSections = service ? TESTS_ACTIONS_SECTIONS_BY_SERVICE[service] : undefined;
  const alreadySelectedIds = new Set(testsActionsSelected ?? []);
  const showTestsActions = Boolean(stepType) && Boolean(testsActionsSections);
  const requiresTestsActions = stepType === 'R' && Boolean(testsActionsSections);
  // Requested directly, twice: first to surface the accessory check as
  // part of the close action instead of a passive panel elsewhere, then
  // corrected — "as long as [I] don't click 'i checked the support is
  // present' it shouldn't let me close a job." Gated on a fresh in-session
  // click (`accessoiresAcknowledged`), not on the stored `CtrlPresence`
  // flag — see AccessoiresPanel's doc comment.
  const [accessoiresAcknowledged, setAccessoiresAcknowledged] = useState<Set<string>>(new Set());
  const hasUnconfirmedAccessoires = stepType === 'R' && accessoires.some(a => !accessoiresAcknowledged.has(a.id));

  const [savedComments, setSavedComments] = useState<SavedComment[]>([]);
  const [savingComment, setSavingComment] = useState(false);
  const [savedPresets, setSavedPresets] = useState<SavedTestActionPreset[]>([]);
  // null = no inline "name this preset" input showing; '' or more once the
  // user clicks "save as preset" and starts typing a name.
  const [presetNameInput, setPresetNameInput] = useState<string | null>(null);
  const [savingPreset, setSavingPreset] = useState(false);
  // Bench Report finding: these chips deleted on a single click, unlike
  // everything else in this file that deletes (see HydraulicReportRow's
  // inline confirm/cancel swap, which this mirrors) — a tight, closely-
  // packed row of comments/presets built up over weeks is a real one-
  // click, unrecoverable loss otherwise. Which id (if any) is mid-confirm,
  // one per list since they're independent chip rows.
  const [pendingDeleteComment, setPendingDeleteComment] = useState<number | null>(null);
  const [pendingDeletePreset, setPendingDeletePreset] = useState<number | null>(null);

  // Expanding this (the menu, or a step's form) can push it below the
  // fold if the job card is near the bottom of the list — requested
  // directly after it wasn't scrolling into view on its own.
  useEffect(() => {
    if (expanded) {
      // 'center' (not 'nearest') deliberately — 'nearest' only scrolled the
      // bare minimum to bring the form's own edge into view, leaving it
      // flush against the bottom with the rest of the card cut off above
      // it. Centering leaves headroom on both sides.
      containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [expanded, stepType]);

  // Loaded lazily — only once a comment box is actually showing, not on
  // every row expand.
  useEffect(() => {
    const id = currentUser?.remanTechId;
    if (!stepType || !id) return;
    invoke<SavedComment[]>('reman_list_saved_comments', { techId: id })
      .then(setSavedComments)
      .catch(() => setSavedComments([]));
  }, [stepType, currentUser?.remanTechId]);

  useEffect(() => {
    const id = currentUser?.remanTechId;
    if (!showTestsActions || !service || !id) return;
    invoke<SavedTestActionPreset[]>('reman_list_saved_test_presets', { techId: id, service })
      .then(setSavedPresets)
      .catch(() => setSavedPresets([]));
  }, [showTestsActions, service, currentUser?.remanTechId]);

  // Seed the checklist with whatever's already been checked on an earlier
  // step, every time a step's form is (re)opened — not on every render,
  // otherwise a technician unchecking something mid-edit (before disabled
  // state applies) would keep getting overridden back.
  useEffect(() => {
    if (stepType) {
      setSelectedParamIds(new Set(testsActionsSelected ?? []));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately only re-seeds on open (stepType changing), not on every testsActionsSelected update
  }, [stepType]);

  // Always starts empty, every time "Close as Réparation" is (re)selected
  // — deliberately NOT seeded from `accessoires`' own `confirmed` state,
  // see AccessoiresPanel's doc comment for why. Cleared on every stepType
  // change (not just when entering 'R') so leaving and re-entering the
  // close flow demands a fresh click again too.
  useEffect(() => {
    setAccessoiresAcknowledged(new Set());
  }, [stepType]);

  const techId = currentUser?.remanTechId;
  const techName = currentUser?.remanTechName;

  if (!techId || !techName) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-[11px] text-text-tertiary italic">{t('reman.add_step_claim_hint')}</p>
        {changeTab && (
          <button
            type="button"
            onClick={() => changeTab('mine')}
            className="text-[11px] font-medium text-accent hover:underline shrink-0"
          >
            {t('reman.add_step_claim_cta')}
          </button>
        )}
      </div>
    );
  }

  const STEP_OPTIONS: { value: StepType; label: string }[] = [
    { value: 'ER', label: t('reman.add_step_title') },
    { value: 'ATN', label: t('reman.mark_atn_title') },
    { value: 'NET', label: t('reman.mark_net_title') },
    { value: 'VAL', label: t('reman.mark_val_title') },
    { value: 'TES', label: t('reman.transfer_commercial_title') },
    { value: 'R', label: t('reman.close_repaired_title') },
  ];

  // Deliberately not PlusIcon for ER — the outer "Add a step" toggle
  // already uses PlusIcon for the generic "add" affordance; reusing it for
  // one specific step type inside the menu read as a visual duplicate.
  // Bench Report finding: the step-type picker menu rendered every icon
  // in the same neutral gray, with only shape (and the text label right
  // next to it) to tell six options apart — `iconColorClass` below is
  // shown only in that menu (see STEP_OPTIONS.map), tying each icon to
  // the same tone its submit button eventually uses. This can't give all
  // six a fully unique color without inventing tokens outside the app's
  // existing accent/success/warning/danger set (a bigger, separate call
  // than a Polish-tier fix should make) — ATN/NET and ER/VAL/TES still
  // share a tone within their own pair/trio, same as their submit
  // buttons already do; every option's text label is still the actual
  // disambiguator, same as before.
  const BUTTON_BY_TYPE: Record<StepType, { label: string; icon: React.ReactNode; className: string; iconColorClass: string }> = {
    ER: { label: t('reman.add_step_button'), icon: <WrenchScrewdriverIcon className="w-3 h-3" />, className: 'bg-accent', iconColorClass: 'text-accent' },
    ATN: { label: t('reman.mark_atn_button'), icon: <ClockIcon className="w-3 h-3" />, className: 'bg-warning', iconColorClass: 'text-warning' },
    NET: { label: t('reman.mark_net_button'), icon: <SparklesIcon className="w-3 h-3" />, className: 'bg-warning', iconColorClass: 'text-warning' },
    VAL: { label: t('reman.mark_val_button'), icon: <ClipboardDocumentCheckIcon className="w-3 h-3" />, className: 'bg-accent', iconColorClass: 'text-accent' },
    TES: { label: t('reman.transfer_commercial_button'), icon: <PaperAirplaneIcon className="w-3 h-3" />, className: 'bg-accent', iconColorClass: 'text-accent' },
    R: { label: t('reman.close_repaired_button'), icon: <CheckCircleIcon className="w-3 h-3" />, className: 'bg-success', iconColorClass: 'text-success' },
  };

  // Bench Report finding: a failed (or abandoned) attempt's error banner
  // and draft text used to survive both `close()` and picking a
  // different step type — reopening the form (or switching from, say, a
  // failed ER to ATN) could show a stale error and stale comment as if
  // the *new*, not-yet-submitted attempt had already failed. Every path
  // that starts a fresh attempt now clears the whole draft, not just the
  // step-type picker.
  const resetDraft = () => {
    setError('');
    setComment('');
    setCausePanne(CAUSE_PANNE_OPTIONS[0].code);
    setNiveauPanne(1);
    setTesFaultChoice('none');
    setSelectedParamIds(new Set());
    setPresetNameInput(null);
  };

  const close = () => {
    setExpanded(false);
    setStepType(null);
    resetDraft();
    onIntentToEdit(false);
  };

  const toggleParamId = (id: number) => {
    // Already recorded on an earlier step — nothing to toggle, BRAXON has
    // no delete-selection feature. The checkbox is also rendered disabled
    // for these; this is just a defensive second guard.
    if (alreadySelectedIds.has(id)) return;
    setSelectedParamIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const saveCurrentComment = async () => {
    const text = comment.trim();
    if (!text || savingComment) return;
    setSavingComment(true);
    try {
      const saved = await invoke<SavedComment>('reman_add_saved_comment', { techId, text });
      setSavedComments(prev => [saved, ...prev]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingComment(false);
    }
  };

  const deleteSavedComment = async (id: number) => {
    setPendingDeleteComment(null);
    setSavedComments(prev => prev.filter(c => c.id !== id));
    try {
      await invoke('reman_delete_saved_comment', { techId, id });
    } catch {
      // Best-effort — a stale entry reappearing on next load is harmless.
    }
  };

  const applyPreset = (preset: SavedTestActionPreset) => {
    // Merge, don't replace — wiping selectedParamIds would drop items
    // already recorded on an earlier step from the checklist's visible
    // state (they'd still be in Zebra_LigCdeTest either way, but showing
    // them unchecked would be confusing and they can't be re-toggled).
    setSelectedParamIds(new Set([...alreadySelectedIds, ...preset.paramIds]));
  };

  const saveCurrentPreset = async () => {
    const name = (presetNameInput ?? '').trim();
    if (!name || !service || selectedParamIds.size === 0 || savingPreset) return;
    setSavingPreset(true);
    try {
      const saved = await invoke<SavedTestActionPreset>('reman_add_saved_test_preset', {
        techId, service, name, paramIds: Array.from(selectedParamIds),
      });
      setSavedPresets(prev => [saved, ...prev]);
      setPresetNameInput(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingPreset(false);
    }
  };

  const deleteSavedPreset = async (id: number) => {
    setPendingDeletePreset(null);
    setSavedPresets(prev => prev.filter(p => p.id !== id));
    try {
      await invoke('reman_delete_saved_test_preset', { techId, id });
    } catch {
      // Best-effort — same as deleteSavedComment.
    }
  };

  const submit = async () => {
    if (!stepType) return;
    if (requiresTestsActions && selectedParamIds.size === 0) return;
    if (hasUnconfirmedAccessoires) return;
    setSubmitting(true);
    setError('');
    try {
      // Only what's newly checked *this* step — items seeded from an
      // earlier step are already in Zebra_LigCdeTest, re-sending them
      // would just be redundant (the backend also de-dupes, but no reason
      // to send what we already know isn't new).
      const testsActions = (testsActionsSections ?? []).flatMap(s => s.items)
        .filter(item => item.noIntParamTest !== null
          && selectedParamIds.has(item.noIntParamTest)
          && !alreadySelectedIds.has(item.noIntParamTest))
        .map(item => ({ noIntParamTest: item.noIntParamTest, label: `${item.code} - ${item.label}` }));

      if (stepType === 'ER') {
        onAdded(await invoke<InterventionDetail>('reman_add_repair_step', { ligcdeId, techId, comment, testsActions }), 'ER');
      } else if (stepType === 'ATN') {
        onAdded(await invoke<InterventionDetail>('reman_mark_awaiting_cleaning', { ligcdeId, techId, comment, testsActions }), 'ATN');
      } else if (stepType === 'NET') {
        onAdded(await invoke<InterventionDetail>('reman_mark_piece_cleaned', { ligcdeId, techId, comment, testsActions }), 'NET');
      } else if (stepType === 'VAL') {
        onAdded(await invoke<InterventionDetail>('reman_add_validation_step', { ligcdeId, techId, comment, testsActions }), 'VAL');
      } else if (stepType === 'TES') {
        // Leaves the current queue (Type_Service moves to 305/Commercial)
        // even though the job itself stays open — onClosed is what drops a
        // row out of whatever list it's currently rendered in, same as it
        // does for an actual close.
        onClosed(await invoke<InterventionDetail>('reman_transfer_to_commercial', {
          ligcdeId, techId, causePanne, niveauPanne,
          noFaultFound: tesFaultChoice === 'nff', nonRepairable: tesFaultChoice === 'nd',
          comment, testsActions,
        }));
      } else {
        onClosed(await invoke<InterventionDetail>('reman_close_job_as_repaired', {
          ligcdeId, techId, techName, causePanne, niveauPanne, comment, testsActions,
        }));
      }
      setComment('');
      setCausePanne(CAUSE_PANNE_OPTIONS[0].code);
      setNiveauPanne(1);
      setTesFaultChoice('none');
      close();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      if (message === JOB_ALREADY_CLOSED_ERROR) {
        onStaleClose();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const button = stepType ? BUTTON_BY_TYPE[stepType] : null;

  return (
    <div ref={containerRef}>
      {!expanded && (
        <button
          type="button"
          onClick={() => { setExpanded(true); onIntentToEdit(true); }}
          className="w-full flex items-center justify-between gap-2 text-xs font-medium px-2.5 py-2 rounded-lg bg-elevated border border-border text-text-secondary hover:text-text-primary hover:border-accent/30 transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <PlusIcon className="w-3.5 h-3.5" />
            {t('reman.add_step_menu_title')}
          </span>
          <ChevronDownIcon className="w-3.5 h-3.5" />
        </button>
      )}

      {expanded && lockedByOther && (
        <div className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-2 rounded-lg bg-warning/10 border border-warning/20 text-warning">
          <LockClosedIcon className="w-3.5 h-3.5 shrink-0" />
          {t('reman.job_locked_view_only', { name: lockedByName || t('reman.job_locked_unknown_tech') })}
        </div>
      )}

      {/* Expanded, nothing picked yet — a real choice menu, not a dropdown
          pre-set to a default. */}
      {expanded && !lockedByOther && !stepType && (
        <div className="bg-elevated/50 border border-border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-2.5 py-2 border-b border-border">
            <span className="text-text-tertiary font-medium text-xs">{t('reman.add_step_menu_title')}</span>
            <button
              type="button"
              onClick={close}
              className="text-text-tertiary hover:text-text-primary transition-colors shrink-0"
            >
              <ChevronUpIcon className="w-3.5 h-3.5" />
            </button>
          </div>
          {STEP_OPTIONS.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => setStepType(o.value)}
              className="w-full flex items-center gap-2 text-left text-xs px-2.5 py-2 text-text-secondary hover:bg-card hover:text-text-primary transition-colors"
            >
              <span className={BUTTON_BY_TYPE[o.value].iconColorClass}>{BUTTON_BY_TYPE[o.value].icon}</span>
              {o.label}
            </button>
          ))}
        </div>
      )}

      {expanded && !lockedByOther && stepType && button && (
        <div className="space-y-1.5 bg-elevated/50 border border-border rounded-lg p-2.5">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => { setStepType(null); resetDraft(); }}
              className="flex items-center gap-1 text-xs font-medium text-text-primary hover:text-accent transition-colors"
            >
              <ChevronDownIcon className="w-3.5 h-3.5 rotate-90" />
              {STEP_OPTIONS.find(o => o.value === stepType)?.label}
            </button>
            <button
              type="button"
              onClick={close}
              className="text-text-tertiary hover:text-text-primary transition-colors shrink-0"
            >
              <XMarkIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          {(stepType === 'R' || stepType === 'TES') && (
            <div className="grid grid-cols-2 gap-2">
              <select
                value={causePanne}
                onChange={e => setCausePanne(Number(e.target.value))}
                className="text-xs bg-elevated border border-border rounded-lg px-2 py-1.5 text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
              >
                {CAUSE_PANNE_OPTIONS.map(o => (
                  <option key={o.code} value={o.code}>{o.label}</option>
                ))}
              </select>
              <select
                value={niveauPanne}
                onChange={e => setNiveauPanne(Number(e.target.value))}
                className="text-xs bg-elevated border border-border rounded-lg px-2 py-1.5 text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
              >
                {[1, 2, 3].map(n => (
                  <option key={n} value={n}>{t('reman.field_niveau_panne')} {n}</option>
                ))}
              </select>
            </div>
          )}

          {stepType === 'R' && accessoires.length > 0 && (
            <AccessoiresPanel
              ligcdeId={ligcdeId}
              accessoires={accessoires}
              acknowledged={accessoiresAcknowledged}
              onAcknowledge={id => setAccessoiresAcknowledged(prev => new Set(prev).add(id))}
              onUpdated={onAccessoiresUpdated}
            />
          )}

          {stepType === 'TES' && (
            <div className="flex items-center gap-3 text-[11px] text-text-secondary">
              {(['none', 'nff', 'nd'] as const).map(choice => (
                <label key={choice} className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="radio"
                    name="tesFaultChoice"
                    checked={tesFaultChoice === choice}
                    onChange={() => setTesFaultChoice(choice)}
                    className="accent-accent"
                  />
                  {t(`reman.transfer_commercial_choice_${choice}`)}
                </label>
              ))}
            </div>
          )}

          {showTestsActions && (
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-elevated border-b border-border">
                <span className="text-[11px] font-medium text-text-secondary">{t('reman.tests_actions_title')}</span>
                <span className="text-[10px] text-text-tertiary">{selectedParamIds.size} {t('reman.tests_actions_selected')}</span>
              </div>

              {(savedPresets.length > 0 || presetNameInput !== null) && (
                <div className="flex flex-wrap items-center gap-1 px-2.5 py-1.5 border-b border-border">
                  {savedPresets.map(preset => (
                    <span
                      key={preset.id}
                      className="flex items-center gap-1 text-[10px] font-medium pl-2 pr-1 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20"
                    >
                      <button type="button" onClick={() => applyPreset(preset)} className="hover:underline">
                        {preset.name}
                      </button>
                      {pendingDeletePreset === preset.id ? (
                        <span className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => deleteSavedPreset(preset.id)}
                            className="text-danger font-semibold hover:underline"
                          >
                            {t('common.delete')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDeletePreset(null)}
                            className="text-accent/60 hover:text-text-primary transition-colors"
                          >
                            {t('common.cancel')}
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setPendingDeletePreset(preset.id)}
                          className="text-accent/60 hover:text-danger transition-colors"
                          title={t('reman.saved_delete')}
                        >
                          <XMarkIcon className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </span>
                  ))}
                  {presetNameInput !== null && (
                    <span className="flex items-center gap-1">
                      <input
                        autoFocus
                        value={presetNameInput}
                        onChange={e => setPresetNameInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveCurrentPreset(); if (e.key === 'Escape') setPresetNameInput(null); }}
                        placeholder={t('reman.saved_preset_name_placeholder')}
                        className="text-[10px] bg-elevated border border-border rounded-full px-2 py-0.5 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent w-28"
                      />
                      <button
                        type="button"
                        onClick={saveCurrentPreset}
                        disabled={savingPreset || !presetNameInput.trim()}
                        className="text-[10px] font-medium text-accent hover:underline disabled:opacity-50"
                      >
                        {t('common.save')}
                      </button>
                    </span>
                  )}
                </div>
              )}
              <div className="flex items-center justify-end px-2.5 pt-1.5">
                <button
                  type="button"
                  onClick={() => setPresetNameInput(presetNameInput === null ? '' : null)}
                  disabled={presetNameInput === null && selectedParamIds.size === 0}
                  className="flex items-center gap-1 text-[10px] font-medium text-text-tertiary hover:text-accent transition-colors disabled:opacity-40"
                >
                  <BookmarkIcon className="w-3 h-3" />
                  {t('reman.saved_preset_save_current')}
                </button>
              </div>

              <div className="max-h-48 overflow-y-auto px-2.5 py-1.5 space-y-2">
                {(testsActionsSections ?? []).map(section => {
                  const items = section.items.filter(item => item.noIntParamTest !== null);
                  if (items.length === 0) return null;
                  return (
                    <div key={section.label}>
                      <p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wide mb-1">{section.label}</p>
                      <div className="space-y-0.5">
                        {items.map(item => {
                          const paramId = item.noIntParamTest as number;
                          const alreadyDone = alreadySelectedIds.has(paramId);
                          return (
                            <label
                              key={paramId}
                              className={`flex items-center gap-1.5 text-[11px] ${alreadyDone ? 'text-text-tertiary cursor-default' : 'text-text-secondary hover:text-text-primary cursor-pointer'}`}
                              title={alreadyDone ? t('reman.tests_actions_already_done') : undefined}
                            >
                              <input
                                type="checkbox"
                                checked={selectedParamIds.has(paramId)}
                                disabled={alreadyDone}
                                onChange={() => toggleParamId(paramId)}
                                className="accent-accent disabled:opacity-60"
                              />
                              {item.code} — {item.label}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              {requiresTestsActions && selectedParamIds.size === 0 && (
                <p className="text-[10px] text-warning px-2.5 py-1 border-t border-border">{t('reman.tests_actions_required')}</p>
              )}
            </div>
          )}

          {savedComments.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              {savedComments.map(sc => (
                <span
                  key={sc.id}
                  className="flex items-center gap-1 text-[10px] pl-2 pr-1 py-0.5 rounded-full bg-elevated border border-border text-text-secondary max-w-full"
                >
                  <button type="button" onClick={() => setComment(sc.text)} className="truncate hover:text-text-primary" title={sc.text}>
                    {sc.text}
                  </button>
                  {pendingDeleteComment === sc.id ? (
                    <span className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => deleteSavedComment(sc.id)}
                        className="text-danger font-semibold hover:underline"
                      >
                        {t('common.delete')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDeleteComment(null)}
                        className="text-text-tertiary hover:text-text-primary transition-colors"
                      >
                        {t('common.cancel')}
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPendingDeleteComment(sc.id)}
                      className="text-text-tertiary hover:text-danger transition-colors shrink-0"
                      title={t('reman.saved_delete')}
                    >
                      <XMarkIcon className="w-2.5 h-2.5" />
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
          <div className="relative">
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder={t('reman.add_step_comment_placeholder')}
              rows={2}
              className="w-full text-xs bg-elevated border border-border rounded-lg px-2.5 py-1.5 pr-7 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent resize-none"
            />
            <button
              type="button"
              onClick={saveCurrentComment}
              disabled={!comment.trim() || savingComment}
              title={t('reman.saved_comment_save_current')}
              className="absolute top-1.5 right-1.5 text-text-tertiary hover:text-accent transition-colors disabled:opacity-30"
            >
              <BookmarkIcon className="w-3.5 h-3.5" />
            </button>
          </div>
          {error && (
            <p className="text-danger bg-danger/10 border border-danger/20 rounded-lg px-2.5 py-1.5 text-[11px]">{error}</p>
          )}
          {/* Bench Report finding: requiresTestsActions gets a visible
              reason the button is disabled (above); this one didn't — a
              tech had to notice the amber accessory rows unaided. */}
          {hasUnconfirmedAccessoires && (
            <p className="text-[10px] text-warning px-1">{t('reman.close_accessoires_required')}</p>
          )}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-text-tertiary truncate">{t('reman.add_step_as', { name: techName })}</span>
            <button
              type="button"
              onClick={submit}
              disabled={submitting || (requiresTestsActions && selectedParamIds.size === 0) || hasUnconfirmedAccessoires}
              className={`flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-lg text-white hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0 ${button.className}`}
            >
              {submitting ? <Spinner className="w-3 h-3" /> : button.icon}
              {submitting ? t('common.loading') : button.label}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Bridges a job to the Repair Knowledge Base — requested directly
// alongside the feature itself ("can you think of a way to do it and
// link it to reman job listings as well"). Fetches as soon as it mounts
// (only ever rendered once a job's detail is already loaded/expanded, so
// this doesn't add a query to jobs a tech never opens) rather than
// waiting for a click — requested directly ("it should auto detect fault
// and show us the potential fix for that"): `symptomText` (client/
// internal comments plus every step's comment, built by the caller from
// fields the detail view already has) is sent along, and any suggested
// entry whose fault code turns up inside that text comes back flagged
// `faultCodeDetected` and the panel auto-opens so the match is visible
// without a click. Same-ECU-family entries with no code match still show
// up as a weaker "others hit this too" suggestion, but don't force the
// panel open on their own — plenty of jobs share a family without
// sharing a fault. "Log this fix" opens the same EntryForm the Knowledge
// tab uses, pre-filled from this job's ECU/vehicle fields and pointed at
// this job id, so a codified record and the job that proved it out are
// linked from the moment the entry is created.
function KnowledgeLinkPanel({
  ligcdeId, family, ecuRef, ecuBrand, vehicleModel, symptomText,
}: {
  ligcdeId: string;
  family?: string;
  ecuRef?: string;
  ecuBrand?: string;
  vehicleModel?: string;
  symptomText?: string;
}) {
  const { t } = useTranslation();
  const { currentUser } = useSession();
  const [open, setOpen] = useState(false);
  const [userToggled, setUserToggled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [entries, setEntries] = useState<KnowledgeEntryRecord[] | null>(null);
  const [suggestions, setSuggestions] = useState<KnowledgeTagSuggestions>({ ecuFamilies: [], ecuBrands: [], causeTags: [], fixTags: [] });
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [linkingId, setLinkingId] = useState<number | null>(null);

  const canWrite = Boolean(currentUser?.remanTechId && currentUser?.remanTechName);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    Promise.all([
      invoke<KnowledgeEntryRecord[]>('reman_suggest_knowledge_entries', { ligcdeId, family: family || null, symptomText: symptomText || null }),
      invoke<KnowledgeTagSuggestions>('reman_list_knowledge_tag_suggestions'),
    ])
      .then(([rows, tags]) => {
        if (cancelled) return;
        setEntries(rows);
        setSuggestions(tags);
        if (!userToggled && rows.some(r => r.faultCodeDetected)) setOpen(true);
      })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ligcdeId]);

  const toggle = () => {
    setUserToggled(true);
    setOpen(v => !v);
  };

  const linkExisting = async (id: number) => {
    setLinkingId(id);
    try {
      const updated = await invoke<KnowledgeEntryRecord>('reman_link_job_to_knowledge_entry', { id, ligcdeId });
      setEntries(prev => (prev || []).map(e => (e.id === updated.id ? updated : e)));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLinkingId(null);
    }
  };

  const createEntry = async (form: EntryFormState) => {
    if (!currentUser?.remanTechId || !currentUser?.remanTechName) return;
    setCreating(true);
    setCreateError('');
    try {
      const created = await invoke<KnowledgeEntryRecord>('reman_create_knowledge_entry', {
        ecuRef: form.ecuRef, ecuBrand: form.ecuBrand, ecuFamily: form.ecuFamily,
        vehicleMake: form.vehicleMake, vehicleModel: form.vehicleModel, vehicleYear: form.vehicleYear,
        faultCodes: form.faultCodes, causeTags: form.causeTags, fixTags: form.fixTags, notes: form.notes,
        linkedJobIds: [ligcdeId],
        techId: currentUser.remanTechId, techName: currentUser.remanTechName,
      });
      setEntries(prev => [{ ...created, linkedToThisJob: true }, ...(prev || [])]);
      setShowForm(false);
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  const hasDetectedMatch = Boolean(entries?.some(e => e.faultCodeDetected));

  return (
    <div className={['rounded-lg border overflow-hidden', hasDetectedMatch ? 'border-accent/40 bg-accent/5' : 'border-border bg-elevated/50'].join(' ')}>
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between gap-2 px-2.5 py-2 text-left hover:bg-elevated transition-colors"
      >
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-text-primary">
          <BookmarkIcon className="w-3.5 h-3.5 text-accent" />
          {t('reman.knowledge_panel_title')}
          {hasDetectedMatch && (
            <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-accent text-white">
              <SparklesIcon className="w-3 h-3" />
              {t('reman.knowledge_fault_match_found')}
            </span>
          )}
        </span>
        {open ? <ChevronUpIcon className="w-3.5 h-3.5 text-text-tertiary" /> : <ChevronDownIcon className="w-3.5 h-3.5 text-text-tertiary" />}
      </button>
      {open && (
        <div className="px-2.5 pb-2.5 space-y-2 border-t border-border pt-2">
          {loading && <LoadingRow label={t('reman.searching')} className="flex items-center gap-1.5 text-[11px] text-text-tertiary" spinnerClassName="w-3 h-3" />}
          {error && <p className="text-[11px] text-danger">{error}</p>}
          {entries && entries.length === 0 && !showForm && (
            <p className="text-[11px] text-text-tertiary italic">{t('reman.knowledge_panel_empty')}</p>
          )}
          {entries && entries.length > 0 && (
            <div className="space-y-1.5">
              {entries.map(e => (
                <div
                  key={e.id}
                  className={[
                    'flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 border',
                    e.faultCodeDetected ? 'bg-accent/10 border-accent/30' : 'bg-card border-border',
                  ].join(' ')}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {e.faultCodeDetected && (
                        <span className="flex items-center gap-0.5 text-[10px] font-semibold text-accent">
                          <SparklesIcon className="w-3 h-3" />
                          {t('reman.knowledge_potential_fix')}
                        </span>
                      )}
                      <span className="text-[11px] font-semibold text-text-primary truncate">
                        {e.ecuFamily || e.ecuRef || t('reman.knowledge_untitled')}
                      </span>
                      {e.faultCodes.map(c => (
                        <span key={c} className="text-[10px] font-mono font-semibold px-1 py-0.5 rounded bg-danger/10 text-danger border border-danger/20">{c}</span>
                      ))}
                    </div>
                    {e.fixTags.length > 0 && <p className="text-[10px] text-text-tertiary truncate">{e.fixTags.join(', ')}</p>}
                  </div>
                  {e.linkedToThisJob ? (
                    <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-success/10 text-success border border-success/20">
                      {t('reman.knowledge_linked_to_this_job')}
                    </span>
                  ) : canWrite && (
                    <button
                      type="button"
                      disabled={linkingId === e.id}
                      onClick={() => linkExisting(e.id)}
                      className="shrink-0 text-[10px] font-medium px-2 py-1 rounded-md bg-elevated border border-border text-text-secondary hover:text-text-primary transition-all disabled:opacity-50"
                    >
                      {linkingId === e.id ? '…' : t('reman.knowledge_link_job')}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {canWrite ? (
            showForm ? (
              <EntryForm
                initial={{ ...EMPTY_FORM, ecuRef: ecuRef || '', ecuBrand: ecuBrand || '', ecuFamily: family || '', vehicleModel: vehicleModel || '' }}
                suggestions={suggestions}
                linkedJobHint={t('reman.knowledge_will_link_to_job', { id: ligcdeId })}
                onCancel={() => { setShowForm(false); setCreateError(''); }}
                onSave={createEntry}
                saving={creating}
                error={createError}
              />
            ) : (
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-md bg-accent text-white hover:bg-accent/90 transition-all"
              >
                <PlusIcon className="w-3.5 h-3.5" />
                {t('reman.knowledge_log_this_fix')}
              </button>
            )
          ) : (
            <p className="text-[11px] text-text-tertiary italic">{t('reman.set_fault_type_claim_hint')}</p>
          )}
        </div>
      )}
    </div>
  );
}

function InterventionRow({
  item, onClosed, onStepAdded, showLastVisitInsteadOfDeadline, autoExpand,
}: {
  item: InterventionSummary;
  // Open expanded and fetch detail on mount — used for a job reached by
  // scanning its QR code (see InterventionsTab's focus block).
  autoExpand?: boolean;
  onClosed?: (id: string) => void;
  // Fired whenever a step is added, with the step's TypeCode — lets a
  // parent list drop this job from the current view immediately if the
  // new status means it no longer belongs in the currently-selected
  // queue (e.g. marked "Attente de nettoyage" while viewing "Réparation
  // en cours"), instead of it sitting stale until the next poll.
  // Reported directly: "60 seconds is a lot."
  onStepAdded?: (id: string, stepType: string) => void;
  // A delivery deadline is meaningless once a job is closed — same
  // reasoning already applied to the Closed queue's sort order. Reported
  // directly: "don't show me the latest shipping date on the card show
  // me that last visit time."
  showLastVisitInsteadOfDeadline?: boolean;
}) {
  const { t } = useTranslation();
  const { currentUser } = useSession();
  const { activeHydraulicJob, setActiveHydraulicJob, activeSignalJob, setActiveSignalJob, navigateTo } = useTestSession();
  const [expanded, setExpanded] = useState(!!autoExpand);
  const [detail, setDetail] = useState<InterventionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [qrOpen, setQrOpen] = useState(false);
  const [settingFaultType, setSettingFaultType] = useState(false);
  // Fetched alongside `detail` so the inline Reports section only shows up
  // once we actually know there's something saved.
  const [hydraulicReports, setHydraulicReports] = useState<HydraulicReportSummary[] | null>(null);
  // ECU / Signal HIL test reports — same shape and lifecycle, saved from
  // the Signal HIL page's Test Report card.
  const [ecuReports, setEcuReports] = useState<HydraulicReportSummary[] | null>(null);
  // Which side panel (if any) is open — client contact details or the
  // financial breakdown, both pulled out of the main card (see SidePanel).
  // Hydraulic reports are shown inline instead (see below), not as a panel.
  const [panel, setPanel] = useState<'client' | 'amounts' | null>(null);
  // Whether someone else currently has this job's edit form open — see the
  // lock lifecycle effect below. null until the first acquire attempt
  // resolves (or if it never runs, e.g. no claimed tech identity), same
  // "unknown vs. known-false" distinction `detail` already uses.
  const [lockStatus, setLockStatus] = useState<JobLockStatus | null>(null);
  // Bench Report finding: this used to be driven by the card's own
  // `expanded` — comparing several jobs side by side put all of them in
  // "view only" for coworkers. Now set only by AddStepForm's own
  // `onIntentToEdit`, i.e. once someone actually opens the write form.
  const [wantsToEdit, setWantsToEdit] = useState(false);

  const isOnBench = activeHydraulicJob?.ligcdeId === item.id;
  const isOnSignalBench = activeSignalJob?.ligcdeId === item.id;

  // Pulled out of `toggle` so it can also be called from AddStepForm's
  // stale-write recovery path below (see onStaleClose) — same fetch either
  // way, just two different triggers for it.
  const refreshDetail = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [d, reports, ecu] = await Promise.all([
        invoke<InterventionDetail>('reman_get_intervention', { id: item.id }),
        invoke<HydraulicReportSummary[]>('reman_list_hydraulic_reports', { ligcdeId: item.id }).catch(() => []),
        invoke<HydraulicReportSummary[]>('reman_list_ecu_reports', { ligcdeId: item.id }).catch(() => []),
      ]);
      setDetail(d);
      setHydraulicReports(reports);
      setEcuReports(ecu);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [item.id]);

  // Scanned-in job: this row mounts already `expanded`, so fetch its detail
  // once on mount the same way `toggle` would have. Runs only for the
  // pinned focus row (autoExpand), never the normal list rows.
  useEffect(() => {
    if (autoExpand && !detail && !loading) refreshDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot on mount for the focus row
  }, [autoExpand]);

  const toggle = async () => {
    const next = !expanded;
    // Bench Report finding: the whole card header is a single click
    // target — collapsing it unmounts AddStepForm and, with it, any
    // unsaved draft, with zero confirmation. `wantsToEdit` (see the lock
    // effect below) is already true exactly when the write form is open,
    // so it's a free signal for "there's a draft to lose" — reused here
    // rather than adding a second piece of state to track the same thing.
    if (!next && wantsToEdit && !window.confirm(t('reman.discard_draft_confirm'))) {
      return;
    }
    setExpanded(next);
    if (!next) {
      setPanel(null);
      // A fresh mount of AddStepForm next time this row expands should
      // start with no edit intent recorded, not whatever was left over
      // from before — its own internal `expanded` already resets itself
      // by unmounting; this is the parent-side half of that reset.
      setWantsToEdit(false);
      return;
    }
    // Always refetch on open, even if this row was expanded once before
    // and collapsed — `detail` otherwise stays sitting in React state from
    // the last time it was opened, so reopening the same row silently kept
    // showing however-old data instead of the job's real current status.
    // Reported directly: "you should trigger the job update when I try to
    // open it, it should show the real status then." The lock (see the
    // effect below) is acquired separately, reactively, off `wantsToEdit`.
    if (!loading) {
      await refreshDetail();
    }
  };

  // Lock lifecycle: acquire (or heartbeat-renew) while AddStepForm itself
  // is open, release the moment it closes, the card collapses, or this
  // row unmounts (e.g. a filter/queue change while expanded). Reported
  // directly: "show an error message if an other user tries to open it at
  // the same time, it's gonna be view only." Renewed well under the
  // server's JOB_LOCK_TTL_SECONDS (45s) so a single slow tick never lets
  // an actively-open job's lock lapse.
  useEffect(() => {
    if (!wantsToEdit || !currentUser?.remanTechId || !currentUser?.remanTechName) return;
    const techId = currentUser.remanTechId;
    const techName = currentUser.remanTechName;
    let cancelled = false;
    const acquire = () => {
      invoke<JobLockStatus>('reman_acquire_job_lock', { ligcdeId: item.id, techId, techName })
        .then(status => { if (!cancelled) setLockStatus(status); })
        .catch(() => {
          // Best-effort — a failed lock check shouldn't block viewing the
          // job, it just means no conflict warning this time around.
        });
    };
    acquire();
    const interval = setInterval(acquire, 20 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      setLockStatus(null);
      invoke('reman_release_job_lock', { ligcdeId: item.id, techId }).catch(() => {});
    };
  }, [wantsToEdit, item.id, currentUser?.remanTechId, currentUser?.remanTechName]);

  const deleteHydraulicReport = async (reportId: number) => {
    try {
      await invoke('reman_delete_hydraulic_report', { id: reportId });
      setHydraulicReports(prev => prev?.filter(r => r.id !== reportId) ?? null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const deleteEcuReport = async (reportId: number) => {
    try {
      await invoke('reman_delete_ecu_report', { id: reportId });
      setEcuReports(prev => prev?.filter(r => r.id !== reportId) ?? null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const launchHydraulicTest = () => {
    if (!detail) return;
    setActiveHydraulicJob({
      ligcdeId: item.id,
      clientName: detail.clientName || '',
      reference: detail.reference || '',
      vehiclePlate: detail.vehiclePlate || '',
      vehicleModel: detail.vehicleModel || '',
      codeArt: detail.codeArt || '',
      libelleArt: detail.libelleArt || '',
    });
    navigateTo('f2evo_hydraulic');
  };

  // Same handoff as launchHydraulicTest, to the Signal HIL page instead —
  // SignalPage reads activeSignalJob to prefill its ABS reference search
  // with the job's article (codeArt).
  const launchSignalTest = () => {
    if (!detail) return;
    setActiveSignalJob({
      ligcdeId: item.id,
      clientName: detail.clientName || '',
      reference: detail.reference || '',
      vehiclePlate: detail.vehiclePlate || '',
      vehicleModel: detail.vehicleModel || '',
      codeArt: detail.codeArt || '',
      libelleArt: detail.libelleArt || '',
    });
    navigateTo('signal');
  };

  const setFaultType = async (value: VerifiedFaultTypeValue) => {
    if (!currentUser?.remanTechId || !currentUser?.remanTechName || settingFaultType) return;
    setSettingFaultType(true);
    try {
      const updated = await invoke<InterventionDetail>('reman_set_verified_fault_type', {
        ligcdeId: item.id, techId: currentUser.remanTechId, techName: currentUser.remanTechName, faultType: value,
      });
      setDetail(updated);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSettingFaultType(false);
    }
  };

  const clearFaultType = async () => {
    if (settingFaultType) return;
    setSettingFaultType(true);
    try {
      const updated = await invoke<InterventionDetail>('reman_clear_verified_fault_type', { ligcdeId: item.id });
      setDetail(updated);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSettingFaultType(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Bench Report finding: this was a bare `<div onClick>` — no
          button, role, tabIndex, or keyboard handler — for the single
          most common interaction on this tab, inconsistent with every
          nested toggle in this same file (StepHistoryRow,
          KnowledgeLinkPanel, HydraulicReportRow), which all correctly use
          real <button> elements. Kept as a div (not a real <button>,
          which can't validly contain the nested interactive controls —
          links, buttons — this row does) but now reachable and operable
          the same way a button is. */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-elevated/50 transition-colors"
        onClick={toggle}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-text-primary">
              {item.clientName || `#${item.id}`}
            </span>
            {item.underWarranty && (
              <span
                title={t('reman.under_warranty')}
                className="flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-success/10 text-success border border-success/20"
              >
                <ShieldCheckIcon className="w-3 h-3" />
                {t('reman.under_warranty')}
              </span>
            )}
            <FaultTypeBadge hint={item.absFaultHint} verified={item.verifiedFaultType} />
            {item.hasPreviousJob && (
              // Neutral, not danger-red — at list level we don't yet know
              // whether the previous job was an actual repair failure or a
              // correctly-closed NFF the client simply disputed (see the
              // detail panel, which does know and colors accordingly).
              <span
                title={t('reman.previous_job_tooltip')}
                className="flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-elevated text-text-secondary border border-border"
              >
                <ArrowUturnLeftIcon className="w-3 h-3" />
                {t('reman.previous_job_badge')}
              </span>
            )}
            {item.statut && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-accent/10 text-accent border border-accent/20">
                {item.statut}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {item.reference && <span className="text-xs text-text-tertiary">{item.reference}</span>}
            {(item.vehiclePlate || item.vehicleModel) && (
              <span className="text-xs text-text-tertiary">
                {[item.vehiclePlate, item.vehicleModel].filter(Boolean).join(' · ')}
              </span>
            )}
            {showLastVisitInsteadOfDeadline
              ? item.dateDernInterv && <span className="text-xs text-text-tertiary">{item.dateDernInterv}</span>
              : item.limLivraison && <span className="text-xs text-text-tertiary">{item.limLivraison}</span>}
          </div>
        </div>
        <span className="text-text-tertiary shrink-0">
          {expanded ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
        </span>
      </div>

      {/* `initial={!!autoExpand}` — a normal row's detail shouldn't animate
          when the list first paints, but a scanned-in job mounts already
          expanded and should slide its detail open. */}
      <AnimatePresence initial={!!autoExpand}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1 border-t border-border space-y-3 text-xs">
              {loading && <LoadingRow label={t('common.loading')} />}
              {error && <p className="text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">{error}</p>}
              {detail && (
                <>
                  <div className="mb-2">
                    <OutcomeBadges outcome={detail.outcome} />
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-1">
                    <Field label={t('reman.field_reference')} value={detail.reference} />
                    <Field label={t('reman.field_status')} value={detail.statut} />
                    <Field label={t('reman.field_article')} value={detail.libelleArt || detail.codeArt} />
                    <Field
                      label={t('reman.field_vehicle')}
                      value={[detail.vehiclePlate, detail.vehicleModel].filter(Boolean).join(' · ') || undefined}
                    />
                    <Field label={t('reman.field_marque')} value={detail.marque} />
                    <Field label={t('reman.field_famille')} value={detail.famille} />
                    <Field label={t('reman.field_segmentation')} value={detail.segmentation} />
                    <Field label={t('reman.field_service')} value={detail.service} />
                    <Field label={t('reman.field_delivery')} value={detail.limLivraison} />
                    <Field label={t('reman.field_last_visit')} value={detail.dateDernInterv} />
                    <Field label={t('reman.field_delai_ligne')} value={detail.delaiLigne} />
                    <Field label={t('reman.field_temps_passe')} value={detail.tempsPasse} />
                    {detail.representantCode && (
                      <Field
                        label={t('reman.field_representant')}
                        value={detail.representantName
                          ? `${detail.representantName} (${detail.representantCode})`
                          : detail.representantCode}
                      />
                    )}
                  </div>
                  {(() => {
                    const hasClientInfo = Boolean(
                      detail.clientTel || detail.clientEmail || detail.clientVille ||
                      detail.address?.adr1 || detail.address?.adr2 ||
                      detail.clientContact || detail.refClient
                    );
                    const hasAmounts = Boolean(detail.amounts.mtLignes || detail.amounts.mtHtTotal || detail.amounts.mtTtc);
                    return (
                      <div className="flex items-center gap-2 flex-wrap">
                        {isOnBench ? (
                          <>
                            <span className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-success/10 border border-success/20 text-success">
                              <BeakerIcon className="w-3.5 h-3.5" />
                              {t('reman.hydraulic_linked_badge')}
                            </span>
                            <button
                              type="button"
                              onClick={() => navigateTo('f2evo_hydraulic')}
                              className="text-[11px] font-medium text-accent hover:underline"
                            >
                              {t('reman.hydraulic_go_to_bench')}
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={launchHydraulicTest}
                            className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-accent/10 border border-accent/20 text-accent hover:bg-accent hover:text-white transition-colors"
                          >
                            <BeakerIcon className="w-3.5 h-3.5" />
                            {t('reman.launch_hydraulic_test')}
                          </button>
                        )}
                        {isOnSignalBench ? (
                          <>
                            <span className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-success/10 border border-success/20 text-success">
                              <SignalIcon className="w-3.5 h-3.5" />
                              {t('reman.signal_linked_badge')}
                            </span>
                            <button
                              type="button"
                              onClick={() => navigateTo('signal')}
                              className="text-[11px] font-medium text-accent hover:underline"
                            >
                              {t('reman.signal_go_to_bench')}
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={launchSignalTest}
                            className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-accent/10 border border-accent/20 text-accent hover:bg-accent hover:text-white transition-colors"
                          >
                            <SignalIcon className="w-3.5 h-3.5" />
                            {t('reman.launch_signal_test')}
                          </button>
                        )}
                        {hasClientInfo && (
                          <button
                            type="button"
                            onClick={() => setPanel('client')}
                            className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-lg bg-elevated border border-border text-text-secondary hover:text-text-primary hover:border-accent/30 transition-colors"
                          >
                            <UserCircleIcon className="w-3.5 h-3.5" />
                            {t('reman.field_client')}
                          </button>
                        )}
                        {hasAmounts && (
                          <button
                            type="button"
                            onClick={() => setPanel('amounts')}
                            className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-lg bg-elevated border border-border text-text-secondary hover:text-text-primary hover:border-accent/30 transition-colors"
                          >
                            <BanknotesIcon className="w-3.5 h-3.5" />
                            {t('reman.montants_title')}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setQrOpen(true)}
                          className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-lg bg-elevated border border-border text-text-secondary hover:text-text-primary hover:border-accent/30 transition-colors"
                        >
                          <QrCodeIcon className="w-3.5 h-3.5" />
                          {t('scan.qr_label')}
                        </button>
                      </div>
                    );
                  })()}

                  <ScanModal
                    open={qrOpen}
                    onClose={() => setQrOpen(false)}
                    entity="job"
                    entityKey={item.id}
                    title={detail.reference || item.reference || `#${item.id}`}
                    subtitleLines={[
                      detail.clientName || '',
                      [detail.vehiclePlate, detail.vehicleModel].filter(Boolean).join(' · '),
                      detail.dateDernInterv || '',
                    ].filter(Boolean)}
                  />

                  {/* Hydraulic reports — an always-visible inline section
                      right next to the Launch Hydraulic Test control
                      (rather than tucked behind a button + side drawer),
                      so a saved report is easy to spot without extra
                      clicks. Each row collapses to type + timestamp,
                      expanding inline on click. */}
                  {hydraulicReports && hydraulicReports.length > 0 && (
                    <div className="rounded-lg border border-accent/20 bg-accent/5 p-2.5">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-text-primary mb-2">
                        <DocumentTextIcon className="w-3.5 h-3.5 text-accent" />
                        {t('reman.hydraulic_reports_title')} ({hydraulicReports.length})
                      </div>
                      <div className="space-y-1.5">
                        {hydraulicReports.map(r => (
                          <HydraulicReportRow key={r.id} report={r} onDelete={deleteHydraulicReport} />
                        ))}
                      </div>
                    </div>
                  )}

                  {ecuReports && ecuReports.length > 0 && (
                    <div className="rounded-lg border border-accent/20 bg-accent/5 p-2.5">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-text-primary mb-2">
                        <DocumentTextIcon className="w-3.5 h-3.5 text-accent" />
                        {t('reman.ecu_reports_title')} ({ecuReports.length})
                      </div>
                      <div className="space-y-1.5">
                        {ecuReports.map(r => (
                          <HydraulicReportRow key={r.id} report={r} onDelete={deleteEcuReport} i18nPrefix="ecu_report" />
                        ))}
                      </div>
                    </div>
                  )}

                  <AnimatePresence>
                    {panel === 'client' && (
                      <SidePanel title={t('reman.field_client')} onClose={() => setPanel(null)}>
                        <Field label={t('reman.field_nom')} value={detail.clientName} />
                        <Field label={t('reman.field_ville')} value={[detail.clientCp, detail.clientVille].filter(Boolean).join(' ')} />
                        <Field label={t('reman.field_tel')} value={detail.clientTel} />
                        <Field label={t('reman.field_email')} value={detail.clientEmail} />
                        <Field
                          label={t('reman.field_adresse')}
                          value={[detail.address?.adr1, detail.address?.adr2, [detail.address?.cp, detail.address?.ville].filter(Boolean).join(' ')]
                            .filter(Boolean)
                            .join(', ')}
                        />
                        <Field label={t('reman.field_contact')} value={detail.clientContact} />
                        <Field label={t('reman.field_ref_client')} value={detail.refClient} />
                      </SidePanel>
                    )}
                    {panel === 'amounts' && (
                      <SidePanel title={t('reman.montants_title')} onClose={() => setPanel(null)}>
                        <Field label={t('reman.field_mt_lignes')} value={detail.amounts.mtLignes} />
                        <Field label={t('reman.field_mt_port')} value={detail.amounts.mtPort} />
                        <Field label={t('reman.field_mt_ht')} value={detail.amounts.mtHtTotal} />
                        <Field label={t('reman.field_mt_tva')} value={detail.amounts.mtTva} />
                        <div className="pt-2 mt-2 border-t border-border">
                          <span className="text-text-tertiary">{t('reman.field_mt_ttc')}</span>
                          <p className="text-text-primary text-base font-semibold mt-0.5">{detail.amounts.mtTtc}</p>
                        </div>
                      </SidePanel>
                    )}
                  </AnimatePresence>
                  {detail.commentaireClient && (
                    <div>
                      <span className="text-text-tertiary">{t('reman.field_commentaire_client')}</span>
                      <p className="text-text-secondary mt-0.5 whitespace-pre-line">{detail.commentaireClient}</p>
                    </div>
                  )}
                  {detail.commentaireInterne && (
                    <div>
                      <span className="text-text-tertiary">{t('reman.field_commentaire_interne')}</span>
                      <p className="text-text-secondary mt-0.5 whitespace-pre-line">{detail.commentaireInterne}</p>
                    </div>
                  )}
                  {/* Requested directly: "i can verify the badges and set
                      them as well, like if i read or test a unit i can
                      just set if it's hydraulic or ecu fault or both." Same
                      Type_Service=101 scope as classify_abs_fault_hint —
                      the only service this has been verified against. */}
                  {detail.service === '101' && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-text-tertiary shrink-0">{t('reman.set_fault_type_title')}</span>
                      {!currentUser?.remanTechId || !currentUser?.remanTechName ? (
                        <span className="text-[11px] text-text-tertiary italic">{t('reman.set_fault_type_claim_hint')}</span>
                      ) : (
                        <div className="flex items-center gap-1 flex-wrap">
                          {(['hydraulic', 'ecu', 'both'] as const).map(v => (
                            <button
                              key={v}
                              type="button"
                              disabled={settingFaultType}
                              onClick={() => setFaultType(v)}
                              className={[
                                'text-[11px] font-medium px-2 py-1 rounded-md border transition-colors disabled:opacity-50',
                                detail.verifiedFaultType?.faultType === v
                                  ? 'bg-accent text-white border-accent'
                                  : 'bg-elevated border-border text-text-secondary hover:text-text-primary',
                              ].join(' ')}
                            >
                              {t(`reman.set_fault_type_${v}`)}
                            </button>
                          ))}
                          {detail.verifiedFaultType && (
                            <button
                              type="button"
                              disabled={settingFaultType}
                              onClick={clearFaultType}
                              className="text-[11px] text-text-tertiary hover:text-danger transition-colors disabled:opacity-50"
                            >
                              {t('reman.set_fault_type_clear')}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {detail.previousJob && (() => {
                    // A previous job that's NFF, or whose warranty claim was
                    // refused (different fault / other stated reason) isn't
                    // a repair failure — reported directly (job 17477701,
                    // linked to 17456901's "ABS déjà contrôlé en NFF... le
                    // client insiste" then exchanged per client request),
                    // confirmed for the SG-refusal fields too. Styled
                    // neutral, not danger-red — the red "warranty comeback"
                    // framing is reserved for cases where a completed repair
                    // actually came back.
                    const refused = detail.previousJob.warrantyRefused;
                    return (
                      <div className={`rounded-lg p-2.5 space-y-1.5 border ${refused ? 'bg-elevated border-border' : 'bg-danger/5 border-danger/20'}`}>
                        <div className={`flex items-center gap-1.5 text-[11px] font-semibold ${refused ? 'text-text-secondary' : 'text-danger'}`}>
                          <ArrowUturnLeftIcon className="w-3.5 h-3.5" />
                          {t(refused ? 'reman.previous_job_title_nff' : 'reman.previous_job_title', { ref: detail.previousJob.reference || detail.previousJob.id })}
                        </div>
                        <div className="flex items-center gap-3 flex-wrap text-[11px] text-text-secondary">
                          {detail.previousJob.techName && (
                            <span>{t('reman.previous_job_closed_by', { name: detail.previousJob.techName })}</span>
                          )}
                          {detail.previousJob.dateDernInterv && <span>{detail.previousJob.dateDernInterv}</span>}
                          {detail.previousJob.statut && <span>{detail.previousJob.statut}</span>}
                        </div>
                        <OutcomeBadges outcome={detail.previousJob.outcome} />
                      </div>
                    );
                  })()}
                  {!detail.soldee && (
                    <AddStepForm
                      ligcdeId={item.id}
                      service={detail.service}
                      testsActionsSelected={detail.testsActionsSelected}
                      accessoires={detail.accessoires}
                      onAdded={(d, stepType) => { setDetail(d); onStepAdded?.(item.id, stepType); }}
                      onClosed={d => { setDetail(d); onClosed?.(item.id); }}
                      onAccessoiresUpdated={setDetail}
                      onStaleClose={refreshDetail}
                      onIntentToEdit={setWantsToEdit}
                      lockedByOther={lockStatus?.lockedByOther}
                      lockedByName={lockStatus?.otherTechName}
                    />
                  )}
                  <StepHistory steps={detail.steps} />
                  <KnowledgeLinkPanel
                    ligcdeId={item.id}
                    family={detail.famille}
                    ecuRef={detail.codeArt}
                    ecuBrand={detail.marque}
                    vehicleModel={detail.vehicleModel}
                    // Bench Report finding: a saved hydraulic bench report's
                    // raw log — already fetched into this same component,
                    // right below — is exactly where a DTC/fault code is
                    // likely to appear, and wasn't feeding the fault-code
                    // detector at all.
                    symptomText={[
                      detail.commentaireClient,
                      detail.commentaireInterne,
                      ...detail.steps.map(s => s.commentaire),
                      ...(hydraulicReports ?? []).map(r => r.reportText),
                    ]
                      .filter(Boolean)
                      .join(' \n ')}
                  />
                  {detail.lines.length > 0 && (
                    <div>
                      <span className="text-text-tertiary font-medium">{t('reman.lines_title')}</span>
                      <div className="mt-1.5 space-y-1">
                        {detail.lines.map(line => (
                          <div key={line.id} className="flex items-center justify-between bg-elevated rounded-lg px-2.5 py-1.5">
                            <span className="text-text-secondary truncate">{line.libArt || line.codeArt}</span>
                            {line.prixNet && <span className="text-text-tertiary shrink-0 ml-2">{line.prixNet}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const INTERVENTION_QUEUES: { id: InterventionQueueId; labelKey: string }[] = [
  { id: 'open', labelKey: 'reman.queue_open' },
  { id: 'commercial', labelKey: 'reman.queue_commercial' },
  { id: 'subcontractor', labelKey: 'reman.queue_subcontractor' },
  { id: 'awaiting_parts', labelKey: 'reman.queue_awaiting_parts' },
  { id: 'awaiting_info', labelKey: 'reman.queue_awaiting_info' },
  { id: 'awaiting_cleaning', labelKey: 'reman.queue_awaiting_cleaning' },
  { id: 'repair_in_progress', labelKey: 'reman.queue_repair_in_progress' },
  { id: 'closed', labelKey: 'reman.queue_closed' },
];

function InterventionsTab({ techId, focusJobId, onClearFocus }: {
  techId?: string;
  // A job reached by scanning its QR code — fetched on its own and pinned,
  // expanded, above the queue list until dismissed. See RemanPage's
  // pendingScan effect.
  focusJobId?: string | null;
  onClearFocus?: () => void;
}) {
  const { t } = useTranslation();
  const { currentUser } = useSession();
  const [focusItem, setFocusItem] = useState<InterventionDetail | null>(null);
  const [focusLoading, setFocusLoading] = useState(false);
  const [focusError, setFocusError] = useState('');
  const focusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focusJobId) { setFocusItem(null); setFocusError(''); return; }
    let cancelled = false;
    setFocusLoading(true);
    setFocusError('');
    invoke<InterventionDetail>('reman_get_intervention', { id: focusJobId })
      .then(d => { if (!cancelled) setFocusItem(d); })
      .catch((err: unknown) => { if (!cancelled) setFocusError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (!cancelled) setFocusLoading(false); });
    // Bring the pinned card into view — the scan may have landed while the
    // list was scrolled down, or the tab was already open elsewhere. Waits
    // a frame so the entrance animation is already laying out.
    const id = window.setTimeout(
      () => focusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      80,
    );
    return () => { cancelled = true; window.clearTimeout(id); };
  }, [focusJobId]);
  // Owns its own search box rather than sharing RemanPage's — requested
  // directly: "check how it was done in repair jobs section... all the
  // search like family or date filtering should [be] next to the big
  // search component," which needs the queue picker on the same row as
  // the search input. RemanPage's shared bar is one row with one control;
  // this tab needs the search box plus a queue selector right beside it,
  // so it renders its own instead (same self-contained pattern Jobs.tsx
  // already uses for its search+status-dropdown row).
  const [rawQuery, setRawQuery] = useState('');
  const query = useDebounced(rawQuery, 300);
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { searchInputRef.current?.focus(); }, []);
  // Lands on the queue matching the technician's role (Saisie Interventions
  // for technicien, Suivi service commercial for commercial) each time this
  // tab mounts — see the AskUserQuestion decision this was built from.
  const [queue, setQueue] = useState<InterventionQueueId>(() => defaultQueueForRole(currentUser?.role));
  const [items, setItems] = useState<InterventionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  // Filters — requested directly: filter by family, by fault (ECU/hydraulic),
  // and by date with a quick "Today" button.
  const [family, setFamily] = useState('');
  const [faultType, setFaultType] = useState<'' | 'hydraulic' | 'ecu' | 'both'>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Unlike Clients/Stock, an empty query still fetches here — the backend
  // returns the queue's worklist instead of nothing, so the tab defaults to
  // an incoming worklist instead of an empty "type to search" state.
  //
  // Also auto-refreshes on INTERVENTIONS_REFRESH_MS while this queue stays
  // selected — a background tick is silent (no `loading`, which would
  // otherwise blank the list to a "Searching..." placeholder every few
  // minutes); only the initial fetch and actual query/queue changes show
  // that state.
  useEffect(() => {
    let cancelled = false;
    const fetchItems = (isFirst: boolean) => {
      if (isFirst) setLoading(true); else setRefreshing(true);
      setError('');
      invoke<InterventionSummary[]>('reman_search_interventions', {
        query, queue, techId: techId ?? null,
        family: family.trim() || null,
        faultType: faultType || null,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
      })
        .then(r => {
          if (cancelled) return;
          if (isFirst) {
            setItems(r);
            return;
          }
          // Silent background poll — merge in place instead of replacing
          // the array wholesale, so a row's position never shifts under
          // someone actively viewing it. Reported directly: "sometimes i
          // have a job opened and it will just move the page very
          // weird" — a reordered list, combined with an expanded (much
          // taller) row moving to a new position, is exactly what causes
          // that. Existing rows keep their slot and get fresh data
          // (badges, status); genuinely new rows are appended at the
          // end rather than inserted at their "correct" sorted position
          // (a real but minor tradeoff — stability over perfect live
          // ordering for a background tick only; the next real fetch,
          // e.g. a filter change, always gets the server's true order).
          setItems(prev => {
            const fresh = new Map(r.map(item => [item.id, item]));
            const merged = prev.filter(item => fresh.has(item.id)).map(item => fresh.get(item.id)!);
            const seen = new Set(merged.map(item => item.id));
            for (const item of r) {
              if (!seen.has(item.id)) merged.push(item);
            }
            return merged;
          });
        })
        .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); })
        .finally(() => { if (!cancelled) { if (isFirst) setLoading(false); else setRefreshing(false); } });
    };
    fetchItems(true);
    const interval = setInterval(() => fetchItems(false), INTERVENTIONS_REFRESH_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [query, queue, techId, family, faultType, dateFrom, dateTo]);

  const todayISO = () => {
    const d = new Date();
    // Local date components, not toISOString() (which shifts to UTC and
    // can land on the wrong calendar day depending on timezone offset).
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const isToday = dateFrom === todayISO() && dateTo === todayISO();
  const toggleToday = () => {
    if (isToday) { setDateFrom(''); setDateTo(''); }
    else { const t = todayISO(); setDateFrom(t); setDateTo(t); }
  };
  const hasActiveFilters = Boolean(family || faultType || dateFrom || dateTo);
  const clearFilters = () => { setFamily(''); setFaultType(''); setDateFrom(''); setDateTo(''); };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <MagnifyingGlassIcon className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input
            ref={searchInputRef}
            type="text"
            value={rawQuery}
            onChange={e => setRawQuery(e.target.value)}
            placeholder={t('reman.search_interventions_ph')}
            className="w-full bg-card border border-border rounded-lg pl-8 pr-3 py-2
              text-xs text-text-primary placeholder:text-text-tertiary
              focus:outline-none focus:ring-1 focus:ring-accent/40 focus:border-accent/40 transition-all"
          />
        </div>
        <select
          value={queue}
          onChange={e => setQueue(e.target.value as InterventionQueueId)}
          className="bg-card border border-border rounded-lg px-3 py-2 text-xs text-text-primary
            focus:outline-none focus:ring-1 focus:ring-accent/40 focus:border-accent/40 transition-all shrink-0"
        >
          {INTERVENTION_QUEUES.map(q => (
            <option key={q.id} value={q.id}>{t(q.labelKey)}</option>
          ))}
        </select>
        {refreshing && <ArrowPathIcon className="w-3.5 h-3.5 text-text-tertiary animate-spin shrink-0" />}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <input
          type="text"
          value={family}
          onChange={e => setFamily(e.target.value)}
          placeholder={t('reman.filter_family_ph')}
          className="w-36 bg-card border border-border rounded-lg px-2.5 py-1.5 text-[11px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent/40"
        />
        <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-0.5">
          {([
            { id: '', label: t('reman.filter_fault_all') },
            { id: 'hydraulic', label: t('reman.filter_fault_hydraulic') },
            { id: 'ecu', label: t('reman.filter_fault_ecu') },
            { id: 'both', label: t('reman.filter_fault_both') },
          ] as const).map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFaultType(f.id)}
              className={[
                'text-[11px] font-medium px-2 py-1 rounded-md transition-colors',
                faultType === f.id ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary',
              ].join(' ')}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          type="date"
          value={dateFrom}
          max={dateTo || undefined}
          onChange={e => setDateFrom(e.target.value)}
          className="bg-card border border-border rounded-lg px-2 py-1.5 text-[11px] text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/40"
          style={{ colorScheme: 'inherit' }}
        />
        <span className="text-text-tertiary text-[11px]">→</span>
        <input
          type="date"
          value={dateTo}
          min={dateFrom || undefined}
          onChange={e => setDateTo(e.target.value)}
          className="bg-card border border-border rounded-lg px-2 py-1.5 text-[11px] text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/40"
          style={{ colorScheme: 'inherit' }}
        />
        <button
          type="button"
          onClick={toggleToday}
          className={[
            'text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border transition-all',
            isToday ? 'bg-accent text-white border-accent' : 'bg-card border-border text-text-secondary hover:text-text-primary hover:border-accent/30',
          ].join(' ')}
        >
          {t('reman.filter_today')}
        </button>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-[11px] text-text-tertiary hover:text-danger transition-colors"
          >
            {t('reman.filter_clear')}
          </button>
        )}
      </div>

      <AnimatePresence>
        {focusJobId && (
          <motion.div
            key={focusJobId}
            ref={focusRef}
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98, transition: { duration: 0.15 } }}
            transition={{ type: 'spring', stiffness: 360, damping: 30 }}
            className="rounded-xl border border-accent/40 bg-accent/5 ring-2 ring-accent/15 p-2 space-y-2"
          >
            <div className="flex items-center justify-between px-1">
              <span className="flex items-center gap-1 text-[11px] font-semibold text-accent">
                <QrCodeIcon className="w-3.5 h-3.5" />
                {t('scan.scanned_job')}
              </span>
              <button
                type="button"
                onClick={onClearFocus}
                className="text-[11px] text-text-tertiary hover:text-danger transition-colors"
              >
                {t('scan.dismiss')}
              </button>
            </div>
            {focusLoading && <LoadingRow label={t('common.loading')} className="flex items-center gap-1.5 text-xs text-text-tertiary px-1" />}
            {focusError && (
              <p className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">{focusError}</p>
            )}
            {focusItem && <InterventionRow key={`focus-${focusItem.id}`} item={focusItem} autoExpand />}
          </motion.div>
        )}
      </AnimatePresence>

      {/* The bench forecast reflects everyone currently on the bench —
          only meaningful on the global (unfiltered) view. */}
      {queue === 'open' && !techId && <RemanForecast />}
      <ResultList
        alwaysActive
        query={query}
        loading={loading}
        error={error}
        empty={items.length === 0}
        count={items.length}
        icon={<BriefcaseIcon className="w-10 h-10 text-text-tertiary mx-auto mb-3 opacity-40" />}
      >
        {items.map(item => (
          <InterventionRow
            key={item.id}
            item={item}
            showLastVisitInsteadOfDeadline={queue === 'closed'}
            // Instant feedback rather than waiting for the next
            // INTERVENTIONS_REFRESH_MS poll — requested directly ("kick it
            // out of suivi d'interventions directly... make the app a bit
            // more alive"). The closed job wouldn't match this queue's
            // results on the next real refetch anyway; this just removes
            // the round-trip wait for something already known locally.
            onClosed={closedId => setItems(prev => prev.filter(i => i.id !== closedId))}
            // Same idea, for a step that changes queue membership without
            // fully closing the job (e.g. ATN/NET) — see stepLeavesQueue.
            onStepAdded={(id, stepType) => {
              if (stepLeavesQueue(stepType, queue)) {
                setItems(prev => prev.filter(i => i.id !== id));
              }
            }}
          />
        ))}
      </ResultList>
    </div>
  );
}

/* ── My Jobs tab — claim a REMAN technician identity, then reuse the
     same queue-tabbed intervention list scoped to just that tech's
     jobs. Keeps "Suivi d'interventions" itself global; this is the
     personal view layered on top, not a replacement. ──────────────── */

function MyJobsTab() {
  const { t } = useTranslation();
  const { currentUser, updateRemanTech } = useSession();
  const [technicians, setTechnicians] = useState<TechnicianOption[]>([]);
  const [loadingTechs, setLoadingTechs] = useState(false);
  const [techError, setTechError] = useState('');
  const [selected, setSelected] = useState('');
  const [claiming, setClaiming] = useState(false);

  const claimedId = currentUser?.remanTechId;
  const claimedName = currentUser?.remanTechName;

  useEffect(() => {
    if (claimedId) return;
    let cancelled = false;
    setLoadingTechs(true);
    setTechError('');
    invoke<TechnicianOption[]>('reman_list_technicians')
      .then(r => { if (!cancelled) setTechnicians(r); })
      .catch((err: unknown) => { if (!cancelled) setTechError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (!cancelled) setLoadingTechs(false); });
    return () => { cancelled = true; };
  }, [claimedId]);

  const handleClaim = async () => {
    const tech = technicians.find(opt => opt.techId === selected);
    if (!tech) return;
    setClaiming(true);
    try {
      await updateRemanTech(tech.techId, tech.techName);
    } finally {
      setClaiming(false);
    }
  };

  if (!claimedId || !claimedName) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 text-center space-y-4 max-w-md mx-auto">
        <UserCircleIcon className="w-10 h-10 text-text-tertiary mx-auto opacity-50" />
        <div>
          <h3 className="text-sm font-semibold text-text-primary">{t('reman.my_jobs.claim_title')}</h3>
          <p className="text-xs text-text-tertiary mt-1">{t('reman.my_jobs.claim_subtitle')}</p>
        </div>
        {techError && (
          <p className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">{techError}</p>
        )}
        {loadingTechs ? (
          <LoadingRow label={t('common.loading')} className="flex items-center gap-1.5 text-xs text-text-tertiary" />
        ) : (
          <div className="flex items-center gap-2">
            <select
              value={selected}
              onChange={e => setSelected(e.target.value)}
              className="flex-1 bg-elevated border border-border rounded-lg px-3 py-2 text-xs text-text-primary
                focus:outline-none focus:ring-1 focus:ring-accent/40"
            >
              <option value="">{t('reman.my_jobs.pick_placeholder')}</option>
              {technicians.map(opt => (
                <option key={opt.techId} value={opt.techId}>{opt.techName}</option>
              ))}
            </select>
            <button
              onClick={handleClaim}
              disabled={!selected || claiming}
              className="text-xs font-semibold px-3 py-2 rounded-lg bg-accent text-white disabled:opacity-50 shrink-0 transition-opacity"
            >
              {claiming ? t('common.saving') : t('reman.my_jobs.claim_button')}
            </button>
          </div>
        )}
        <p className="text-[10px] text-text-tertiary italic">{t('reman.my_jobs.claim_hint')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between bg-card border border-border rounded-xl px-4 py-2.5">
        <p className="text-xs text-text-secondary">
          {t('reman.my_jobs.viewing_as', { name: claimedName })}
        </p>
        <button
          onClick={() => updateRemanTech(null, null)}
          className="text-[11px] font-medium text-accent hover:opacity-70 transition-opacity shrink-0"
        >
          {t('reman.my_jobs.change')}
        </button>
      </div>
      <InterventionsTab techId={claimedId} />
    </div>
  );
}

/* ── Achat tab ──────────────────────────────────────────────── */

function AchatRow({ item }: { item: AchatRequestSummary }) {
  return (
    <div className="bg-card border border-border rounded-xl px-4 py-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold text-text-primary">
          {item.descriptif || item.codeArticle || `#${item.id}`}
        </span>
        {item.etape && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-accent/10 text-accent border border-accent/20">
            {item.etape}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
        {item.codeArticle && <span className="text-xs text-text-tertiary">{item.codeArticle}</span>}
        {item.nomTech && <span className="text-xs text-text-tertiary">{item.nomTech}</span>}
        {item.dateDemande && <span className="text-xs text-text-tertiary">{item.dateDemande}</span>}
        {item.qte && (
          <span className="text-xs text-text-tertiary">
            {item.qteRecue ?? '0'} / {item.qte}
          </span>
        )}
      </div>
    </div>
  );
}

function AchatTab({ query }: { query: string }) {
  const [items, setItems] = useState<AchatRequestSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Same as Interventions: empty query still fetches — backend defaults to
  // pending requests (en demande / en commande / localisée).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    invoke<AchatRequestSummary[]>('reman_search_achat', { query })
      .then(r => { if (!cancelled) setItems(r); })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [query]);

  return (
    <ResultList
      alwaysActive
      query={query}
      loading={loading}
      error={error}
      empty={items.length === 0}
      count={items.length}
      icon={<ShoppingCartIcon className="w-10 h-10 text-text-tertiary mx-auto mb-3 opacity-40" />}
    >
      {items.map(item => <AchatRow key={item.id} item={item} />)}
    </ResultList>
  );
}

/* ── Clients tab ────────────────────────────────────────────── */

function ClientRow({ item }: { item: ClientSummary }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const toggle = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !detail && !loading) {
      setLoading(true);
      setError('');
      try {
        const d = await invoke<ClientDetail>('reman_get_client', { id: item.id });
        setDetail(d);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* See InterventionRow's identical fix above for why this stays a
          div (not a real <button>) but is now keyboard-reachable. */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-elevated/50 transition-colors"
        onClick={toggle}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
      >
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-text-primary">{item.nom || `#${item.id}`}</span>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {item.ville && <span className="text-xs text-text-tertiary">{item.ville}</span>}
            {item.tel && <span className="text-xs text-text-tertiary">{item.tel}</span>}
          </div>
        </div>
        <span className="text-text-tertiary shrink-0">
          {expanded ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
        </span>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1 border-t border-border space-y-3 text-xs">
              {loading && <LoadingRow label={t('common.loading')} />}
              {error && <p className="text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">{error}</p>}
              {detail && (
                <>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-1">
                    <Field label={t('reman.field_nom')} value={detail.nom} />
                    <Field label={t('reman.field_intitule')} value={detail.intitule} />
                    <Field label={t('reman.field_ville')} value={detail.ville ? `${detail.cp ?? ''} ${detail.ville}`.trim() : undefined} />
                    <Field label={t('reman.field_tel')} value={detail.tel} />
                    <Field label={t('reman.field_fax')} value={detail.fax} />
                    <Field label={t('reman.field_email')} value={detail.email} />
                  </div>
                  {detail.commentaire && <Field label={t('reman.field_commentaire')} value={detail.commentaire} />}
                  {detail.addresses.length > 0 && (
                    <div>
                      <span className="text-text-tertiary font-medium">{t('reman.addresses_title')}</span>
                      <div className="mt-1.5 space-y-1.5">
                        {detail.addresses.map(a => (
                          <div key={a.id} className="bg-elevated rounded-lg px-2.5 py-1.5">
                            <p className="text-text-secondary">{[a.adr1, a.adr2].filter(Boolean).join(', ')}</p>
                            <p className="text-text-tertiary">{[a.cp, a.ville].filter(Boolean).join(' ')}{a.nomContact ? ` · ${a.nomContact}` : ''}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ClientsTab({ query }: { query: string }) {
  const [items, setItems] = useState<ClientSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!query.trim()) { setItems([]); setError(''); return; }
    let cancelled = false;
    setLoading(true);
    setError('');
    invoke<ClientSummary[]>('reman_search_clients', { query })
      .then(r => { if (!cancelled) setItems(r); })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [query]);

  return (
    <ResultList
      query={query}
      loading={loading}
      error={error}
      empty={items.length === 0}
      count={items.length}
      icon={<UserGroupIcon className="w-10 h-10 text-text-tertiary mx-auto mb-3 opacity-40" />}
    >
      {items.map(item => <ClientRow key={item.id} item={item} />)}
    </ResultList>
  );
}

/* ── Stock tab ──────────────────────────────────────────────── */

function ArticleRow({ item, recentHint }: { item: ArticleSummary; recentHint?: RecentStockActivity }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<ArticleStockDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const toggle = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !detail && !loading) {
      setLoading(true);
      setError('');
      try {
        const d = await invoke<ArticleStockDetail>('reman_get_article_stock', { codeArt: item.codeArt });
        setDetail(d);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* See InterventionRow's identical fix above for why this stays a
          div (not a real <button>) but is now keyboard-reachable. */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-elevated/50 transition-colors"
        onClick={toggle}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
      >
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-text-primary">{item.designation || item.codeArt}</span>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <span className="text-xs text-text-tertiary">{item.codeArt}</span>
            {item.constructeur && <span className="text-xs text-text-tertiary">{item.constructeur}</span>}
            {recentHint?.lastOutcome && (
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md border ${
                  stockOutcomeTone(recentHint.lastTypeCode) === 'scrapped'
                    ? 'bg-danger/10 text-danger border-danger/20'
                    : 'bg-success/10 text-success border-success/20'
                }`}
              >
                {recentHint.lastOutcome}{recentHint.lastProcessedDate ? ` · ${recentHint.lastProcessedDate}` : ''}
              </span>
            )}
          </div>
        </div>
        <span className="text-text-tertiary shrink-0">
          {expanded ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
        </span>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1 border-t border-border space-y-3 text-xs">
              {loading && <LoadingRow label={t('common.loading')} />}
              {error && <p className="text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">{error}</p>}
              {detail && (
                <>
                  {detail.swapQty && (
                    <div className="flex items-center gap-2">
                      <span className="text-text-tertiary">{t('reman.swap_qty')}</span>
                      <span className="text-text-secondary font-semibold">{detail.swapQty}</span>
                    </div>
                  )}
                  {detail.stock.length === 0 ? (
                    <p className="text-text-tertiary italic">{t('reman.no_stock_units')}</p>
                  ) : (
                    <div className="space-y-1.5">
                      {detail.stock.map(u => (
                        <div key={u.id} className="bg-elevated rounded-lg px-2.5 py-1.5">
                          <p className="text-text-secondary truncate">{u.localisation || '—'}</p>
                          {u.noIdentif && <p className="text-text-tertiary truncate">{u.noIdentif}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                  {detail.processingHistory.length > 0 && (
                    <div className="pt-2 border-t border-border space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-text-tertiary font-medium">{t('reman.stock_processing_title')}</span>
                        <span className="text-[10px] text-text-tertiary">
                          {t('reman.stock_processing_summary', {
                            ready: detail.processingHistory.filter(r => stockOutcomeTone(r.typeCode) === 'ready').length,
                            scrapped: detail.processingHistory.filter(r => stockOutcomeTone(r.typeCode) === 'scrapped').length,
                          })}
                        </span>
                      </div>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {detail.processingHistory.map(r => {
                          const tone = stockOutcomeTone(r.typeCode);
                          return (
                            <div
                              key={r.ligcdeId}
                              className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 border ${
                                tone === 'ready' ? 'bg-success/5 border-success/20'
                                  : tone === 'scrapped' ? 'bg-danger/5 border-danger/20'
                                  : 'bg-elevated border-border'
                              }`}
                            >
                              <span className={tone === 'ready' ? 'text-success' : tone === 'scrapped' ? 'text-danger' : 'text-text-secondary'}>
                                {r.outcome || r.typeCode || '—'}
                              </span>
                              <span className="text-text-tertiary shrink-0">{r.date}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StockTab({ query }: { query: string }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<ArticleSummary[]>([]);
  const [recent, setRecent] = useState<RecentStockActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    // No search term yet — requested directly ("stock page is empty"):
    // show recent core-processing activity instead of nothing, so the
    // tab isn't empty until someone knows an article code to type.
    if (!query.trim()) {
      invoke<RecentStockActivity[]>('reman_recent_stock_processing')
        .then(r => { if (!cancelled) setRecent(r); })
        .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); })
        .finally(() => { if (!cancelled) setLoading(false); });
      return () => { cancelled = true; };
    }
    invoke<ArticleSummary[]>('reman_search_stock', { query })
      .then(r => { if (!cancelled) setItems(r); })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [query]);

  const showingRecent = !query.trim();

  return (
    <div className="space-y-2">
      {showingRecent && !loading && !error && recent.length > 0 && (
        <p className="text-[11px] text-text-tertiary px-0.5">{t('reman.stock_recent_activity_hint')}</p>
      )}
      <ResultList
        query={query}
        loading={loading}
        error={error}
        empty={showingRecent ? recent.length === 0 : items.length === 0}
        count={showingRecent ? recent.length : items.length}
        alwaysActive={showingRecent}
        icon={<ArchiveBoxIcon className="w-10 h-10 text-text-tertiary mx-auto mb-3 opacity-40" />}
      >
        {showingRecent
          ? recent.map(item => <ArticleRow key={item.codeArt} item={item} recentHint={item} />)
          : items.map(item => <ArticleRow key={item.codeArt} item={item} />)}
      </ResultList>
    </div>
  );
}

/* ── Shared result list shell ───────────────────────────────── */

function ResultList({
  query, loading, error, empty, icon, children, count, alwaysActive = false,
}: {
  query: string;
  loading: boolean;
  error: string;
  empty: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
  count: number;
  alwaysActive?: boolean;
}) {
  const { t } = useTranslation();
  if (!alwaysActive && !query.trim()) {
    return (
      <div className="text-center py-12">
        <MagnifyingGlassIcon className="w-10 h-10 text-text-tertiary mx-auto mb-3 opacity-40" />
        <p className="text-sm text-text-tertiary">{t('reman.type_to_search')}</p>
      </div>
    );
  }
  if (loading) {
    return <LoadingRow label={t('reman.searching')} className="flex items-center justify-center gap-2 py-12 text-text-tertiary text-sm" spinnerClassName="w-4 h-4" />;
  }
  if (error) {
    return (
      <div className="bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 flex items-start gap-2">
        <ExclamationTriangleIcon className="w-4 h-4 text-danger shrink-0 mt-0.5" />
        <div>
          <p className="text-xs text-danger">{error}</p>
          <p className="text-[10px] text-danger/70 mt-1">{t('reman.network_hint')}</p>
        </div>
      </div>
    );
  }
  if (empty) {
    return (
      <div className="text-center py-12">
        {icon}
        <p className="text-sm text-text-tertiary">{t('reman.no_results')}</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-text-tertiary px-0.5">
        {count >= RESULT_CAP ? t('reman.result_count_capped', { count }) : t('reman.result_count', { count })}
      </p>
      {children}
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────── */

export default function RemanPage() {
  const { t } = useTranslation();
  const { currentUser } = useSession();
  const { pendingScan, setPendingScan } = useTestSession();
  const [tab, setTab] = useState<Tab>('interventions');
  const [rawQuery, setRawQuery] = useState('');
  const query = useDebounced(rawQuery, 300);
  const inputRef = useRef<HTMLInputElement>(null);
  // Job id from a scanned QR code — pinned/expanded at the top of Suivi
  // d'interventions until dismissed (see InterventionsTab's focus block).
  const [focusJobId, setFocusJobId] = useState<string | null>(null);

  // Bench Report finding: Interventions/My Jobs unmounted (and so lost
  // every filter) the instant you switched to any other tab — check
  // something in Knowledge Base and come back to a reset queue/family/
  // date filter. Once either has been opened this session it now stays
  // mounted (just hidden) behind whichever tab is actually showing, so
  // its filters survive switching away — to another tab, or straight to
  // the other one of this pair — and back. A tab never opened this
  // session never mounts at all, so there's no extra background polling
  // for a view nobody's used yet.
  const [visitedInterventions, setVisitedInterventions] = useState(true);
  const [visitedMine, setVisitedMine] = useState(false);
  useEffect(() => {
    if (tab === 'interventions') setVisitedInterventions(true);
    if (tab === 'mine') setVisitedMine(true);
  }, [tab]);

  // A scan landed (ScanListener has already navigated to REMAN, or it was
  // the active page): switch to the right tab and act on it. Job → pin it
  // in Suivi d'interventions; stock → drop the id into the stock search.
  useEffect(() => {
    if (!pendingScan) return;
    if (pendingScan.entity === 'job') {
      setVisitedInterventions(true);
      setTab('interventions');
      setFocusJobId(pendingScan.key);
    } else if (pendingScan.entity === 'stock') {
      setTab('stock');
      setRawQuery(pendingScan.key);
    }
    setPendingScan(null);
  }, [pendingScan]);

  const isRosterAdmin = currentUser?.remanTechId === ROSTER_ADMIN_TECH_ID;

  const TABS: { id: Tab; label: string }[] = [
    { id: 'interventions', label: t('reman.tab_interventions') },
    { id: 'mine', label: t('reman.tab_mine') },
    { id: 'achat', label: t('reman.tab_achat') },
    { id: 'clients', label: t('reman.tab_clients') },
    { id: 'stock', label: t('reman.tab_stock') },
    { id: 'analytics', label: t('reman.tab_analytics') },
    { id: 'knowledge', label: t('reman.tab_knowledge') },
    ...(isRosterAdmin ? [{ id: 'roster' as Tab, label: t('reman.tab_roster') }] : []),
    ...(isRosterAdmin ? [{ id: 'finance' as Tab, label: t('reman.tab_finance') }] : []),
  ];

  const changeTab = useCallback((next: Tab) => {
    setTab(next);
    setRawQuery('');
    inputRef.current?.focus();
  }, []);

  // The tab bar row always gets the full max-w-6xl width, regardless of
  // which tab is active — with 8 tabs (added "Repair Knowledge"), the
  // narrower max-w-3xl used by list tabs no longer fits them on one line
  // and wraps mid-label. Everything below the tab bar keeps its original
  // per-tab width (narrow reading width for lists, wide for dashboards),
  // centered inside the wider outer container via its own mx-auto.
  const contentIsWide = tab === 'analytics' || tab === 'knowledge' || tab === 'roster' || tab === 'finance';

  return (
    <ChangeTabContext.Provider value={changeTab}>
    <div className="p-6 space-y-5 mx-auto max-w-6xl">
      <div>
        <h1 className="text-xl font-bold text-text-primary">REMAN</h1>
        <p className="text-xs text-text-tertiary mt-0.5">{t('reman.subtitle')}</p>
      </div>

      <div className="flex gap-1.5 bg-elevated border border-border rounded-lg p-1 flex-wrap">
        {TABS.map(tabDef => (
          <button
            key={tabDef.id}
            onClick={() => changeTab(tabDef.id)}
            className={[
              'relative flex-1 flex items-center justify-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-md whitespace-nowrap transition-colors',
              tab === tabDef.id
                ? 'text-white'
                : 'text-text-secondary hover:text-text-primary',
            ].join(' ')}
          >
            {/* Shared layoutId — requested directly: "when i click on my
                jobs it should move not vanish and reappear." Only the
                active tab renders this, but framer-motion tracks the
                layoutId across renders and animates a smooth transform
                between the previous tab's position/size and this one's,
                instead of the old background just vanishing and a new one
                popping in. */}
            {tab === tabDef.id && (
              <motion.div
                layoutId="reman-tab-pill"
                className="absolute inset-0 bg-accent rounded-md"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1">
              {tabDef.id === 'analytics' && <ChartBarIcon className="w-3.5 h-3.5" />}
              {tabDef.id === 'mine' && <UserCircleIcon className="w-3.5 h-3.5" />}
              {tabDef.label}
            </span>
          </button>
        ))}
      </div>

      <div className={['space-y-5 transition-all', contentIsWide ? '' : 'max-w-3xl mx-auto'].join(' ')}>
        {/* interventions/mine render their own search box (see
            InterventionsTab) — they need a queue picker on the same row,
            which this single-control shared bar can't offer. */}
        {tab !== 'analytics' && tab !== 'knowledge' && tab !== 'roster' && tab !== 'finance'
          && tab !== 'interventions' && tab !== 'mine' && (
          <div className="relative">
            <MagnifyingGlassIcon className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input
              ref={inputRef}
              type="text"
              value={rawQuery}
              onChange={e => setRawQuery(e.target.value)}
              placeholder={
                tab === 'achat' ? t('reman.search_achat_ph') :
                tab === 'clients' ? t('reman.search_clients_ph') :
                t('reman.search_stock_ph')
              }
              className="w-full bg-card border border-border rounded-lg pl-8 pr-3 py-2
                text-xs text-text-primary placeholder:text-text-tertiary
                focus:outline-none focus:ring-1 focus:ring-accent/40 focus:border-accent/40 transition-all"
            />
          </div>
        )}

        {visitedInterventions && (
          <div className={tab === 'interventions' ? '' : 'hidden'}>
            <InterventionsTab focusJobId={focusJobId} onClearFocus={() => setFocusJobId(null)} />
          </div>
        )}
        {visitedMine && <div className={tab === 'mine' ? '' : 'hidden'}><MyJobsTab /></div>}
        {tab === 'achat' && <AchatTab query={query} />}
        {tab === 'clients' && <ClientsTab query={query} />}
        {tab === 'stock' && <StockTab query={query} />}
        {tab === 'analytics' && <RemanAnalytics />}
        {tab === 'knowledge' && <RepairKnowledgeBase />}
        {tab === 'roster' && isRosterAdmin && <RemanRoster />}
        {tab === 'finance' && isRosterAdmin && <RemanFinance />}
      </div>
    </div>
    </ChangeTabContext.Provider>
  );
}
