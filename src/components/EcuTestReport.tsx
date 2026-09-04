import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DocumentArrowDownIcon, CheckCircleIcon, ExclamationTriangleIcon, XCircleIcon,
  SignalIcon, BugAntIcon, BoltIcon, PlusIcon, TrashIcon, CpuChipIcon,
} from '@heroicons/react/24/outline';
import {
  type EcuReportDraft, type WheelCurvePoint, type Verdict,
  computeEcuVerdict, ecuReasonSummary, ecuReportHasData, activeDtcCount, curveIssues, peakCurrent,
} from '@/lib/ecuReport';
import { useReports } from '@/contexts/ReportsContext';
import {
  createReportDoc, drawHeader, drawTitleBlock, drawJobRow, drawFooter,
  sectionHeading, drawStatTiles, drawTable, drawLineChart, drawParagraph,
  COLOR, X0, CONTENT_W, type ReportDoc, type Pill,
} from '@/lib/pdfReport';

const STANDARD_SPEEDS = [0, 5, 20, 50, 80, 120];
const WHEELS = ['fl', 'fr', 'rl', 'rr'] as const;
const WHEEL_LABELS = ['FL', 'FR', 'RL', 'RR'] as const;
const WHEEL_COLORS: Record<string, [number, number, number]> = {
  FL: [10, 132, 255], FR: [48, 209, 88], RL: [175, 82, 222], RR: [255, 159, 10],
};

const verdictStyleClass: Record<Verdict, string> = {
  pass: 'bg-success/10 text-success border-success/20',
  review: 'bg-warning/10 text-warning border-warning/20',
  fail: 'bg-danger/10 text-danger border-danger/20',
};

const DTC_TYPE_STYLE: Record<string, string> = {
  P: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/25',
  C: 'text-red-400 bg-red-400/10 border-red-400/25',
  B: 'text-blue-400 bg-blue-400/10 border-blue-400/25',
  U: 'text-purple-400 bg-purple-400/10 border-purple-400/25',
};

interface Props {
  jobLabel?: string;
  jobNumber?: string;
  onClose?: () => void;
  /** Present only when a REMAN job is linked — Save Before/After/Passed. */
  onSave?: (reportType: string) => void;
}

const SAVE_TYPES = [
  { type: 'before_repair', key: 'reman.ecu_report_before_repair', accent: false },
  { type: 'after_repair', key: 'reman.ecu_report_after_repair', accent: false },
  { type: 'passed', key: 'reman.ecu_report_passed', accent: true },
];

