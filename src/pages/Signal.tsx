import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { motion, AnimatePresence } from 'framer-motion';
import { MagnifyingGlassIcon, BriefcaseIcon } from '@heroicons/react/24/outline';
import SignalTester from '@/components/SignalTester/SignalTesterMain';
import LegacySignalPanel from '@/components/LegacySignalPanel';
import CANSettings from '@/components/CANSettings';
import CANAnalyzer from '@/components/CANAnalyzer';
import DTCScanner from '@/components/DTCScanner';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import type { WSSChannels } from '@/contexts/AppSettingsContext';
import { WHEEL_LABELS } from '@/contexts/AppSettingsContext';
import BenchPower from '@/components/BenchPower';
import PowerIndicators from '@/components/PowerIndicators';
import { useWebSocketContext } from '@/contexts/WebSocketContext';
import { useClientSerialConnection } from '@/hooks/useClientSerialConnection';
import { useSession } from '@/contexts/SessionContext';
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
  const { sendMessage: wsSendMessage, isConnectedToDevice } = useWebSocketContext();
  const { isConnected: serialConnected, sendCommand: serialSendCommand } = useClientSerialConnection();
  const isConnected = isConnectedToDevice || serialConnected;
  const { currentJob, linkJobToRef } = useSession();
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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      if (isConnected) handleSendMessage(`CANSpeed : ${canSpeedCmd}\n`);
    }

    //wait 300ms before sending waveform command
    waitfor(300);

    const sensorType = parseDbSensorType(selected.wssType);
    if (sensorType !== null) {
      setLegacySensorType(sensorType);
      if (isConnected) {
        const msg = sensorType === 0
          ? `Waveform : 0,0\n`
          : `Waveform : ${sensorType},${legacyFreq}\n`;
        waveformTimer = setTimeout(() => handleSendMessage(msg), 300);
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
  }, [selected?.id, legacyMode]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleSendMessage = async (message: string): Promise<boolean | void> => {
    if (serialConnected) return serialSendCommand(message);
    return wsSendMessage({ type: 1, data: message, timestamp: Date.now() });
  };

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

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

          {/* CAN Settings */}
          <motion.div custom={1} variants={sectionVariants} initial="hidden" animate="visible">
            <CANSettings
              result={canData}
              isConnected={isConnected}
              sendMessage={handleSendMessage}
              canReceivedData={canReceivedData}
              legacyMode={legacyMode}
            />
          </motion.div>

          {/* DTC Scanner */}
          <motion.div custom={2} variants={sectionVariants} initial="hidden" animate="visible">
            <DTCScanner sendMessage={handleSendMessage} isConnected={isConnected} absReference={selected?.reference} />
          </motion.div>
        </div>

        {/* ── Right column ── */}
        <div className="space-y-6">
          {legacyMode ? (
            <>
              <motion.div custom={1} variants={sectionVariants} initial="hidden" animate="visible">
                <LegacySignalPanel sendMessage={handleSendMessage} isConnected={isConnected} />
              </motion.div>
              <motion.div custom={2} variants={sectionVariants} initial="hidden" animate="visible">
                <CANAnalyzer result={canData} />
              </motion.div>
            </>
          ) : (
            <>
              <motion.div custom={1} variants={sectionVariants} initial="hidden" animate="visible">
                <PowerIndicators sendMessage={handleSendMessage} />
              </motion.div>
              <motion.div custom={2} variants={sectionVariants} initial="hidden" animate="visible">
                <BenchPower sendMessage={handleSendMessage} />
              </motion.div>
            </>
          )}
        </div>
      </div>

      {/* Signal Tester — full width, normal mode only */}
      {!legacyMode && (
        <motion.div custom={4} variants={sectionVariants} initial="hidden" animate="visible" className="mt-6">
          <SignalTester sendMessage={handleSendMessage} />
        </motion.div>
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

function parseDbCanSpeed(s: string | undefined): number | null {
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower.includes('1m') || lower.includes('1000') || lower.includes('1 m')) return 1000;
  if (lower.includes('500')) return 500;
  if (lower.includes('250')) return 250;
  return null;
}

function parseDbSensorType(s: string | undefined): number | null {
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower.includes('passive') || lower.includes('df6') || lower.includes('sine')) return 2;
  if (lower.includes('active') || lower.includes('df11') || lower.includes('1.5')) return 1;
  return null;
}

function waitfor(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise(resolve => setTimeout(resolve, ms));
}

