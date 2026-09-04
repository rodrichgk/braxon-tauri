import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { jsPDF } from 'jspdf';
import {
  DocumentArrowDownIcon, CheckCircleIcon, ExclamationTriangleIcon, XCircleIcon, PencilSquareIcon,
} from '@heroicons/react/24/outline';
import PressureGauge from './PressureGauge';
import {
  type ParsedReport, type ValveResult, type ValveStatusKind, type MotorStatusKind, type Verdict,
  type PressureCycle, computeVerdict,
} from '@/lib/hydraulicReport';
import { REMAN_LOGO_PNG, BRAXON_WORDMARK_PNG } from '@/lib/pdfLogos';

const VALVE_BADGE: Record<ValveStatusKind, string> = {
  ok: 'bg-success/10 text-success border-success/20',
  marginal: 'bg-warning/10 text-warning border-warning/20',
  fault: 'bg-danger/10 text-danger border-danger/20',
  informational: 'bg-elevated text-text-tertiary border-border',
};

const MOTOR_BADGE: Record<MotorStatusKind, string> = {
  ok: 'bg-success/10 text-success border-success/20',
  warning_low: 'bg-warning/10 text-warning border-warning/20',
  warning_over: 'bg-warning/10 text-warning border-warning/20',
  warning_other: 'bg-warning/10 text-warning border-warning/20',
  unconfirmed: 'bg-elevated text-text-tertiary border-border',
};

// Only OK/Marginal/Fault are offered as manual overrides — Informational
// is a board-only nuance (a Fault code >15 the original doesn't even color
// as a problem) not something a technician would deliberately pick.
export type OverridableValveStatus = 'ok' | 'marginal' | 'fault';

const OVERRIDE_OPTIONS: { status: OverridableValveStatus; icon: JSX.Element }[] = [
  { status: 'ok', icon: <CheckCircleIcon className="w-3.5 h-3.5" /> },
  { status: 'marginal', icon: <ExclamationTriangleIcon className="w-3.5 h-3.5" /> },
  { status: 'fault', icon: <XCircleIcon className="w-3.5 h-3.5" /> },
];

const SAVE_TYPES: { type: string; labelKey: string; accent: boolean }[] = [
  { type: 'before_repair', labelKey: 'f2evo.report_save_before', accent: false },
  { type: 'after_repair', labelKey: 'f2evo.report_save_after', accent: false },
  { type: 'passed', labelKey: 'f2evo.report_save_passed', accent: true },
];

interface HydraulicTestReportProps {
  /** Parsed once by the parent (kept in sync with the live report text
   * regardless of whether this panel is open, so the dashboard's own
   * completion banner works even when it's closed) — passed down as a
   * controlled value instead of this component re-parsing rawText itself. */
  parsed: ParsedReport | null;
  jobLabel?: string;
  /** Raw job/intervention number (e.g. "17503301") — used in the PDF
   * filename and letterhead; jobLabel is the friendlier "Client (Ref)"
   * display string shown on screen and in the PDF body. */
  jobNumber?: string;
  onClose?: () => void;
  /** Manual corrections to the board's own valve readings, keyed by index
   * into parsed.valves. Lifted to the parent (not local state here) so an
   * override survives closing and reopening this panel — it was silently
   * resetting every time this component unmounted. */
  valveOverrides: Record<number, OverridableValveStatus>;
  onValveOverridesChange: (updater: (prev: Record<number, OverridableValveStatus>) => Record<number, OverridableValveStatus>) => void;
  /** Present only when a job is linked — renders the Save Before/After/
   * Passed actions right here in the report, instead of buried under the
   * log's "Show Log" toggle where they were easy to miss. */
  onSave?: (reportType: string) => void;
}