export default function EcuTestReport({ jobLabel, jobNumber, onClose, onSave }: Props) {
  const { t } = useTranslation();
  const { signalDraft: draft, patchManual, setCurve, resetCanActivity, resetSignalDraft } = useReports();

  const verdict = useMemo(() => computeEcuVerdict(draft), [draft]);
  const reason = useMemo(() => ecuReasonSummary(draft), [draft]);
  const hasData = ecuReportHasData(draft);
  const issues = useMemo(() => curveIssues(draft.curve), [draft.curve]);
  const faultCount = activeDtcCount(draft.dtc);
  const peak = peakCurrent(draft);

  const verdictMeta: Record<Verdict, { icon: JSX.Element; label: string }> = {
    pass: { icon: <CheckCircleIcon className="w-5 h-5" />, label: t('signal.report_verdict_pass') },
    review: { icon: <ExclamationTriangleIcon className="w-5 h-5" />, label: t('signal.report_verdict_review') },
    fail: { icon: <XCircleIcon className="w-5 h-5" />, label: t('signal.report_verdict_fail') },
  };

  // ── curve table helpers ────────────────────────────────────
  const setPoint = (i: number, patch: Partial<WheelCurvePoint>) =>
    setCurve(draft.curve.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  const addRow = () =>
    setCurve([...draft.curve, { speedKmh: 0, fl: null, fr: null, rl: null, rr: null, currentA: null }]);
  const removeRow = (i: number) => setCurve(draft.curve.filter((_, idx) => idx !== i));
  const seedSpeeds = () =>
    setCurve(STANDARD_SPEEDS.map(s => ({ speedKmh: s, fl: null, fr: null, rl: null, rr: null, currentA: null })));

  const num = (v: number | null | undefined) => (v == null ? '' : String(v));
  const parseNum = (s: string): number | null => {
    const v = parseFloat(s);
    return s.trim() === '' || Number.isNaN(v) ? null : v;
  };

  // ── PDF ────────────────────────────────────────────────────
  const generatePdf = () => {
    if (!hasData) return;
    const rd = createReportDoc();
    drawHeader(rd, 'ABS ECU Diagnostics');
    let y = drawTitleBlock(rd, {
      title: t('signal.report_title'),
      verdict,
      verdictLabel: verdict ? verdictMeta[verdict].label : undefined,
      reason,
    });
    y = drawJobRow(rd, y, jobLabel, jobNumber);
    y = drawEcuBody(rd, y, draft, t);
    drawFooter(rd, 'BRAXON — ECU Test Report');

    const word = verdict ? verdict.toUpperCase() : 'REPORT';
    const base = jobNumber ? `${jobNumber}-ECU-${word}` : `ecu-report-${new Date().toISOString().slice(0, 10)}-${word}`;
    rd.doc.save(`${base}.pdf`);
  };

  // ── render ─────────────────────────────────────────────────
  return (
    <div className="card w-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
          <CpuChipIcon className="w-4 h-4 text-text-tertiary" />
          {t('signal.report_title')}
        </h2>
        <div className="flex items-center gap-2">
          {hasData && (
            <button
              onClick={generatePdf}
              className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-elevated border border-border text-text-secondary hover:text-text-primary hover:border-accent/30 transition-colors"
            >
              <DocumentArrowDownIcon className="w-3.5 h-3.5" />
              {t('signal.report_generate_pdf')}
            </button>
          )}
          <button onClick={resetSignalDraft} className="text-xs btn-secondary px-2.5 py-1.5">
            {t('signal.report_reset')}
          </button>
          {onClose && (
            <button onClick={onClose} className="text-xs btn-secondary px-2.5 py-1.5">
              {t('signal.report_close')}
            </button>
          )}
        </div>
      </div>

      {onSave && (
        <div className="flex items-center gap-1.5 mb-4 pb-4 border-b border-border">
          {SAVE_TYPES.map(s => (
            <button
              key={s.type}
              onClick={() => onSave(s.type)}
              className={[
                'text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors',
                s.accent
                  ? 'bg-accent/10 border-accent/20 text-accent hover:bg-accent hover:text-white'
                  : 'bg-elevated border-border text-text-secondary hover:text-text-primary hover:border-accent/30',
              ].join(' ')}
            >
              {t(s.key)}
            </button>
          ))}
        </div>
      )}

      {!hasData ? (
        <p className="text-xs text-text-tertiary py-6 text-center">{t('signal.report_empty')}</p>
      ) : (
        <div className="space-y-5">
          {/* Verdict */}
          {verdict && (
            <div className={['px-3 py-2 rounded-lg border', verdictStyleClass[verdict]].join(' ')}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {verdictMeta[verdict].icon}
                  <span className="text-sm font-bold tracking-wide">{verdictMeta[verdict].label}</span>
                </div>
                <div className="flex items-center gap-0.5">
                  {(['pass', 'review', 'fail'] as Verdict[]).map(v => (
                    <button
                      key={v}
                      onClick={() => patchManual({ verdictOverride: draft.manual.verdictOverride === v ? null : v })}
                      className={[
                        'text-[10px] font-semibold px-1.5 py-0.5 rounded transition-colors',
                        draft.manual.verdictOverride === v ? 'bg-text-primary/15' : 'opacity-50 hover:opacity-100',
                      ].join(' ')}
                    >
                      {verdictMeta[v].label}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[11px] mt-1 opacity-80">{reason}</p>
              {draft.manual.verdictOverride && (
                <p className="text-[10px] mt-0.5 opacity-70">{t('signal.report_verdict_manual')}</p>
              )}
            </div>
          )}

          {/* Identification */}
          <Section title={t('signal.report_ident_title')} icon={<CpuChipIcon className="w-3.5 h-3.5" />}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-[11px]">
              <KV label={t('signal.report_abs_ref')} value={draft.ident.absRef} mono />
              <KV label={t('signal.manufacturer')} value={draft.ident.manufacturer} />
              <KV label={t('signal.wss_type')} value={draft.ident.wssType} />
              <KV label={t('signal.report_brand')} value={draft.ident.brand} />
              <KV label={t('signal.report_ecu_model')} value={draft.ident.ecuName} />
              <KV label={t('signal.report_hw_family')} value={draft.ident.hardwareFamily} />
              <KV label={t('signal.report_protocol')} value={draft.ident.protocol} />
              <KV
                label={t('signal.report_addressing')}
                value={draft.ident.sendId ? `${draft.ident.sendId.toUpperCase()} → ${(draft.ident.recvId || '—').toUpperCase()}` : undefined}
                mono
              />
              {(draft.ident.supplier || draft.ident.version || draft.ident.soft) && (
                <KV
                  label={t('signal.report_ecu_ident')}
                  value={[
                    draft.ident.supplier && `sup ${draft.ident.supplier}`,
                    draft.ident.version && `ver ${draft.ident.version}`,
                    draft.ident.soft && `soft ${draft.ident.soft}`,
                  ].filter(Boolean).join(' · ')}
                  mono
                />
              )}
            </div>
          </Section>

          {/* CAN communication */}
          <Section
            title={t('signal.report_can_title')}
            icon={<SignalIcon className="w-3.5 h-3.5" />}
            action={
              <button onClick={resetCanActivity} className="text-[10px] text-text-tertiary hover:text-text-secondary underline">
                {t('signal.report_can_reset')}
              </button>
            }
          >
            {draft.can ? (
              <div className="space-y-2">
                <div className={[
                  'flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold',
                  draft.can.seen ? 'bg-success/10 text-success border-success/20' : 'bg-warning/10 text-warning border-warning/20',
                ].join(' ')}>
                  {draft.can.seen ? <CheckCircleIcon className="w-4 h-4" /> : <ExclamationTriangleIcon className="w-4 h-4" />}
                  {draft.can.seen
                    ? t('signal.report_can_seen', { frames: draft.can.frameCount, ids: draft.can.uniqueIds })
                    : t('signal.report_can_none')}
                  {draft.can.bitrate && <span className="ml-auto font-normal opacity-70">{draft.can.bitrate}</span>}
                </div>
                {draft.can.topIds && draft.can.topIds.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {draft.can.topIds.map(x => (
                      <div key={x.id} className="text-[10px] px-2 py-1 rounded-lg bg-elevated border border-border">
                        <span className="font-mono font-semibold text-text-primary">0x{x.id.toString(16).toUpperCase().padStart(3, '0')}</span>
                        <span className="text-text-tertiary"> ×{x.count}</span>
                        {x.hint && <div className="text-text-tertiary/70 truncate">{x.hint}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-text-tertiary">{t('signal.report_can_waiting')}</p>
            )}
          </Section>

          {/* Fault codes */}
          <Section title={t('signal.report_dtc_title')} icon={<BugAntIcon className="w-3.5 h-3.5" />}>
            {!draft.dtc ? (
              <p className="text-[11px] text-text-tertiary">{t('signal.report_dtc_none_yet')}</p>
            ) : faultCount === 0 ? (
              <div className="flex items-center gap-2 text-[12px] text-success">
                <CheckCircleIcon className="w-4 h-4" />
                {draft.dtc.gotPositive ? t('signal.report_dtc_clean') : t('signal.report_dtc_inconclusive')}
              </div>
            ) : (
              <div className="space-y-1.5">
                {draft.dtc.codes
                  .filter(c => c.udsStatus === undefined || (c.udsStatus & 0x09) !== 0)
                  .map((c, i) => (
                    <div key={i} className="flex items-start gap-2.5 p-2 bg-elevated rounded-lg border border-border">
                      <span className={[
                        'font-mono text-[11px] font-bold px-1.5 py-0.5 rounded border shrink-0',
                        DTC_TYPE_STYLE[c.code[0]] ?? 'text-text-secondary bg-elevated border-border',
                      ].join(' ')}>
                        {c.code}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] text-text-primary leading-tight">{c.description}</p>
                        {c.udsStatus !== undefined && (
                          <p className="text-[10px] text-text-tertiary font-mono mt-0.5">
                            0x{c.udsStatus.toString(16).toUpperCase().padStart(2, '0')}
                            {(c.udsStatus & 0x01) ? ' · failed now' : ''}
                            {(c.udsStatus & 0x08) ? ' · confirmed' : ''}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </Section>

          {/* Wheel speed vs current */}
          <Section
            title={t('signal.report_curve_title')}
            icon={<BoltIcon className="w-3.5 h-3.5" />}
            action={
              <div className="flex items-center gap-1.5">
                <button onClick={seedSpeeds} className="text-[10px] btn-secondary px-2 py-0.5">{t('signal.report_curve_seed')}</button>
                <button onClick={addRow} className="text-[10px] btn-secondary px-2 py-0.5 flex items-center gap-1">
                  <PlusIcon className="w-3 h-3" />{t('common.add')}
                </button>
              </div>
            }
          >
            <p className="text-[10px] text-text-tertiary mb-2">{t('signal.report_curve_hint')}</p>
            {draft.curve.length === 0 ? (
              <p className="text-[11px] text-text-tertiary">{t('signal.report_curve_empty')}</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr className="text-text-tertiary">
                        <th className="text-left font-semibold pb-1">{t('signal.report_curve_speed')}</th>
                        {WHEEL_LABELS.map(w => <th key={w} className="text-right font-semibold pb-1 px-1">{w}</th>)}
                        <th className="text-right font-semibold pb-1 px-1">{t('signal.report_curve_current')}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {draft.curve.map((p, i) => {
                        const rowIssue = issues.some(x => x.speedKmh === p.speedKmh);
                        return (
                          <tr key={i} className={rowIssue ? 'bg-warning/5' : ''}>
                            <td className="py-0.5">
                              <input type="number" value={num(p.speedKmh)} onChange={e => setPoint(i, { speedKmh: parseNum(e.target.value) ?? 0 })}
                                className="input-field !py-0.5 !text-[10px] w-16 text-right" />
                            </td>
                            {WHEELS.map(w => (
                              <td key={w} className="py-0.5 px-1">
                                <input type="number" value={num(p[w])} onChange={e => setPoint(i, { [w]: parseNum(e.target.value) } as Partial<WheelCurvePoint>)}
                                  className="input-field !py-0.5 !text-[10px] w-full text-right" />
                              </td>
                            ))}
                            <td className="py-0.5 px-1">
                              <input type="number" value={num(p.currentA)} onChange={e => setPoint(i, { currentA: parseNum(e.target.value) })}
                                className="input-field !py-0.5 !text-[10px] w-full text-right" />
                            </td>
                            <td className="py-0.5 pl-1">
                              <button onClick={() => removeRow(i)} className="text-text-tertiary hover:text-danger">
                                <TrashIcon className="w-3 h-3" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <CurvePreview curve={draft.curve} />
                {issues.length > 0 && (
                  <p className="text-[10px] text-warning mt-1.5">
                    {t('signal.report_curve_issue', {
                      wheels: [...new Set(issues.map(x => x.wheel))].join(', '),
                    })}
                  </p>
                )}
              </>
            )}
          </Section>

          {/* Motor current & supply */}
          <Section title={t('signal.report_current_title')} icon={<BoltIcon className="w-3.5 h-3.5" />}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <NumField label={t('signal.report_current_peak')} unit="A" value={draft.manual.currentPeakA}
                onChange={v => patchManual({ currentPeakA: v })} hint={peak != null ? t('signal.report_current_effective', { v: peak.toFixed(1) }) : undefined} />
              <NumField label={t('signal.report_current_idle')} unit="A" value={draft.manual.currentIdleA} onChange={v => patchManual({ currentIdleA: v })} />
              <NumField label={t('signal.report_voltage')} unit="V" value={draft.manual.voltageV} onChange={v => patchManual({ voltageV: v })} />
              <NumField label={t('signal.report_current_spec_max')} unit="A" value={draft.manual.currentSpecMaxA} onChange={v => patchManual({ currentSpecMaxA: v })} />
              <NumField label={t('signal.report_current_spec_min')} unit="A" value={draft.manual.currentSpecMinA} onChange={v => patchManual({ currentSpecMinA: v })} />
              <NumField label={t('signal.report_voltage_spec_min')} unit="V" value={draft.manual.voltageSpecMinV} onChange={v => patchManual({ voltageSpecMinV: v })} />
            </div>
            <div className="mt-2">
              <span className="text-[10px] text-text-tertiary block mb-0.5">{t('signal.report_injected')}</span>
              <input
                type="text"
                value={draft.manual.injectedMa ?? ''}
                onChange={e => patchManual({ injectedMa: e.target.value })}
                placeholder="DF11 7 / 14 mA · VDA AK 7 / 14 / 28 mA"
                className="input-field py-1 text-[11px]"
              />
            </div>
          </Section>

          {/* Notes */}
          <Section title={t('signal.report_notes_title')}>
            <textarea
              value={draft.manual.notes ?? ''}
              onChange={e => patchManual({ notes: e.target.value })}
              rows={3}
              placeholder={t('signal.report_notes_placeholder')}
              className="input-field text-[11px] resize-none w-full"
            />
          </Section>
        </div>
      )}
    </div>
  );
}

/* ── small on-screen helpers ─────────────────────────────────── */

function Section({ title, icon, action, children }: { title: string; icon?: JSX.Element; action?: JSX.Element; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-text-secondary flex items-center gap-1.5">{icon}{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function KV({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div>
      <span className="text-text-tertiary">{label}: </span>
      <span className={['text-text-primary font-medium', mono ? 'font-mono' : ''].join(' ')}>{value || '—'}</span>
    </div>
  );
}

function NumField({ label, unit, value, onChange, hint }: {
  label: string; unit: string; value: number | null | undefined; onChange: (v: number | null) => void; hint?: string;
}) {
  return (
    <div>
      <span className="text-[10px] text-text-tertiary block mb-0.5">{label}</span>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={value == null ? '' : String(value)}
          onChange={e => { const v = parseFloat(e.target.value); onChange(e.target.value.trim() === '' || Number.isNaN(v) ? null : v); }}
          className="input-field py-1 text-[11px] w-full text-right"
        />
        <span className="text-[10px] text-text-tertiary">{unit}</span>
      </div>
      {hint && <span className="text-[9px] text-text-tertiary/80">{hint}</span>}
    </div>
  );
}

function CurvePreview({ curve }: { curve: WheelCurvePoint[] }) {
  const pts = curve.filter(p => p.speedKmh > 0 || p.currentA != null);
  const speeds = pts.map(p => p.speedKmh);
  const currents = pts.map(p => p.currentA).filter((v): v is number => v != null);
  const wheelVals = pts.flatMap(p => WHEELS.map(w => p[w])).filter((v): v is number => v != null);
  if (pts.length < 2 || (wheelVals.length === 0 && currents.length === 0)) return null;

  const W = 320, H = 120, padL = 26, padR = 26, padT = 8, padB = 18;
  const xMax = Math.max(...speeds, 1);
  const yMax = Math.max(...wheelVals, xMax, 1);
  const cMax = Math.max(...currents, 1);
  const sx = (v: number) => padL + (v / xMax) * (W - padL - padR);
  const sy = (v: number) => H - padB - (v / yMax) * (H - padT - padB);
  const sc = (v: number) => H - padB - (v / cMax) * (H - padT - padB);

  const line = (get: (p: WheelCurvePoint) => number | null, scale: (v: number) => number) => {
    const seg = [...pts].sort((a, b) => a.speedKmh - b.speedKmh)
      .map(p => ({ x: p.speedKmh, y: get(p) }))
      .filter((d): d is { x: number; y: number } => d.y != null);
    if (seg.length < 2) return null;
    return seg.map((d, i) => `${i === 0 ? 'M' : 'L'}${sx(d.x).toFixed(1)},${scale(d.y).toFixed(1)}`).join(' ');
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full mt-2 rounded-lg bg-elevated border border-border text-text-tertiary">
      {[0, 0.5, 1].map(f => (
        <line key={f} x1={padL} x2={W - padR} y1={padT + f * (H - padT - padB)} y2={padT + f * (H - padT - padB)}
          stroke="currentColor" strokeOpacity={0.25} strokeWidth={0.5} />
      ))}
      {WHEEL_LABELS.map((w, i) => {
        const d = line(p => p[WHEELS[i]], sy);
        const [r, g, b] = WHEEL_COLORS[w];
        return d ? <path key={w} d={d} fill="none" stroke={`rgb(${r},${g},${b})`} strokeWidth={1.5} /> : null;
      })}
      {(() => {
        const d = line(p => p.currentA, sc);
        return d ? <path d={d} fill="none" stroke="rgb(255,69,59)" strokeWidth={1.75} strokeDasharray="3 2" /> : null;
      })()}
      <text x={padL} y={H - 4} fill="currentColor" fontSize={8}>0</text>
      <text x={W - padR} y={H - 4} textAnchor="end" fill="currentColor" fontSize={8}>{xMax.toFixed(0)} km/h</text>
      <text x={2} y={padT + 6} fill="currentColor" fontSize={8}>km/h</text>
      <text x={W - 2} y={padT + 6} textAnchor="end" fill="rgb(255,69,59)" fontSize={8}>A</text>
    </svg>
  );
}

/* ── PDF body (shared with the combined report) ──────────────── */

type TFn = (key: string, opts?: Record<string, unknown>) => string;

export function drawEcuBody(rd: ReportDoc, yIn: number, draft: EcuReportDraft, t: TFn): number {
  let y = yIn;
  const faultCount = activeDtcCount(draft.dtc);
  const peak = peakCurrent(draft);
  const issues = curveIssues(draft.curve);

  // ── Identification ──
  y = rd.ensure(y, 40);
  y = sectionHeading(rd, y, t('signal.report_ident_title'));
  y += 2;
  const idTiles: { label: string; value: string; mono?: boolean }[] = [
    { label: t('signal.report_abs_ref'), value: draft.ident.absRef || '—', mono: true },
    { label: t('signal.manufacturer'), value: draft.ident.manufacturer || '—' },
    { label: t('signal.wss_type'), value: draft.ident.wssType || '—' },
    { label: t('signal.report_ecu_model'), value: draft.ident.ecuName || t('signal.report_not_identified') },
    { label: t('signal.report_protocol'), value: draft.ident.protocol || '—' },
    { label: t('signal.report_addressing'), value: draft.ident.sendId ? `${draft.ident.sendId.toUpperCase()}→${(draft.ident.recvId || '?').toUpperCase()}` : '—', mono: true },
  ];
  y = drawStatTiles(rd, y, idTiles, 3);
  if (draft.ident.supplier || draft.ident.version || draft.ident.soft || draft.ident.brand || draft.ident.hardwareFamily) {
    const bits = [
      draft.ident.brand && `${t('signal.report_brand')}: ${draft.ident.brand}`,
      draft.ident.hardwareFamily && `${t('signal.report_hw_family')}: ${draft.ident.hardwareFamily}`,
      draft.ident.supplier && `sup ${draft.ident.supplier}`,
      draft.ident.version && `ver ${draft.ident.version}`,
      draft.ident.soft && `soft ${draft.ident.soft}`,
    ].filter(Boolean).join('    ·    ');
    y = drawParagraph(rd, y + 1, bits, 8);
  }
  y += 5;

  // ── CAN communication ──
  y = rd.ensure(y, 40);
  const canPill: Pill = draft.can?.seen
    ? { text: t('signal.report_can_ok'), bg: COLOR.green, fg: COLOR.white }
    : { text: t('signal.report_can_missing'), bg: COLOR.amber, fg: COLOR.white };
  y = sectionHeading(rd, y, t('signal.report_can_title'), canPill);
  y += 2;
  if (draft.can) {
    y = drawStatTiles(rd, y, [
      { label: t('signal.report_can_frames'), value: String(draft.can.frameCount), mono: true },
      { label: t('signal.report_can_ids'), value: String(draft.can.uniqueIds), mono: true },
      { label: t('signal.can_speed'), value: draft.can.bitrate || '—' },
    ], 3);
    if (draft.can.topIds && draft.can.topIds.length > 0) {
      y = drawTable(rd, y, [
        { label: 'CAN ID', w: 24, get: (r: any) => `0x${r.id.toString(16).toUpperCase().padStart(3, '0')}`, mono: true },
        { label: '#', w: 20, get: (r: any) => String(r.count), mono: true },
        { label: t('signal.report_can_hint'), w: CONTENT_W - 44, get: (r: any) => r.hint || '', align: 'left' },
      ], draft.can.topIds);
    }
  } else {
    y = drawParagraph(rd, y, t('signal.report_can_waiting'));
  }
  y += 3;

  // ── Fault codes ──
  y = rd.ensure(y, 40);
  const dtcPill: Pill = !draft.dtc
    ? { text: t('signal.report_dtc_no_scan'), bg: COLOR.amber, fg: COLOR.white }
    : faultCount > 0
      ? { text: t('signal.report_dtc_count', { n: faultCount }), bg: COLOR.red, fg: COLOR.white }
      : { text: t('signal.report_dtc_ok'), bg: COLOR.green, fg: COLOR.white };
  y = sectionHeading(rd, y, t('signal.report_dtc_title'), dtcPill);
  y += 2;
  if (!draft.dtc) {
    y = drawParagraph(rd, y, t('signal.report_dtc_none_yet'));
  } else if (faultCount === 0) {
    y = drawParagraph(rd, y, draft.dtc.gotPositive ? t('signal.report_dtc_clean') : t('signal.report_dtc_inconclusive'));
  } else {
    const rows = draft.dtc.codes.filter(c => c.udsStatus === undefined || (c.udsStatus & 0x09) !== 0);
    y = drawTable(rd, y, [
      { label: 'CODE', w: 28, get: (r: any) => r.code, mono: true },
      { label: t('signal.report_dtc_desc'), w: CONTENT_W - 28 - 30, get: (r: any) => r.description, align: 'left' },
      { label: 'STATUS', w: 30, get: (r: any) => (r.udsStatus !== undefined ? `0x${r.udsStatus.toString(16).toUpperCase().padStart(2, '0')}` : '—'), mono: true },
    ], rows);
    y = drawParagraph(rd, y, `${draft.dtc.brand} · ${draft.dtc.protocol === 'OBD2' ? 'OBD-II' : draft.dtc.protocol} · ${new Date(draft.dtc.timestamp).toLocaleString()}`, 7.5);
  }
  y += 3;

  // ── Wheel speed vs current ──
  const curvePts = draft.curve.filter(p => p.speedKmh > 0 || p.currentA != null);
  if (curvePts.length >= 2) {
    y = rd.ensure(y, 90);
    y = sectionHeading(rd, y, t('signal.report_curve_title'));
    y += 2;
    const series = WHEEL_LABELS.map((w, wi) => ({
      label: w,
      color: WHEEL_COLORS[w],
      axis: 'left' as const,
      points: curvePts
        .map(p => ({ x: p.speedKmh, y: p[WHEELS[wi]] }))
        .filter((d): d is { x: number; y: number } => d.y != null),
    })).filter(s => s.points.length >= 2);
    const currentSeries = {
      label: t('signal.report_curve_current'),
      color: COLOR.red,
      axis: 'right' as const,
      dashed: true,
      points: curvePts.map(p => ({ x: p.speedKmh, y: p.currentA })).filter((d): d is { x: number; y: number } => d.y != null),
    };
    const allSeries = [...series, ...(currentSeries.points.length >= 2 ? [currentSeries] : [])];
    if (allSeries.length > 0) {
      y = drawLineChart(rd, y, {
        x: X0, w: CONTENT_W, h: 62,
        xLabel: t('signal.report_curve_speed'),
        leftLabel: 'km/h',
        rightLabel: currentSeries.points.length >= 2 ? 'A' : undefined,
        series: allSeries,
      });
    }
    y = drawTable(rd, y, [
      { label: t('signal.report_curve_speed'), w: 30, get: (r: WheelCurvePoint) => r.speedKmh.toFixed(0), mono: true },
      { label: 'FL', w: 24, get: (r: WheelCurvePoint) => (r.fl != null ? r.fl.toFixed(1) : '—'), mono: true },
      { label: 'FR', w: 24, get: (r: WheelCurvePoint) => (r.fr != null ? r.fr.toFixed(1) : '—'), mono: true },
      { label: 'RL', w: 24, get: (r: WheelCurvePoint) => (r.rl != null ? r.rl.toFixed(1) : '—'), mono: true },
      { label: 'RR', w: 24, get: (r: WheelCurvePoint) => (r.rr != null ? r.rr.toFixed(1) : '—'), mono: true },
      { label: t('signal.report_curve_current'), w: CONTENT_W - 150, get: (r: WheelCurvePoint) => (r.currentA != null ? `${r.currentA.toFixed(2)} A` : '—'), mono: true },
    ], curvePts, (r: WheelCurvePoint) => (issues.some(x => x.speedKmh === r.speedKmh) ? 'warn' : null));
    if (issues.length > 0) {
      y = drawParagraph(rd, y, t('signal.report_curve_issue', { wheels: [...new Set(issues.map(x => x.wheel))].join(', ') }), 8, COLOR.amberText);
    }
    y += 3;
  }

  // ── Motor current & supply ──
  const hasCurrent = peak != null || draft.manual.voltageV != null || draft.manual.currentIdleA != null || draft.manual.injectedMa;
  if (hasCurrent) {
    y = rd.ensure(y, 40);
    const overSpec = peak != null && draft.manual.currentSpecMaxA != null && peak > draft.manual.currentSpecMaxA;
    y = sectionHeading(rd, y, t('signal.report_current_title'), overSpec
      ? { text: t('signal.report_current_over'), bg: COLOR.red, fg: COLOR.white }
      : peak != null
        ? { text: t('signal.report_current_in_spec'), bg: COLOR.green, fg: COLOR.white }
        : undefined);
    y += 2;
    const tiles: { label: string; value: string; color?: [number, number, number]; mono?: boolean }[] = [];
    if (peak != null) tiles.push({ label: t('signal.report_current_peak'), value: `${peak.toFixed(2)} A`, mono: true, color: overSpec ? COLOR.redText : COLOR.ink });
    if (draft.manual.currentIdleA != null) tiles.push({ label: t('signal.report_current_idle'), value: `${draft.manual.currentIdleA.toFixed(2)} A`, mono: true });
    if (draft.manual.voltageV != null) tiles.push({ label: t('signal.report_voltage'), value: `${draft.manual.voltageV.toFixed(1)} V`, mono: true });
    if (draft.manual.currentSpecMaxA != null) tiles.push({ label: t('signal.report_current_spec_max'), value: `${draft.manual.currentSpecMaxA.toFixed(2)} A`, mono: true });
    if (draft.manual.currentSpecMinA != null) tiles.push({ label: t('signal.report_current_spec_min'), value: `${draft.manual.currentSpecMinA.toFixed(2)} A`, mono: true });
    if (draft.manual.voltageSpecMinV != null) tiles.push({ label: t('signal.report_voltage_spec_min'), value: `${draft.manual.voltageSpecMinV.toFixed(1)} V`, mono: true });
    if (tiles.length) y = drawStatTiles(rd, y, tiles, 3);
    if (draft.manual.injectedMa) y = drawParagraph(rd, y + 1, `${t('signal.report_injected')}: ${draft.manual.injectedMa}`, 8);
    y += 3;
  }

  // ── Notes ──
  if (draft.manual.notes) {
    y = rd.ensure(y, 30);
    y = sectionHeading(rd, y, t('signal.report_notes_title'));
    y += 1;
    y = drawParagraph(rd, y, draft.manual.notes, 8.7, COLOR.ink);
  }

  return y;
}
