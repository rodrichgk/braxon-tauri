import { useEffect, useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  MagnifyingGlassIcon, ArrowPathIcon, DocumentArrowDownIcon, TrashIcon,
  CheckCircleIcon, ExclamationTriangleIcon, XCircleIcon, ClockIcon,
} from '@heroicons/react/24/outline';
import type { Verdict } from '@/lib/ecuReport';
import {
  type SignalHilTestRecord, listSignalHilTests, deleteSignalHilTest, parseSignalHilDraft,
} from '@/lib/signalHilHistory';
import { generateEcuReportPdf } from '@/components/EcuTestReport';
import { LoadingRow } from '@/components/Spinner';

const VERDICT_ICON: Record<Verdict, JSX.Element> = {
  pass: <CheckCircleIcon className="w-3.5 h-3.5" />,
  review: <ExclamationTriangleIcon className="w-3.5 h-3.5" />,
  fail: <XCircleIcon className="w-3.5 h-3.5" />,
};
const VERDICT_CLASS: Record<Verdict, string> = {
  pass: 'bg-success/10 text-success border-success/20',
  review: 'bg-warning/10 text-warning border-warning/20',
  fail: 'bg-danger/10 text-danger border-danger/20',
};

interface Props {
  /** Prefills the search box — e.g. the job currently open on this page,
   *  so switching to History immediately shows that unit's past tests. */
  defaultSearch?: string;
}

export default function SignalHilHistory({ defaultSearch }: Props) {
  const { t } = useTranslation();
  const [records, setRecords] = useState<SignalHilTestRecord[] | null>(null);
  const [search, setSearch] = useState(defaultSearch ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback((q: string) => {
    setLoading(true);
    setError(false);
    listSignalHilTests({ search: q })
      .then(setRecords)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  // Debounced search — reload ~350ms after typing stops.
  useEffect(() => {
    const id = setTimeout(() => load(search), 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const redownload = (record: SignalHilTestRecord) => {
    const draft = parseSignalHilDraft(record);
    if (!draft) { toast.error(t('signal.history_error_load')); return; }
    const verdict = (record.verdict as Verdict | undefined) ?? null;
    generateEcuReportPdf(draft, {
      title: t('signal.report_title'),
      verdict,
      verdictLabel: verdict ? t(`signal.report_verdict_${verdict}`) : undefined,
      reason: record.reason ?? '',
      jobLabel: record.jobLabel,
      jobNumber: record.jobNumber,
    }, t);
  };

  const remove = async (record: SignalHilTestRecord) => {
    if (!window.confirm(t('signal.history_delete_confirm'))) return;
    setBusyId(record.id);
    try {
      await deleteSignalHilTest(record.id);
      setRecords(prev => prev?.filter(r => r.id !== record.id) ?? prev);
    } catch {
      toast.error(t('signal.history_error_load'));
    } finally {
      setBusyId(null);
    }
  };

  const rows = useMemo(() => records ?? [], [records]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold text-text-primary">{t('signal.history_title')}</h3>
          <p className="text-[10px] text-text-tertiary mt-0.5">{t('signal.history_subtitle')}</p>
        </div>
        <button
          onClick={() => load(search)}
          disabled={loading}
          className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-lg bg-elevated border border-border text-text-secondary hover:text-text-primary hover:border-accent/30 transition-colors disabled:opacity-40"
        >
          <ArrowPathIcon className={['w-3.5 h-3.5', loading ? 'animate-spin' : ''].join(' ')} />
          {t('signal.history_refresh')}
        </button>
      </div>

      <div className="relative">
        <MagnifyingGlassIcon className="w-3.5 h-3.5 text-text-tertiary absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('signal.history_search_placeholder')}
          className="input-field !pl-8 py-1.5 text-[11px] w-full"
        />
      </div>

      {loading && !records ? (
        <LoadingRow label={t('signal.history_loading')} className="flex items-center justify-center gap-1.5 py-8 text-xs text-text-tertiary" />
      ) : error ? (
        <p className="text-xs text-danger text-center py-8">{t('signal.history_error_load')}</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-text-tertiary text-center py-8">
          {search ? t('signal.history_empty_search') : t('signal.history_empty')}
        </p>
      ) : (
        <div className="space-y-1.5">
          {rows.map(r => {
            const verdict = r.verdict as Verdict | undefined;
            return (
              <div key={r.id} className="flex items-center gap-3 px-3 py-2 bg-elevated rounded-lg border border-border">
                <div className={[
                  'flex items-center gap-1 shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded border',
                  verdict ? VERDICT_CLASS[verdict] : 'bg-text-tertiary/10 text-text-tertiary border-border',
                ].join(' ')}>
                  {verdict ? VERDICT_ICON[verdict] : <ClockIcon className="w-3.5 h-3.5" />}
                  {verdict ? t(`signal.report_verdict_${verdict}`) : '—'}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[11px] font-medium text-text-primary truncate">
                    {r.ecuName || r.absRef || t('signal.history_unidentified')}
                    {r.manufacturer && <span className="text-text-tertiary font-normal">· {r.manufacturer}</span>}
                  </div>
                  <div className="flex items-center gap-x-3 gap-y-0.5 flex-wrap text-[10px] text-text-tertiary mt-0.5">
                    <span>{new Date(r.createdAt).toLocaleString()}</span>
                    {r.jobNumber ? (
                      <span className="px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium">
                        {r.jobLabel || r.jobNumber}
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded bg-text-tertiary/10 text-text-tertiary">
                        {t('signal.history_no_job')}
                      </span>
                    )}
                    {r.operator && <span>{t('signal.history_operator')}: {r.operator}</span>}
                    {r.faultCount > 0 && <span className="text-danger">{t('signal.history_faults')}: {r.faultCount}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => redownload(r)}
                    title={t('signal.history_download')}
                    className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-card transition-colors"
                  >
                    <DocumentArrowDownIcon className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => remove(r)}
                    disabled={busyId === r.id}
                    title={t('signal.history_delete')}
                    className="p-1.5 rounded-lg text-text-tertiary hover:text-danger hover:bg-card transition-colors disabled:opacity-40"
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