function valveNumber(label: string): number {
  const m = label.match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

// The board bakes its own "Ok"/"ERROR" result straight onto the cycle
// header line (e.g. "Oil outlet test: Ok", "Braked wheels test: ERROR")
// — strip it for display since there's already a separate pass/fail badge
// shown right next to this text; showing both was redundant.
function cycleName(label: string): string {
  return label.split(':')[0].trim();
}

export default function HydraulicTestReport({
  parsed, jobLabel, jobNumber, onClose, valveOverrides, onValveOverridesChange, onSave,
}: HydraulicTestReportProps) {
  const { t } = useTranslation();

  const effectiveValves = useMemo(() => {
    if (!parsed) return [];
    return parsed.valves.map((v, i) => {
      const override = valveOverrides[i];
      return override ? { label: v.label, status: override } : v;
    });
  }, [parsed, valveOverrides]);

  const effectiveParsed: ParsedReport | null = useMemo(() => {
    if (!parsed) return null;
    return { ...parsed, valves: effectiveValves };
  }, [parsed, effectiveValves]);

  const verdict: Verdict | null = useMemo(() => computeVerdict(effectiveParsed), [effectiveParsed]);

  const verdictStyle: Record<Verdict, { badge: string; icon: JSX.Element; label: string }> = {
    pass: {
      badge: 'bg-success/10 text-success border-success/20',
      icon: <CheckCircleIcon className="w-5 h-5" />,
      label: t('f2evo.report_verdict_pass'),
    },
    review: {
      badge: 'bg-warning/10 text-warning border-warning/20',
      icon: <ExclamationTriangleIcon className="w-5 h-5" />,
      label: t('f2evo.report_verdict_review'),
    },
    fail: {
      badge: 'bg-danger/10 text-danger border-danger/20',
      icon: <XCircleIcon className="w-5 h-5" />,
      label: t('f2evo.report_verdict_fail'),
    },
  };

  const motorLabel = (status: MotorStatusKind) => ({
    ok: t('f2evo.report_motor_ok'),
    warning_low: t('f2evo.report_motor_warning_low'),
    warning_over: t('f2evo.report_motor_warning_over'),
    warning_other: t('f2evo.report_motor_warning_other'),
    unconfirmed: t('f2evo.report_motor_unconfirmed'),
  }[status]);

  const valveLabel = (status: ValveStatusKind) => ({
    ok: t('f2evo.report_valve_ok'),
    marginal: t('f2evo.report_valve_marginal'),
    fault: t('f2evo.report_valve_fault'),
    informational: t('f2evo.report_valve_informational'),
  }[status]);

  // Plain-language reason for the verdict, built from the data itself —
  // shown under the title in both the on-screen view and the PDF, so
  // "why" is visible without reading every valve chip individually.
  const reasonSummary = useMemo(() => {
    if (!effectiveParsed) return '';
    const faults = effectiveParsed.valves.filter(v => v.status === 'fault');
    const marginals = effectiveParsed.valves.filter(v => v.status === 'marginal');
    const parts: string[] = [];
    if (faults.length > 0) {
      const list = faults.map(v => `V${valveNumber(v.label)}${'code' in v && v.code !== undefined ? ` (code ${v.code})` : ''}`).join(', ');
      parts.push(`${faults.length} valve${faults.length > 1 ? 's' : ''} failed — ${list}`);
    }
    if (marginals.length > 0) {
      const list = marginals.map(v => `V${valveNumber(v.label)}${'code' in v && v.code !== undefined ? ` (code ${v.code})` : ''}`).join(', ');
      parts.push(`${marginals.length} marginal — ${list}`);
    }
    if (effectiveParsed.motor && effectiveParsed.motor.status !== 'ok') parts.push('motor test flagged');
    if (effectiveParsed.pressure?.completed === false) parts.push('pressure test failed');
    if (effectiveParsed.pressure?.completed === null) parts.push('pressure test did not complete');
    if (parts.length === 0) return t('f2evo.report_reason_clean', { defaultValue: 'All valves, motor and hydraulic circuits within spec.' });
    return parts.join('  ·  ');
  }, [effectiveParsed, t]);

  // ── PDF ──────────────────────────────────────────────────────────────
  // A4/mm layout: valve results as a colored chip grid, motor/pressure as
  // stat tiles, hydraulic cycles as a real data table, and a plain-language
  // reason line under the verdict — replacing the earlier bullet-list
  // version, which read as an afterthought next to the on-screen view.
  const generatePdf = () => {
    if (!effectiveParsed) return;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const PAGE_W = 210;
    const PAGE_H = 297;
    const M = 20;
    const X0 = M;
    const X1 = PAGE_W - M;
    const CONTENT_W = X1 - X0;
    const HEADER_H = 24;

    const COLOR = {
      headerBg: [15, 15, 18] as [number, number, number],
      ink: [28, 28, 30] as [number, number, number],
      inkSoft: [110, 110, 115] as [number, number, number],
      gray2: [174, 174, 178] as [number, number, number],
      hairline: [209, 209, 214] as [number, number, number],
      cardBg: [245, 245, 247] as [number, number, number],
      rowAlt: [250, 250, 250] as [number, number, number],
      red: [255, 69, 59] as [number, number, number],
      redText: [215, 0, 21] as [number, number, number],
      redBg: [253, 236, 233] as [number, number, number],
      amber: [255, 159, 10] as [number, number, number],
      amberText: [178, 89, 0] as [number, number, number],
      amberBg: [255, 246, 230] as [number, number, number],
      green: [48, 209, 88] as [number, number, number],
      greenText: [31, 122, 55] as [number, number, number],
      greenBg: [234, 249, 238] as [number, number, number],
      white: [255, 255, 255] as [number, number, number],
    };

    const fill = (c: [number, number, number]) => doc.setFillColor(c[0], c[1], c[2]);
    const ink = (c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);
    const stroke = (c: [number, number, number]) => doc.setDrawColor(c[0], c[1], c[2]);
    const hairline = (y: number) => { stroke(COLOR.hairline); doc.setLineWidth(0.4); doc.line(X0, y, X1, y); };

    const drawLogo = (dataUrl: string, x: number, y: number, targetH: number, align: 'left' | 'right' = 'left') => {
      const props = doc.getImageProperties(dataUrl);
      const w = (props.width / props.height) * targetH;
      const drawX = align === 'right' ? x - w : x;
      doc.addImage(dataUrl, 'PNG', drawX, y, w, targetH);
      return w;
    };

    const drawPill = (text: string, xRight: number, yTop: number, height: number, bg: [number, number, number], fg: [number, number, number], fontSize = 8) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(fontSize);
      const padX = height * 0.55;
      const w = doc.getTextWidth(text) + padX * 2;
      const x = xRight - w;
      fill(bg);
      doc.roundedRect(x, yTop, w, height, height / 2, height / 2, 'F');
      ink(fg);
      doc.text(text, x + w / 2, yTop + height / 2, { align: 'center', baseline: 'middle' });
      return w;
    };

    const sectionHeading = (y: number, title: string, pill?: { text: string; bg: [number, number, number]; fg: [number, number, number] }) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11.5);
      ink(COLOR.ink);
      doc.text(title, X0, y);
      if (pill) drawPill(pill.text, X1, y - 4.2, 6.2, pill.bg, pill.fg, 7.5);
      return y + 7;
    };

    // ── Header ──
    fill(COLOR.headerBg);
    doc.rect(0, 0, PAGE_W, HEADER_H, 'F');
    // BRAXON wordmark (white art) on the left, subtitle flush beneath it.
    drawLogo(BRAXON_WORDMARK_PNG, X0, 7, 5, 'left');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
    ink(COLOR.gray2);
    doc.text('ABS Hydraulic Diagnostics', X0, 16.8);
    drawLogo(REMAN_LOGO_PNG, X1, (HEADER_H - 11) / 2, 11, 'right');

    // ── Title block: title, date, verdict pill, reason line ──
    const top = HEADER_H + 12;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(19);
    ink(COLOR.ink);
    doc.text(t('f2evo.report_title'), X0, top);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    ink(COLOR.inkSoft);
    doc.text(new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }), X0, top + 6.5);

    const badgeW = 34, badgeH = 13, badgeY = top - 9;
    const isPass = verdict === 'pass';
    const isFail = verdict === 'fail';
    fill(isFail ? COLOR.red : isPass ? COLOR.green : COLOR.amber);
    doc.roundedRect(X1 - badgeW, badgeY, badgeW, badgeH, 2.5, 2.5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    ink(COLOR.white);
    doc.text(verdict ? verdictStyle[verdict].label : '—', X1 - badgeW / 2, badgeY + badgeH / 2, { align: 'center', baseline: 'middle' });

    const reasonY = top + 13;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.7);
    ink(COLOR.inkSoft);
    const reasonLines = doc.splitTextToSize(reasonSummary, CONTENT_W);
    doc.text(reasonLines, X0, reasonY);
    const afterReason = reasonY + (reasonLines.length - 1) * 4.2;
    let y = Math.max(afterReason + 6, badgeY + badgeH + 6);
    hairline(y);
    y += 10;

    // ── Job row ──
    if (jobLabel) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
      ink(COLOR.inkSoft);
      doc.text('JOB', X0, y);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
      ink(COLOR.ink);
      doc.text(jobLabel, X0, y + 6.5);
      if (jobNumber) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
        ink(COLOR.inkSoft);
        doc.text('REF.', X1, y, { align: 'right' });
        doc.setFont('courier', 'bold'); doc.setFontSize(11);
        ink(COLOR.ink);
        doc.text(jobNumber, X1, y + 6.5, { align: 'right' });
      }
      y += 13;
      hairline(y);
      y += 10;
    }

    // ── Valves: colored chip grid ──
    if (effectiveParsed.valves.length > 0) {
      const counts = { fault: 0, marginal: 0 };
      effectiveParsed.valves.forEach(v => { if (v.status === 'fault') counts.fault++; else if (v.status === 'marginal') counts.marginal++; });
      const pill = counts.fault > 0
        ? { text: `${counts.fault} FAULT`, bg: COLOR.red, fg: COLOR.white }
        : counts.marginal > 0
          ? { text: `${counts.marginal} MARGINAL`, bg: COLOR.amber, fg: COLOR.white }
          : { text: 'ALL OK', bg: COLOR.green, fg: COLOR.white };
      y = sectionHeading(y, t('f2evo.report_valves_title'), pill);
      y += 3;

      const cols = 4, gap = 4;
      const chipW = (CONTENT_W - gap * (cols - 1)) / cols;
      const chipH = 21;
      const rows = Math.ceil(effectiveParsed.valves.length / cols);
      const chipStyle: Record<ValveStatusKind, { bg: [number, number, number]; fg: [number, number, number] }> = {
        ok: { bg: COLOR.cardBg, fg: COLOR.inkSoft },
        marginal: { bg: COLOR.amberBg, fg: COLOR.amberText },
        fault: { bg: COLOR.redBg, fg: COLOR.redText },
        informational: { bg: COLOR.cardBg, fg: COLOR.inkSoft },
      };

      effectiveParsed.valves.forEach((v, i) => {
        const col = i % cols, row = Math.floor(i / cols);
        const x = X0 + col * (chipW + gap);
        const cy = y + row * (chipH + gap);
        const st = chipStyle[v.status];
        fill(st.bg);
        doc.roundedRect(x, cy, chipW, chipH, 2, 2, 'F');
        if (v.status !== 'ok') {
          fill(st.fg);
          doc.roundedRect(x, cy, 1.3, chipH, 0.6, 0.6, 'F');
        }
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
        ink(COLOR.ink);
        doc.text(`VALVE ${valveNumber(v.label)}`, x + 4.5, cy + 6.3);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
        ink(st.fg);
        doc.text(valveLabel(v.status).toUpperCase(), x + 4.5, cy + 12.3);
        const code = 'code' in v ? v.code : undefined;
        if (code !== undefined) {
          doc.setFont('courier', 'normal'); doc.setFontSize(7);
          ink(COLOR.inkSoft);
          doc.text(`code ${code}`, x + 4.5, cy + 16.3);
        }
      });
      y += rows * (chipH + gap) - gap + 13;
    }

    // ── Motor: stat tiles ──
    if (effectiveParsed.motor) {
      const ok = effectiveParsed.motor.status === 'ok';
      y = sectionHeading(y, t('f2evo.report_motor_title'), {
        text: ok ? 'OK' : 'CHECK', bg: ok ? COLOR.green : COLOR.amber, fg: COLOR.white,
      });
      y += 3;
      const tileH = 25, gap = 4, tileW = (CONTENT_W - gap) / 2;
      const drawTile = (x: number, label: string, value: string, valueColor: [number, number, number], mono = false) => {
        fill(COLOR.cardBg);
        doc.roundedRect(x, y, tileW, tileH, 2, 2, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
        ink(COLOR.inkSoft);
        doc.text(label, x + 5, y + 8);
        doc.setFont(mono ? 'courier' : 'helvetica', 'bold'); doc.setFontSize(15);
        ink(valueColor);
        doc.text(value, x + 5, y + 18.5);
      };
      drawTile(X0, 'MOTOR STATUS', motorLabel(effectiveParsed.motor.status).toUpperCase(), ok ? COLOR.greenText : COLOR.amberText);
      drawTile(X0 + tileW + gap, 'CURRENT DRAW', effectiveParsed.motor.current_amps !== null ? `${effectiveParsed.motor.current_amps.toFixed(2)} A` : '—', COLOR.ink, true);
      y += tileH + 13;
    }

    // ── Pressure: data table ──
    if (effectiveParsed.pressure) {
      const ok = effectiveParsed.pressure.completed === true;
      const incomplete = effectiveParsed.pressure.completed === null;
      y = sectionHeading(y, t('f2evo.report_pressure_title'), {
        text: incomplete ? 'INCOMPLETE' : ok ? 'PRESSURE OK' : 'PRESSURE FAIL',
        bg: incomplete ? COLOR.amber : ok ? COLOR.green : COLOR.red,
        fg: COLOR.white,
      });
      y += 4;

      const truncateToWidth = (text: string, maxWidth: number): string => {
        if (doc.getTextWidth(text) <= maxWidth) return text;
        let out = text;
        while (out.length > 1 && doc.getTextWidth(out + '…') > maxWidth) out = out.slice(0, -1);
        return out + '…';
      };

      // TEST shows the board's own name for this cycle (e.g. "Oil outlet
      // test", "Braked wheels test") rather than a bare sequential index —
      // widened accordingly, with the channel columns narrowed to fit.
      // channel (1-4) marks which reading a column represents, so a cell
      // the board specifically flagged (faulted_channels) can be colored
      // and called out rather than only showing a single pass/fail for
      // the whole row.
      type Col = { label: string; w: number; get: (r: PressureCycle, i: number) => string; mono?: boolean; channel?: number };
      const cols: Col[] = [
        { label: 'TEST', w: 44, get: r => cycleName(r.label) },
        { label: 'C1', w: 21, get: r => r.channel_pressures[0] !== null ? r.channel_pressures[0]!.toFixed(2) : '—', mono: true, channel: 1 },
        { label: 'C2', w: 21, get: r => r.channel_pressures[1] !== null ? r.channel_pressures[1]!.toFixed(2) : '—', mono: true, channel: 2 },
        { label: 'C3', w: 21, get: r => r.channel_pressures[2] !== null ? r.channel_pressures[2]!.toFixed(2) : '—', mono: true, channel: 3 },
        { label: 'C4', w: 21, get: r => r.channel_pressures[3] !== null ? r.channel_pressures[3]!.toFixed(2) : '—', mono: true, channel: 4 },
        { label: 'PUMP', w: 24, get: r => r.pump_pressure !== null ? r.pump_pressure.toFixed(2) : '—', mono: true },
        { label: 'RESULT', w: 18, get: r => r.passed ? 'OK' : (r.faulted_channels.length > 0 ? `FAIL C${r.faulted_channels.join(',C')}` : 'FAIL') },
      ];
      const xOffsets: number[] = [];
      let acc = X0;
      for (const c of cols) { xOffsets.push(acc); acc += c.w; }

      const headH = 8;
      fill(COLOR.cardBg);
      doc.roundedRect(X0, y, CONTENT_W, headH, 1.5, 1.5, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
      ink(COLOR.inkSoft);
      cols.forEach((c, i) => {
        const cx = xOffsets[i];
        if (i === 0) doc.text(c.label, cx + 4, y + headH / 2, { baseline: 'middle' });
        else doc.text(c.label, cx + c.w - 3, y + headH / 2, { align: 'right', baseline: 'middle' });
      });
      y += headH;

      const rowH = 10.5;
      effectiveParsed.pressure.cycles.forEach((cyc, i) => {
        if (y > PAGE_H - 40) { doc.addPage(); y = 20; }
        const rowHasFault = cyc.faulted_channels.length > 0;
        if (rowHasFault) { fill(COLOR.redBg); doc.rect(X0, y, CONTENT_W, rowH, 'F'); }
        else if (i % 2 === 1) { fill(COLOR.rowAlt); doc.rect(X0, y, CONTENT_W, rowH, 'F'); }
        cols.forEach((c, ci) => {
          const cx = xOffsets[ci];
          let text = c.get(cyc, i);
          const isFaultedChannel = c.channel !== undefined && cyc.faulted_channels.includes(c.channel);
          doc.setFont(c.mono ? 'courier' : 'helvetica', ci === cols.length - 1 || isFaultedChannel ? 'bold' : 'normal');
          doc.setFontSize(c.mono ? 8.5 : 9);
          if (ci === cols.length - 1) ink(cyc.passed ? COLOR.greenText : COLOR.redText);
          else if (isFaultedChannel) ink(COLOR.redText);
          else if (ci === 0) ink(COLOR.ink);
          else ink(COLOR.inkSoft);
          if (ci === 0) {
            text = truncateToWidth(text, c.w - 6);
            doc.text(text, cx + 4, y + rowH / 2, { baseline: 'middle' });
          } else {
            doc.text(text, cx + c.w - 3, y + rowH / 2, { align: 'right', baseline: 'middle' });
          }
        });
        y += rowH;
      });
      hairline(y + 1.5);
      y += 1.5;

      if (incomplete) {
        y += 6;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
        ink(COLOR.amberText);
        doc.text(t('f2evo.report_pressure_incomplete'), X0, y);
        y += 4;
      }
    }

    // ── Footer ──
    const footerY = Math.max(268, y + 16);
    hairline(footerY - 5);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
    ink(COLOR.gray2);
    doc.text('BRAXON — Hydraulic Bench Report', PAGE_W / 2, footerY, { align: 'center' });

    const verdictWord = verdict ? verdict.toUpperCase() : 'REPORT';
    const base = jobNumber ? `${jobNumber}-${verdictWord}` : `hydraulic-report-${new Date().toISOString().slice(0, 10)}-${verdictWord}`;
    doc.save(`${base}.pdf`);
  };

  return (
    <div className="card w-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-text-primary">{t('f2evo.report_title')}</h2>
        <div className="flex items-center gap-2">
          {parsed && (
            <button
              onClick={generatePdf}
              className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-elevated border border-border text-text-secondary hover:text-text-primary hover:border-accent/30 transition-colors"
            >
              <DocumentArrowDownIcon className="w-3.5 h-3.5" />
              {t('f2evo.report_generate_pdf')}
            </button>
          )}
          {onClose && (
            <button onClick={onClose} className="text-xs btn-secondary px-2.5 py-1.5">
              {t('f2evo.report_close')}
            </button>
          )}
        </div>
      </div>

      {/* Save Before/After/Passed — moved here from under the log's "Show
          Log" toggle, where they were easy to miss since they only
          appeared once the log was expanded. Belongs with the report,
          not the raw TX/RX trace. */}
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
              {t(s.labelKey)}
            </button>
          ))}
        </div>
      )}

      {!parsed || (parsed.valves.length === 0 && !parsed.motor && !parsed.pressure) ? (
        <p className="text-xs text-text-tertiary py-6 text-center">{t('f2evo.report_empty')}</p>
      ) : (
        <div className="space-y-5">
          {/* Overall verdict + plain-language reason */}
          {verdict && (
            <div className={['px-3 py-2 rounded-lg border', verdictStyle[verdict].badge].join(' ')}>
              <div className="flex items-center gap-2">
                {verdictStyle[verdict].icon}
                <span className="text-sm font-bold tracking-wide">{verdictStyle[verdict].label}</span>
              </div>
              <p className="text-[11px] mt-1 opacity-80">{reasonSummary}</p>
            </div>
          )}

          {/* Valves — each with an inline manual-override control, since
              the board's own resistance check isn't reliable enough to
              take at face value. */}
          {effectiveValves.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-text-secondary">{t('f2evo.report_valves_title')}</h3>
                <span className="flex items-center gap-1 text-[10px] text-text-tertiary">
                  <PencilSquareIcon className="w-3 h-3" />
                  {t('f2evo.report_valve_override_hint')}
                </span>
              </div>
              <div className="space-y-1.5">
                {effectiveValves.map((v, i) => {
                  const overridden = valveOverrides[i] !== undefined;
                  return (
                    <div key={i} className={['flex items-center justify-between gap-2 text-[11px] px-2.5 py-2 rounded-lg border', VALVE_BADGE[v.status]].join(' ')}>
                      <span className="truncate flex items-center gap-1.5">
                        {v.label.split(':')[0]}
                        {overridden && (
                          <span className="text-[9px] font-medium px-1 py-0.5 rounded bg-text-primary/10 text-text-tertiary shrink-0">
                            {t('f2evo.report_valve_overridden')}
                          </span>
                        )}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-semibold">
                          {valveLabel(v.status)}{'code' in v && v.code !== undefined ? ` ${v.code}` : ''}
                        </span>
                        <div className="flex items-center gap-0.5 border-l border-current/20 pl-2">
                          {OVERRIDE_OPTIONS.map(opt => (
                            <button
                              key={opt.status}
                              onClick={() => onValveOverridesChange(prev => ({ ...prev, [i]: opt.status }))}
                              title={valveLabel(opt.status)}
                              className={[
                                'p-1 rounded transition-colors',
                                v.status === opt.status ? 'bg-text-primary/15' : 'hover:bg-text-primary/10 opacity-50 hover:opacity-100',
                              ].join(' ')}
                            >
                              {opt.icon}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Motor */}
          {parsed.motor && (
            <div>
              <h3 className="text-xs font-semibold text-text-secondary mb-2">{t('f2evo.report_motor_title')}</h3>
              <div className="flex items-center gap-4 px-3 py-3 rounded-lg bg-elevated border border-border">
                <div>
                  <div className="text-[10px] text-text-tertiary">{t('f2evo.current')}</div>
                  <div className="text-xl font-bold tabular-nums text-text-primary">
                    {parsed.motor.current_amps !== null ? parsed.motor.current_amps.toFixed(2) : '—'}
                    <span className="text-sm text-text-tertiary ml-1">A</span>
                  </div>
                </div>
                <span className={['text-[11px] font-semibold px-2.5 py-1 rounded-md border', MOTOR_BADGE[parsed.motor.status]].join(' ')}>
                  {motorLabel(parsed.motor.status)}
                </span>
              </div>
            </div>
          )}

          {/* Pressure */}
          {parsed.pressure && (
            <div>
              <h3 className="text-xs font-semibold text-text-secondary mb-2">{t('f2evo.report_pressure_title')}</h3>
              <div className="space-y-3">
                {parsed.pressure.cycles.map((c, i) => (
                  <div key={i} className={[
                    'rounded-lg border p-3',
                    c.faulted_channels.length > 0 ? 'bg-danger/5 border-danger/20' : 'bg-elevated border-border',
                  ].join(' ')}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-text-primary truncate">{cycleName(c.label)}</span>
                      <span className={[
                        'text-[10px] font-semibold px-2 py-0.5 rounded-md border shrink-0',
                        c.passed ? 'bg-success/10 text-success border-success/20' : 'bg-danger/10 text-danger border-danger/20',
                      ].join(' ')}>
                        {c.passed
                          ? t('f2evo.report_cycle_ok')
                          : c.faulted_channels.length > 0
                            ? `${t('f2evo.report_cycle_failed')} — C${c.faulted_channels.join(', C')}`
                            : t('f2evo.report_cycle_failed')}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                      <PressureGauge label={t('f2evo.channel_1')} value={c.channel_pressures[0] ?? 0} error={c.faulted_channels.includes(1)} />
                      <PressureGauge label={t('f2evo.channel_2')} value={c.channel_pressures[1] ?? 0} error={c.faulted_channels.includes(2)} />
                      <PressureGauge label={t('f2evo.pump')} value={c.pump_pressure ?? 0} />
                      <PressureGauge label={t('f2evo.channel_3')} value={c.channel_pressures[2] ?? 0} error={c.faulted_channels.includes(3)} />
                      <PressureGauge label={t('f2evo.channel_4')} value={c.channel_pressures[3] ?? 0} error={c.faulted_channels.includes(4)} />
                    </div>
                  </div>
                ))}

                {parsed.pressure.completed === true && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-success/10 border border-success/20">
                    <CheckCircleIcon className="w-4 h-4 text-success shrink-0" />
                    <span className="text-xs font-semibold text-success">{t('f2evo.report_pressure_ok')}</span>
                  </div>
                )}
                {parsed.pressure.completed === false && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-danger/10 border border-danger/20">
                    <XCircleIcon className="w-4 h-4 text-danger shrink-0" />
                    <span className="text-xs font-semibold text-danger">{t('f2evo.report_pressure_not_ok')}</span>
                  </div>
                )}
                {parsed.pressure.completed === null && (
                  <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-warning/10 border border-warning/20">
                    <ExclamationTriangleIcon className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                    <span className="text-xs text-warning">{t('f2evo.report_pressure_incomplete')}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ValveResult imported for the JSDoc/type reference above.
export type { ValveResult };
