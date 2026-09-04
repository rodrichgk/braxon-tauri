import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  DocumentChartBarIcon, DocumentArrowDownIcon, CpuChipIcon, BeakerIcon, Square3Stack3DIcon,
  CheckCircleIcon, ExclamationTriangleIcon, XCircleIcon, BookmarkIcon,
} from '@heroicons/react/24/outline';
import { useReports } from '@/contexts/ReportsContext';
import EcuTestReport from './EcuTestReport';
import {
  computeEcuVerdict, ecuReasonSummary, ecuReportHasData, activeDtcCount, peakCurrent,
  type EcuReportDraft, type Verdict,
} from '@/lib/ecuReport';
import { computeVerdict, reportHasData, type ParsedReport } from '@/lib/hydraulicReport';
import { generateHydraulicReportPdf, generateCombinedReportPdf } from '@/lib/combinedReport';

type Mode = 'ecu' | 'hydraulic' | 'combined';

interface Props {
  jobLabel?: string;
  jobNumber?: string;
  /** LigCde id of the linked REMAN job — enables Save to job. */
  ligcdeId?: string;
  /** CAN bus speed label from the selected ABS reference, e.g. "500 kbit/s". */
  canBitrate?: string;
}

const VERDICT_ICON: Record<Verdict, JSX.Element> = {
  pass: <CheckCircleIcon className="w-4 h-4" />,
  review: <ExclamationTriangleIcon className="w-4 h-4" />,
  fail: <XCircleIcon className="w-4 h-4" />,
};
const VERDICT_CLASS: Record<Verdict, string> = {
  pass: 'bg-success/10 text-success border-success/20',
  review: 'bg-warning/10 text-warning border-warning/20',
  fail: 'bg-danger/10 text-danger border-danger/20',
};

function fmt(v: number | null | undefined, unit: string) {
  return v == null ? '—' : `${v}${unit}`;
}

// ── plain-text bodies for the per-job Postgres save ──────────
function ecuReportText(d: EcuReportDraft, verdictLabel: string): string {
  const L: string[] = [];
  L.push(`=== ECU TEST REPORT ===`);
  L.push(`Verdict: ${verdictLabel}`);
  L.push(`Reason:  ${ecuReasonSummary(d)}`);
  L.push('');
  L.push(`-- Identification --`);
  L.push(`ABS ref:      ${d.ident.absRef ?? '-'}`);
  L.push(`Manufacturer: ${d.ident.manufacturer ?? '-'}`);
  L.push(`WSS type:     ${d.ident.wssType ?? '-'}`);
  L.push(`Brand:        ${d.ident.brand ?? '-'}`);
  L.push(`ECU model:    ${d.ident.ecuName ?? '(not identified)'}`);
  L.push(`HW family:    ${d.ident.hardwareFamily ?? '-'}`);
  L.push(`Protocol:     ${d.ident.protocol ?? '-'}`);
  L.push(`Addressing:   ${d.ident.sendId ? `${d.ident.sendId} -> ${d.ident.recvId ?? '?'}` : '-'}`);
  if (d.ident.supplier || d.ident.version || d.ident.soft) {
    L.push(`ECU ident:    sup ${d.ident.supplier ?? '-'} · ver ${d.ident.version ?? '-'} · soft ${d.ident.soft ?? '-'}`);
  }
  L.push('');
  L.push(`-- CAN communication --`);
  if (d.can) {
    L.push(d.can.seen ? `Bus traffic seen: ${d.can.frameCount} frames on ${d.can.uniqueIds} IDs` : `No CAN traffic seen`);
    if (d.can.bitrate) L.push(`Bitrate: ${d.can.bitrate}`);
    (d.can.topIds ?? []).forEach(x => L.push(`  0x${x.id.toString(16).toUpperCase().padStart(3, '0')} x${x.count}${x.hint ? ` (${x.hint})` : ''}`));
  } else {
    L.push(`(not captured)`);
  }
  L.push('');
  L.push(`-- Fault codes --`);
  if (!d.dtc) {
    L.push(`(no scan)`);
  } else {
    const active = d.dtc.codes.filter(c => c.udsStatus === undefined || (c.udsStatus & 0x09) !== 0);
    if (active.length === 0) L.push(d.dtc.gotPositive ? `No stored faults` : `Inconclusive response`);
    active.forEach(c => L.push(`  ${c.code}  ${c.description}${c.udsStatus !== undefined ? `  [0x${c.udsStatus.toString(16).toUpperCase().padStart(2, '0')}]` : ''}`));
    L.push(`  (${d.dtc.brand} · ${d.dtc.protocol} · ${new Date(d.dtc.timestamp).toLocaleString()})`);
  }
  L.push('');
  L.push(`-- Wheel speed readback vs current --`);
  L.push(`speed  FL     FR     RL     RR     current`);
  d.curve.forEach(p => L.push(
    `${String(p.speedKmh).padStart(4)}  ${fmtCol(p.fl)} ${fmtCol(p.fr)} ${fmtCol(p.rl)} ${fmtCol(p.rr)}  ${p.currentA != null ? `${p.currentA} A` : '-'}`,
  ));
  L.push('');
  L.push(`-- Motor current & supply --`);
  L.push(`Current peak:  ${fmt(peakCurrent(d), ' A')}`);
  L.push(`Current idle:  ${fmt(d.manual.currentIdleA, ' A')}`);
  L.push(`Supply:        ${fmt(d.manual.voltageV, ' V')}`);
  L.push(`Spec:          max ${fmt(d.manual.currentSpecMaxA, ' A')} · min ${fmt(d.manual.currentSpecMinA, ' A')} · Vmin ${fmt(d.manual.voltageSpecMinV, ' V')}`);
  if (d.manual.injectedMa) L.push(`Injected WSS:  ${d.manual.injectedMa}`);
  if (d.manual.notes) { L.push(''); L.push(`-- Notes --`); L.push(d.manual.notes); }
  return L.join('\n');
}

