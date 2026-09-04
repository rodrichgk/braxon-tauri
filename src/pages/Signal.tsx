import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { motion, AnimatePresence } from 'framer-motion';
import { MagnifyingGlassIcon, BriefcaseIcon, QrCodeIcon } from '@heroicons/react/24/outline';
import SignalTester from '@/components/SignalTester/SignalTesterMain';
import ScanModal from '@/components/ScanModal';
import LegacySignalPanel from '@/components/LegacySignalPanel';
import CANSettings from '@/components/CANSettings';
import CANAnalyzer from '@/components/CANAnalyzer';
import Diagnostics from '@/components/Diagnostics';
import TestReportCard from '@/components/TestReportCard';
import { useReports } from '@/contexts/ReportsContext';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import type { WSSChannels } from '@/contexts/AppSettingsContext';
import { WHEEL_LABELS } from '@/contexts/AppSettingsContext';
import PowerIndicators from '@/components/PowerIndicators';
import { useClientSerialConnection } from '@/hooks/useClientSerialConnection';
import { useSignalBoard } from '@/hooks/useSignalBoard';
import { useSession } from '@/contexts/SessionContext';
import { useTestSession } from '@/contexts/TestSessionContext';
import { useTranslation } from 'react-i18next';

interface ABSDataRow {
  id: string;
  reference: string;
  manufacturer: string;
  wssType?: string;
  absAdapter?: string;
  absConnector?: string;
  canSpeed?: string;
  canIdLine?: string;
  canByte?: string;
  canValue?: string;
  comments?: string;
  testValidated?: string;
  otherReferences?: string;
  kLine?: string;
  createdAt?: string;
  updatedAt?: string;
}

type EditMode = 'view' | 'edit' | 'add';

// Minimal subset of Reman.tsx's InterventionSummary — enough to show a
// pick list and build a TestSessionContext LinkedJob. Mirrors the F2-EVO
// hydraulic bench's own LinkCandidate (HydraulicBenchDashboard.tsx).
interface LinkCandidate {
  id: string;
  reference?: string;
  clientName?: string;
  codeArt?: string;
  libelleArt?: string;
  vehiclePlate?: string;
  vehicleModel?: string;
}

/* ── animation variants ── */
const sectionVariants = {
  hidden:  { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: [0.25, 0.1, 0.25, 1], delay: i * 0.07 },
  }),
};

const resultItemVariants = {
  hidden:  { opacity: 0, x: -8 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { duration: 0.18, ease: 'easeOut', delay: i * 0.04 },
  }),
  exit: { opacity: 0, x: 8, transition: { duration: 0.12 } },
};

export default function SignalPage() {
  const { t } = useTranslation();
  const { isConnected, sendCommand: serialSendCommand, source: transportSource } = useClientSerialConnection();
  // When the CAN side is on the Kvaser, WSS / power / waveform commands go to a
  // second board on USB instead of the (Kvaser) main transport.
  const signalBoard = useSignalBoard();
  const dualTransport = transportSource === 'kvaser';
  const signalConnected = dualTransport ? signalBoard.isConnected : isConnected;
  const signalSend = dualTransport ? signalBoard.sendCommand : serialSendCommand;
  const { currentJob, linkJobToRef } = useSession();
  const { pendingScan, setPendingScan, activeSignalJob, setActiveSignalJob } = useTestSession();
  const { patchIdent: reportPatchIdent, setWssChannels: reportSetWssChannels, resetCanActivity: reportResetCan } = useReports();
  const {
    legacyMode,
    legacyFreq,
    wssChannels, setWssChannels,
    wssCalPpr, setWssCalPpr,
    wssCalCirc, setWssCalCirc,
    setLegacyCanSpeed,
    setLegacySensorType,
  } = useAppSettings();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ABSDataRow[]>([]);
  const [selected, setSelected] = useState<ABSDataRow | null>(null);
  const [searching, setSearching] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  // Reference from a scanned ABS QR — remembered so the matching row can be
  // auto-opened once the search it triggers returns.
  const scannedRef = useRef<string | null>(null);
  // Last REMAN job whose article was pushed into the search box — keyed by
  // ligcdeId so a newly-linked job re-seeds, but typing over it (or
  // re-renders) doesn't.
  const seededJobRef = useRef<string | null>(null);

  // Inline "link a REMAN job from here" search — mirrors the F2-EVO
  // hydraulic bench's own. Scoped to the 'open' queue: a tech linking a
  // job at the HIL rig is almost always on active work, not something
  // already closed.
  const [linkQuery, setLinkQuery] = useState('');
  const [linkResults, setLinkResults] = useState<LinkCandidate[]>([]);
  const [linkSearching, setLinkSearching] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const legacyFreqRef = useRef(legacyFreq);
  legacyFreqRef.current = legacyFreq;
  const isConnectedRef = useRef(isConnected);
  isConnectedRef.current = isConnected;
  const sendCommandRef = useRef(serialSendCommand);
  sendCommandRef.current = serialSendCommand;

  // Edit / Add state
  const [editMode, setEditMode] = useState<EditMode>('view');
  const [draft, setDraft] = useState<Partial<ABSDataRow>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // WSS calibration load/save state
  type CalStatus = 'idle' | 'loading' | 'loaded' | 'none' | 'saving' | 'saved' | 'error';
  const [calStatus, setCalStatus] = useState<CalStatus>('idle');

  const canData = {
    canSpeed:  selected?.canSpeed  || '',
    canByte:   selected?.canByte   || '',
    canIdLine: selected?.canIdLine || '',
    canValue:  selected?.canValue  || '',
  };
  const canReceivedData = { idLine: '', byte: '', value: '' };

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await invoke<ABSDataRow[]>('search_abs_data', { query });
        setResults(data);
      } catch (e: any) {
        console.error('Search error:', e);
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // A scanned ABS QR: run its reference through the search box, and open
  // the exact-match row when the results come back.
  useEffect(() => {
    if (pendingScan?.entity !== 'abs') return;
    scannedRef.current = pendingScan.key;
    setQuery(pendingScan.key);
    setPendingScan(null);
  }, [pendingScan]);

  // A linked REMAN job (from a job card's "Signal HIL" button, or the
  // inline search below): seed the ABS reference search with the job's
  // article so the tech doesn't retype it, and reuse the scanned-QR path
  // to auto-open the exact matching row if there is one.
  useEffect(() => {
    if (!activeSignalJob) return;
    if (seededJobRef.current === activeSignalJob.ligcdeId) return;
    const seed = (activeSignalJob.codeArt || activeSignalJob.libelleArt || '').trim();
    if (!seed) return;
    seededJobRef.current = activeSignalJob.ligcdeId;
    scannedRef.current = seed;
    setSelected(null);
    setEditMode('view');
    setQuery(seed);
  }, [activeSignalJob]);

  useEffect(() => {
    if (!scannedRef.current) return;
    const want = scannedRef.current.toLowerCase();
    const hit = results.find(r => r.reference.toLowerCase() === want);
    if (hit) {
      setSelected(hit);
      setEditMode('view');
      scannedRef.current = null;
    }
  }, [results]);

  // Debounced job search for the inline "link a job" box.
  useEffect(() => {
    const trimmed = linkQuery.trim();
    if (trimmed.length < 2) { setLinkResults([]); setLinkSearching(false); return; }
    setLinkSearching(true);
    let cancelled = false;
    const timer = setTimeout(() => {
      invoke<LinkCandidate[]>('reman_search_interventions', {
        query: trimmed, queue: 'open', techId: null, family: null, faultType: null, dateFrom: null, dateTo: null,
      })
        .then(r => { if (!cancelled) setLinkResults(r.slice(0, 8)); })
        .catch(() => { if (!cancelled) setLinkResults([]); })
        .finally(() => { if (!cancelled) setLinkSearching(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [linkQuery]);

  const linkJob = (job: LinkCandidate) => {
    setActiveSignalJob({
      ligcdeId: job.id,
      clientName: job.clientName ?? '',
      reference: job.reference ?? '',
      vehiclePlate: job.vehiclePlate ?? '',
      vehicleModel: job.vehicleModel ?? '',
      codeArt: job.codeArt ?? '',
      libelleArt: job.libelleArt ?? '',
    });
    setLinkQuery('');
    setLinkResults([]);
    setLinkOpen(false);
  };

  // Auto-configure everything when a reference is selected in legacy mode
  useEffect(() => {
    if (!legacyMode || !selected) {
      if (!legacyMode) setCalStatus('idle');
      return;
    }

    let waveformTimer: ReturnType<typeof setTimeout> | null = null;

    const canSpeedCmd = parseDbCanSpeed(selected.canSpeed);
    if (canSpeedCmd !== null) {
      setLegacyCanSpeed(canSpeedCmd);
      if (isConnectedRef.current) sendCommandRef.current(`CANSpeed : ${canSpeedCmd}\n`);
    }

    const sensorType = parseDbSensorType(selected.wssType);
    if (sensorType !== null) {
      setLegacySensorType(sensorType);
      if (isConnectedRef.current) {
        const msg = sensorType === 0
          ? `Waveform : 0,0\n`
          : `Waveform : ${sensorType},${legacyFreqRef.current}\n`;
        waveformTimer = setTimeout(() => sendCommandRef.current(msg), 300);
      }
    }

    setCalStatus('loading');
    invoke<string | null>('get_wss_calibration', { id: selected.id })
      .then(json => {
        if (json) {
          try {
            const data = JSON.parse(json);
            const channels: WSSChannels = Array.isArray(data) ? data : data.channels;
            if (channels?.some((ch: unknown) => ch !== null)) {
              setWssChannels(channels);
              if (!Array.isArray(data)) {
                if (typeof data.ppr  === 'number') setWssCalPpr(data.ppr);
                if (typeof data.circ === 'number') setWssCalCirc(data.circ);
              }
              setCalStatus('loaded');
              return;
            }
          } catch { /* ignore parse error */ }
        }
        setWssChannels([null, null, null, null]);
        setCalStatus('none');
      })
      .catch(() => setCalStatus('error'));

    return () => { if (waveformTimer !== null) clearTimeout(waveformTimer); };
  }, [selected?.id, legacyMode]);

  // ── Feed the Test Report draft ─────────────────────────────
  // The selected ABS reference is the report's identity; a new reference
  // also resets the passive CAN-activity counter so "traffic seen" means
  // "since this unit went on the bench", not the whole app session.
  const lastReportedRefRef = useRef<string | null>(null);
  useEffect(() => {
    reportPatchIdent({
      absRef: selected?.reference,
      manufacturer: selected?.manufacturer,
      wssType: selected?.wssType,
    });
    const ref = selected?.reference ?? null;
    if (ref && ref !== lastReportedRefRef.current) {
      lastReportedRefRef.current = ref;
      reportResetCan();
    }
  }, [selected, reportPatchIdent, reportResetCan]);

  useEffect(() => {
    reportSetWssChannels(
      (['FL', 'FR', 'RL', 'RR'] as const).map((wheel, i) => {
        const ch = wssChannels[i];
        return {
          wheel,
          canId: ch?.canId ?? null,
          byteIdx: ch?.byteIdx ?? null,
          kmhPerHz: ch?.kmhPerHz ?? null,
          assigned: !!ch,
        };
      }),
    );
  }, [wssChannels, reportSetWssChannels]);

  const saveCalibration = async () => {
    if (!selected) return;
    setCalStatus('saving');
    try {
      await invoke('save_wss_calibration', {
        id: selected.id,
        calibration: JSON.stringify({ ppr: wssCalPpr, circ: wssCalCirc, channels: wssChannels }),
      });
      setCalStatus('saved');
      setTimeout(() => setCalStatus('loaded'), 2500);
    } catch {
      setCalStatus('error');
    }
  };

  const handleSendMessage = (message: string) => serialSendCommand(message);
  // WSS / power / waveform — goes to the signal board in dual-transport mode.
  const handleSignalMessage = (message: string) => signalSend(message);

  /* ── Edit / Add handlers ── */

  const startEdit = () => {
    if (!selected) return;
    setDraft({ ...selected });
    setEditMode('edit');
    setSaveError(null);
  };

  const startAdd = () => {
    setSelected(null);
    setDraft({ manufacturer: '' });
    setEditMode('add');
    setSaveError(null);
  };

  const cancelEdit = () => {
    setEditMode('view');
    setDraft({});
    setSaveError(null);
  };

  const handleSave = async () => {
    const isAdd = editMode === 'add';
    const ref = isAdd ? (draft.reference ?? '').trim() : selected!.reference;
    if (!ref) { setSaveError(t('signal.ref_required')); return; }

    setSaving(true);
    setSaveError(null);
    try {
      // Use null (not undefined) for missing optional fields — Rust serde requires explicit null for Option<T>
      const payload = {
        id:              isAdd ? crypto.randomUUID() : selected!.id,
        reference:       ref,
        manufacturer:    (draft.manufacturer ?? '').trim() || 'Unknown',
        wssType:         draft.wssType?.trim()         || null,
        absAdapter:      draft.absAdapter?.trim()      || null,
        absConnector:    draft.absConnector?.trim()    || null,
        canSpeed:        draft.canSpeed?.trim()        || null,
        canIdLine:       draft.canIdLine?.trim()       || null,
        canByte:         draft.canByte?.trim()         || null,
        canValue:        draft.canValue?.trim()        || null,
        comments:        draft.comments?.trim()        || null,
        testValidated:   draft.testValidated?.trim()   || null,
        otherReferences: draft.otherReferences?.trim() || null,
        kLine:           draft.kLine?.trim()           || null,
        createdAt:       '',
        updatedAt:       '',
      };
      const row = payload as unknown as ABSDataRow;

      if (isAdd) {
        await invoke('save_abs_data', { data: payload });
        setSelected(row);
        setResults(prev => [row, ...prev]);
        setQuery(row.reference);
      } else {
        await invoke('update_abs_data', { data: payload });
        setSelected(row);
        setResults(prev => prev.map(r => r.id === row.id ? row : r));
      }
      setEditMode('view');
      setDraft({});
    } catch (e: any) {
      setSaveError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">

      {/* Header */}
      <motion.div
        className="mb-6"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <h1 className="text-xl font-semibold text-text-primary tracking-tight">
          {t('signal.title')}
        </h1>
        <p className="text-sm text-text-secondary mt-0.5">
          {t('signal.subtitle')}
        </p>
      </motion.div>

      {/* Linked REMAN job — same handoff as the F2-EVO hydraulic bench.
          When a job is attached its article seeds the ABS search above;
          when none is, an inline search lets one be linked from here. */}
      {activeSignalJob ? (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="mb-6 bg-accent/10 border border-accent/20 rounded-xl px-4 py-3 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2 text-sm min-w-0">
            <BriefcaseIcon className="w-4 h-4 shrink-0 text-accent" />
            <span className="font-semibold text-accent shrink-0">{t('signal.linked_job')}</span>
            <span className="text-text-primary truncate">
              {[activeSignalJob.clientName, activeSignalJob.reference].filter(Boolean).join(' · ')}
            </span>
            {[activeSignalJob.codeArt, activeSignalJob.vehiclePlate, activeSignalJob.vehicleModel].filter(Boolean).length > 0 && (
              <span className="text-text-tertiary text-xs truncate hidden sm:inline">
                {[activeSignalJob.codeArt, activeSignalJob.vehiclePlate, activeSignalJob.vehicleModel].filter(Boolean).join(' · ')}
              </span>
            )}
          </div>
          <button
            onClick={() => setActiveSignalJob(null)}
            className="text-xs font-medium text-text-tertiary hover:text-danger transition-colors px-3 py-1.5 rounded-lg border border-border bg-elevated shrink-0"
          >
            {t('signal.unlink_job')}
          </button>
        </motion.div>
      ) : (
        <div className="relative mb-6">
          <input
            type="text"
            value={linkQuery}
            onChange={e => { setLinkQuery(e.target.value); setLinkOpen(true); }}
            onFocus={() => setLinkOpen(true)}
            onBlur={() => setTimeout(() => setLinkOpen(false), 150)}
            placeholder={t('signal.link_job_placeholder')}
            className="w-full text-sm bg-card border border-border rounded-xl px-4 py-2.5 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent/40"
          />
          {linkOpen && linkQuery.trim().length >= 2 && (
            <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-card border border-border rounded-xl shadow-lg">
              {linkSearching && <p className="text-xs text-text-tertiary px-4 py-2">{t('common.loading')}</p>}
              {!linkSearching && linkResults.length === 0 && (
                <p className="text-xs text-text-tertiary px-4 py-2">{t('signal.link_no_matches')}</p>
              )}
              {!linkSearching && linkResults.map(job => (
                <button
                  key={job.id}
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => linkJob(job)}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-elevated transition-colors border-b border-border last:border-0"
                >
                  <span className="text-text-primary font-medium">{job.clientName || `#${job.id}`}</span>
                  <span className="text-text-tertiary ml-2 text-xs">
                    {[job.reference, job.codeArt, job.vehiclePlate, job.vehicleModel].filter(Boolean).join(' · ')}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

        {/* ── Left column ── */}
        <div className="space-y-6">

          {/* ABS Database Search */}
          <motion.div
            custom={0}
            variants={sectionVariants}
            initial="hidden"
            animate="visible"
            className="card"
          >
            {/* Card header row */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-text-primary tracking-tight">{t('signal.db_title')}</h2>
              <button
                onClick={startAdd}
                className="text-[10px] btn-secondary px-2 py-0.5"
              >
                {t('common.add')}
              </button>
            </div>

            {/* Search input */}
            <div className="relative mb-3">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={e => { setQuery(e.target.value); setSelected(null); setEditMode('view'); }}
                placeholder={t('signal.search_placeholder')}
                className="input-field pl-9 pr-9"
              />
              <AnimatePresence>
                {searching && (
                  <motion.div
                    key="spinner"
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.7 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin"
                  />
                )}
              </AnimatePresence>
            </div>

            {/* Results list */}
            <AnimatePresence mode="popLayout">
              {results.length > 0 && (
                <motion.div
                  key="results"
                  className="max-h-48 overflow-y-auto space-y-1 mb-1"
                >
                  {results.map((row, i) => (
                    <motion.button
                      key={row.id}
                      custom={i}
                      variants={resultItemVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      layout
                      onClick={() => { setSelected(row); setEditMode('view'); }}
                      className={[
                        'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors duration-150',
                        selected?.id === row.id
                          ? 'bg-accent/10 ring-1 ring-accent/30 text-accent'
                          : 'bg-elevated hover:bg-text-tertiary/10 text-text-primary',
                      ].join(' ')}
                    >
                      <div className="font-medium text-[13px]">{row.reference}</div>
                      <div className="text-xs text-text-secondary mt-0.5">
                        {row.manufacturer}{row.wssType ? ` · ${row.wssType}` : ''}
                      </div>
                    </motion.button>
                  ))}
                </motion.div>
              )}

              {query.trim() && !searching && results.length === 0 && (
                <motion.p
                  key="no-results"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-xs text-text-tertiary px-1 py-2 text-center"
                >
                  {t('common.no_results')} "{query}"
                </motion.p>
              )}
            </AnimatePresence>

            {/* Selected detail card / Add form */}
            <AnimatePresence mode="wait">
              {(selected || editMode === 'add') && (
                <motion.div
                  key={editMode === 'add' ? '__add__' : selected!.id}
                  initial={{ opacity: 0, y: 6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                  className="mt-3 p-3 bg-elevated rounded-xl border border-border text-xs space-y-1.5"
                >
                  {/* Header */}
                  <div className="font-semibold text-text-primary text-[13px] flex items-center justify-between">
                    {editMode === 'add'
                      ? <span className="text-accent">{t('signal.new_entry')}</span>
                      : <span>{selected!.reference}</span>
                    }

                    {editMode === 'view' ? (
                      <div className="flex items-center gap-2">
                        {selected!.testValidated && (
                          <span className={[
                            'text-[10px] font-medium px-2 py-0.5 rounded-full',
                            selected!.testValidated.toLowerCase() === 'yes'
                              ? 'bg-success/15 text-success'
                              : 'bg-warning/15 text-warning',
                          ].join(' ')}>
                            {selected!.testValidated.toLowerCase() === 'yes' ? t('signal.validated_yes') : t('signal.validated_no')}
                          </span>
                        )}
                        <button
                          onClick={() => setQrOpen(true)}
                          title={t('scan.qr_label')}
                          className="text-[10px] btn-secondary px-1.5 py-0.5 flex items-center"
                        >
                          <QrCodeIcon className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={startEdit} className="text-[10px] btn-secondary px-2 py-0.5">
                          {t('common.edit')}
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-1.5">
                        <button onClick={cancelEdit} className="text-[10px] btn-secondary px-2 py-0.5">
                          {t('common.cancel')}
                        </button>
                        <button
                          onClick={handleSave}
                          disabled={saving}
                          className="text-[10px] btn-primary px-2 py-0.5 disabled:opacity-50"
                        >
                          {saving ? t('signal.saving') : t('common.save')}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* ── VIEW MODE ── */}
                  {editMode === 'view' && selected && (
                    <>
                      {/* Active job link banner */}
                      {currentJob && currentJob.status === 'in_progress' && (
                        <div className="flex items-center justify-between text-[10px] py-1.5 px-2 mb-1 bg-app rounded-lg border border-border">
                          <div className="flex items-center gap-1.5 text-text-tertiary">
                            <BriefcaseIcon className="w-3 h-3 shrink-0" />
                            <span>Job: <span className="font-medium text-text-secondary">{currentJob.jobNumber}</span></span>
                          </div>
                          {currentJob.absRefId !== selected.id ? (
                            <button
                              onClick={() => linkJobToRef(selected.reference, selected.id)}
                              className="text-accent font-semibold hover:underline"
                            >
                              {t('signal.link_to_job')}
                            </button>
                          ) : (
                            <span className="text-success font-semibold">{t('signal.linked')}</span>
                          )}
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        {selected.canSpeed     && <Row label={t('signal.can_speed')}  value={selected.canSpeed} />}
                        {selected.canIdLine    && <Row label={t('signal.can_id')}     value={selected.canIdLine} />}
                        {selected.canByte      && <Row label={t('signal.can_byte')}   value={selected.canByte} />}
                        {selected.canValue     && <Row label={t('signal.can_value')}  value={selected.canValue} />}
                        {selected.absAdapter   && <Row label={t('signal.adapter')}    value={selected.absAdapter} />}
                        {selected.absConnector && <Row label={t('signal.connector')}  value={selected.absConnector} />}
                        {selected.kLine        && <Row label={t('signal.k_line')}     value={selected.kLine} />}
                      </div>

                      {selected.comments && (
                        <p className="text-text-secondary pt-1 border-t border-border">{selected.comments}</p>
                      )}

                      {/* WSS Calibration — legacy mode only */}
                      {legacyMode && (
                        <div className="pt-2 mt-1 border-t border-border space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-text-primary text-[12px]">{t('signal.wss_calibration')}</span>
                            <div className="flex items-center gap-1.5">
                              {calStatus === 'loading'  && <span className="text-[10px] text-text-tertiary animate-pulse">{t('common.loading')}</span>}
                              {calStatus === 'saving'   && <span className="text-[10px] text-text-tertiary animate-pulse">{t('signal.saving')}</span>}
                              {calStatus === 'saved'    && <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/15 text-success border border-success/20">{t('signal.saved')}</span>}
                              {calStatus === 'loaded'   && <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/15 text-success border border-success/20">{t('signal.loaded')}</span>}
                              {calStatus === 'none'     && <span className="text-[10px] text-text-tertiary">{t('signal.not_saved_yet')}</span>}
                              {calStatus === 'error'    && <span className="text-[10px] text-warning">{t('signal.db_offline')}</span>}
                              <button
                                onClick={saveCalibration}
                                disabled={calStatus === 'saving' || calStatus === 'loading' || !wssChannels.some(ch => ch !== null)}
                                className="text-[10px] btn-secondary px-2 py-0.5 disabled:opacity-40"
                              >
                                {t('common.save_to_db')}
                              </button>
                            </div>
                          </div>
                          <div className="grid grid-cols-4 gap-1">
                            {WHEEL_LABELS.map((label, i) => {
                              const ch = wssChannels[i];
                              return (
                                <div key={label} className={[
                                  'rounded-lg px-2 py-1 text-center border',
                                  ch ? 'bg-success/5 border-success/20' : 'bg-app border-border/50 opacity-50',
                                ].join(' ')}>
                                  <div className="text-[10px] font-semibold text-text-secondary">{label}</div>
                                  <div className="font-mono text-[9px] text-text-tertiary truncate">
                                    {ch ? `0x${ch.canId.toString(16).toUpperCase().padStart(3,'0')}[${ch.byteIdx}]` : '—'}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* ── EDIT / ADD FORM ── */}
                  {(editMode === 'edit' || editMode === 'add') && (
                    <div className="space-y-1.5 pt-1">
                      {editMode === 'add' && (
                        <EditField
                          label={t('signal.ref_placeholder')}
                          value={draft.reference ?? ''}
                          onChange={v => setDraft(d => ({ ...d, reference: v }))}
                        />
                      )}
                      <div className="grid grid-cols-2 gap-1.5">
                        <EditField label={t('signal.manufacturer')}  value={draft.manufacturer    ?? ''} onChange={v => setDraft(d => ({ ...d, manufacturer:    v }))} />
                        <EditField label={t('signal.wss_type')}      value={draft.wssType         ?? ''} onChange={v => setDraft(d => ({ ...d, wssType:         v }))} />
                        <EditField label={t('signal.adapter')}       value={draft.absAdapter      ?? ''} onChange={v => setDraft(d => ({ ...d, absAdapter:      v }))} />
                        <EditField label={t('signal.connector')}     value={draft.absConnector    ?? ''} onChange={v => setDraft(d => ({ ...d, absConnector:    v }))} />
                        <EditField label={t('signal.can_speed')}     value={draft.canSpeed        ?? ''} onChange={v => setDraft(d => ({ ...d, canSpeed:        v }))} />
                        <EditField label={t('signal.can_id')}        value={draft.canIdLine       ?? ''} onChange={v => setDraft(d => ({ ...d, canIdLine:       v }))} />
                        <EditField label={t('signal.can_byte')}      value={draft.canByte         ?? ''} onChange={v => setDraft(d => ({ ...d, canByte:         v }))} />
                        <EditField label={t('signal.can_value')}     value={draft.canValue        ?? ''} onChange={v => setDraft(d => ({ ...d, canValue:        v }))} />
                        <EditField label={t('signal.k_line')}        value={draft.kLine           ?? ''} onChange={v => setDraft(d => ({ ...d, kLine:           v }))} />
                        <EditField label={t('signal.validated')}     value={draft.testValidated   ?? ''} onChange={v => setDraft(d => ({ ...d, testValidated:   v }))} placeholder="Yes / No / -" />
                      </div>
                      <EditField
                        label={t('signal.other_refs')}
                        value={draft.otherReferences ?? ''}
                        onChange={v => setDraft(d => ({ ...d, otherReferences: v }))}
                      />
                      <div>
                        <span className="text-text-tertiary block mb-0.5">{t('signal.comments')}</span>
                        <textarea
                          value={draft.comments ?? ''}
                          onChange={e => setDraft(d => ({ ...d, comments: e.target.value }))}
                          rows={3}
                          className="input-field text-[11px] resize-none"
                        />
                      </div>
                      {saveError && (
                        <p className="text-[10px] text-danger pt-0.5">{saveError}</p>
                      )}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Legacy mode keeps the full CAN Settings (speed selector + monitor)
              here; non-legacy gets a compact Power Control, and the passive
              CAN Bus Monitor moves to the right column. */}
          {legacyMode ? (
            <motion.div custom={1} variants={sectionVariants} initial="hidden" animate="visible">
              <CANSettings
                result={canData}
                isConnected={isConnected}
                sendMessage={handleSendMessage}
                canReceivedData={canReceivedData}
                legacyMode
              />
            </motion.div>
          ) : (
            <motion.div custom={1} variants={sectionVariants} initial="hidden" animate="visible">
              <PowerIndicators sendMessage={handleSignalMessage} isConnected={signalConnected} />
            </motion.div>
          )}
        </div>

        {/* ── Right column ── */}
        <div className="space-y-6">
          {legacyMode ? (
            <>
              <motion.div custom={1} variants={sectionVariants} initial="hidden" animate="visible">
                <LegacySignalPanel sendMessage={handleSignalMessage} isConnected={signalConnected} />
              </motion.div>
              <motion.div custom={2} variants={sectionVariants} initial="hidden" animate="visible">
                <CANAnalyzer result={canData} />
              </motion.div>
            </>
          ) : (
            <motion.div custom={1} variants={sectionVariants} initial="hidden" animate="visible">
              <CANSettings
                result={canData}
                isConnected={isConnected}
                sendMessage={handleSendMessage}
                canReceivedData={canReceivedData}
                monitorOnly
              />
            </motion.div>
          )}
        </div>
      </div>

      {/* Diagnostics — full width: DTC read/clear, ECU ident, active tests, bus recorder */}
      <motion.div custom={3} variants={sectionVariants} initial="hidden" animate="visible" className="mt-6">
        <Diagnostics sendMessage={handleSendMessage} isConnected={isConnected} absReference={selected?.reference} />
      </motion.div>

      {/* Signal Tester — full width, normal mode only */}
      {!legacyMode && (
        <motion.div custom={4} variants={sectionVariants} initial="hidden" animate="visible" className="mt-6">
          <SignalTester sendMessage={handleSignalMessage} isConnected={signalConnected} />
        </motion.div>
      )}

      {/* Test Report — ECU / Hydraulic / Full, generated from here */}
      <motion.div custom={5} variants={sectionVariants} initial="hidden" animate="visible" className="mt-6">
        <TestReportCard
          jobLabel={activeSignalJob ? `${activeSignalJob.clientName} (${activeSignalJob.reference})` : undefined}
          jobNumber={activeSignalJob?.reference || undefined}
          ligcdeId={activeSignalJob?.ligcdeId}
          canBitrate={selected?.canSpeed || undefined}
        />
      </motion.div>

      {selected && (
        <ScanModal
          open={qrOpen}
          onClose={() => setQrOpen(false)}
          entity="abs"
          entityKey={selected.reference}
          title={selected.reference}
          subtitleLines={[selected.manufacturer, selected.wssType || ''].filter(Boolean)}
        />
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-text-tertiary">{label}: </span>
      <span className="text-text-primary font-medium">{value}</span>
    </div>
  );
}

function EditField({
  label, value, onChange, placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <span className="text-text-tertiary block mb-0.5">{label}</span>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="input-field py-1 text-[11px]"
      />
    </div>
  );
}

// Ordered most-specific first. First match wins.
const CAN_SPEED_PATTERNS: [RegExp, number][] = [
  [/\b1\s*m(bps?)?\b|1000\s*k(bps?)?/i, 1000],
  [/\b500\s*k?(bps?)?\b/i,               500],
  [/\b250\s*k?(bps?)?\b/i,               250],
];

const SENSOR_TYPE_PATTERNS: [RegExp, number][] = [
  [/passive|df[-_\s]?6|sine/i,       2],
  [/active|df[-_\s]?11|1\.5\s*k/i,  1],
];

function parseDbCanSpeed(s: string | undefined): number | null {
  if (!s) return null;
  for (const [re, speed] of CAN_SPEED_PATTERNS) {
    if (re.test(s)) return speed;
  }
  return null;
}

function parseDbSensorType(s: string | undefined): number | null {
  if (!s) return null;
  for (const [re, type] of SENSOR_TYPE_PATTERNS) {
    if (re.test(s)) return type;
  }
  return null;
}