function fmtCol(v: number | null): string {
  return (v == null ? '-' : v.toFixed(1)).padStart(6);
}

function combinedReportText(d: EcuReportDraft, parsed: ParsedReport | null, verdictLabel: string): string {
  const parts = [ecuReportText(d, verdictLabel)];
  parts.push('');
  parts.push(`=== HYDRAULIC TEST (snapshot) ===`);
  if (reportHasData(parsed)) {
    const v = computeVerdict(parsed);
    parts.push(`Verdict: ${v ?? '-'}`);
    parsed.valves.forEach(vl => parts.push(`  ${vl.label} — ${vl.status}`));
    if (parsed.motor) parts.push(`  Motor: ${parsed.motor.status} · ${parsed.motor.current_amps ?? '-'} A`);
    if (parsed.pressure) {
      parsed.pressure.cycles.forEach(c => parts.push(
        `  ${String(c.label).split(':')[0].trim()}: ${c.passed ? 'OK' : 'FAIL'}` +
        ` [${c.channel_pressures.map(p => (p != null ? p.toFixed(1) : '-')).join('/')}] pump ${c.pump_pressure ?? '-'}`,
      ));
    }
  } else {
    parts.push('(no hydraulic report captured on the F2-EVO bench this session)');
  }
  return parts.join('\n');
}

export default function TestReportCard({ jobLabel, jobNumber, ligcdeId, canBitrate }: Props) {
  const { t } = useTranslation();
  const { signalDraft, hydraulicSnapshot, setCanBitrate } = useReports();
  const [mode, setMode] = useState<Mode>('ecu');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setCanBitrate(canBitrate); }, [canBitrate, setCanBitrate]);

  const ecuVerdict = ecuReportHasData(signalDraft) ? computeEcuVerdict(signalDraft) : null;
  const hydParsed = hydraulicSnapshot?.parsed ?? null;
  const hydVerdict = reportHasData(hydParsed) ? computeVerdict(hydParsed) : null;

  const verdictLabel = (v: Verdict | null) => (v ? t(`signal.report_verdict_${v}`) : t('signal.report_combined_na'));

  const saveToJob = async (reportType: string, text: string) => {
    if (!ligcdeId) return;
    setSaving(true);
    try {
      const header = [
        `Client: ${jobLabel ?? '-'}`,
        `Job Ref: ${jobNumber ?? '-'}`,
        `Saved: ${new Date().toLocaleString()}`,
        '='.repeat(40),
        '',
      ].join('\n');
      await invoke('reman_save_ecu_report', { ligcdeId, reportType, reportText: header + text });
      toast.success(t('signal.report_save_ok'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const MODES: { id: Mode; label: string; icon: JSX.Element }[] = [
    { id: 'ecu', label: t('signal.report_mode_ecu'), icon: <CpuChipIcon className="w-3.5 h-3.5" /> },
    { id: 'hydraulic', label: t('signal.report_mode_hydraulic'), icon: <BeakerIcon className="w-3.5 h-3.5" /> },
    { id: 'combined', label: t('signal.report_mode_combined'), icon: <Square3Stack3DIcon className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="card w-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
          <DocumentChartBarIcon className="w-4 h-4 text-text-tertiary" />
          {t('signal.report_card_title')}
        </h2>
        <div className="flex gap-0.5 p-0.5 bg-app rounded-lg">
          {MODES.map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={[
                'flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors',
                mode === m.id ? 'bg-elevated text-text-primary shadow-sm' : 'text-text-tertiary hover:text-text-secondary',
              ].join(' ')}
            >
              {m.icon}{m.label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'ecu' && (
        <EcuTestReport
          jobLabel={jobLabel}
          jobNumber={jobNumber}
          onSave={ligcdeId ? (type) => saveToJob(type, ecuReportText(signalDraft, verdictLabel(ecuVerdict))) : undefined}
        />
      )}

      {mode === 'hydraulic' && (
        <div className="space-y-4">
          {hydVerdict ? (
            <div className={['flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold', VERDICT_CLASS[hydVerdict]].join(' ')}>
              {VERDICT_ICON[hydVerdict]}
              {verdictLabel(hydVerdict)}
              <span className="ml-auto text-[10px] font-normal opacity-70">
                {hydraulicSnapshot ? new Date(hydraulicSnapshot.updatedAt).toLocaleString() : ''}
              </span>
            </div>
          ) : (
            <p className="text-xs text-text-tertiary py-4 text-center">{t('signal.report_hyd_empty')}</p>
          )}
          {reportHasData(hydParsed) && (
            <div className="text-[11px] text-text-secondary grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              <span>{t('f2evo.report_valves_title')}: {hydParsed!.valves.length}</span>
              {hydParsed!.motor && <span>{t('f2evo.report_motor_title')}: {hydParsed!.motor.current_amps ?? '—'} A</span>}
              {hydParsed!.pressure && <span>{t('f2evo.report_pressure_title')}: {hydParsed!.pressure.cycles.length} {t('signal.report_hyd_cycles')}</span>}
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={() => generateHydraulicReportPdf({ hydraulic: hydParsed, jobLabel, jobNumber, t })}
              disabled={!reportHasData(hydParsed)}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-elevated border border-border text-text-secondary hover:text-text-primary hover:border-accent/30 transition-colors disabled:opacity-40"
            >
              <DocumentArrowDownIcon className="w-3.5 h-3.5" />
              {t('signal.report_generate_pdf')}
            </button>
            <p className="text-[10px] text-text-tertiary">{t('signal.report_hyd_note')}</p>
          </div>
        </div>
      )}

      {mode === 'combined' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <div className={['flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold', ecuVerdict ? VERDICT_CLASS[ecuVerdict] : 'bg-elevated text-text-tertiary border-border'].join(' ')}>
              <CpuChipIcon className="w-4 h-4" />{t('signal.report_combined_ecu')}: {verdictLabel(ecuVerdict)}
            </div>
            <div className={['flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold', hydVerdict ? VERDICT_CLASS[hydVerdict] : 'bg-elevated text-text-tertiary border-border'].join(' ')}>
              <BeakerIcon className="w-4 h-4" />{t('signal.report_combined_hydraulic')}: {verdictLabel(hydVerdict)}
            </div>
          </div>
          {!ecuReportHasData(signalDraft) && (
            <p className="text-[11px] text-warning">{t('signal.report_combined_need_ecu')}</p>
          )}
          {!reportHasData(hydParsed) && (
            <p className="text-[11px] text-text-tertiary">{t('signal.report_combined_no_hyd')}</p>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={() => generateCombinedReportPdf({ ecu: signalDraft, hydraulic: hydParsed, jobLabel, jobNumber, t })}
              disabled={!ecuReportHasData(signalDraft) && !reportHasData(hydParsed)}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-accent/10 border border-accent/20 text-accent hover:bg-accent hover:text-white transition-colors disabled:opacity-40"
            >
              <DocumentArrowDownIcon className="w-3.5 h-3.5" />
              {t('signal.report_generate_full')}
            </button>
            {ligcdeId && (
              <button
                onClick={() => saveToJob('combined', combinedReportText(signalDraft, hydParsed, verdictLabel(ecuVerdict)))}
                disabled={saving}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-accent/30 text-accent hover:bg-accent/10 transition-colors disabled:opacity-50"
              >
                <BookmarkIcon className="w-3.5 h-3.5" />
                {saving ? t('signal.saving') : t('signal.report_save_to_job')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* quick capture status line */}
      <div className="mt-4 pt-3 border-t border-border flex items-center gap-x-4 gap-y-1 flex-wrap text-[10px] text-text-tertiary">
        <span>{t('signal.report_status_ident')}: {signalDraft.ident.ecuName || signalDraft.ident.absRef || '—'}</span>
        <span>{t('signal.report_status_can')}: {signalDraft.can?.seen ? t('signal.report_status_yes') : t('signal.report_status_no')}</span>
        <span>{t('signal.report_status_dtc')}: {signalDraft.dtc ? activeDtcCount(signalDraft.dtc) : '—'}</span>
        <span>{t('signal.report_status_curve')}: {signalDraft.curve.length}</span>
      </div>
    </div>
  );
}
