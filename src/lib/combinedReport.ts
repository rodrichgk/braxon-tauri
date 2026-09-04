// One PDF covering both benches — the ECU (Signal HIL) draft and a
// snapshot of the last hydraulic report — so a reman job can carry a
// single "full test" document. Reuses the ECU section renderer from
// EcuTestReport and renders the hydraulic ParsedReport here against the
// same shared pdfReport primitives.

import {
  createReportDoc, drawHeader, drawTitleBlock, drawJobRow, drawFooter,
  sectionHeading, drawStatTiles, drawChipGrid, drawTable, drawParagraph,
  COLOR, CONTENT_W, type ReportDoc, type Pill, type PdfVerdict, type Chip,
} from '@/lib/pdfReport';
import { drawEcuBody } from '@/components/EcuTestReport';
import {
  type EcuReportDraft, computeEcuVerdict, ecuReasonSummary, ecuReportHasData,
} from '@/lib/ecuReport';
import {
  type ParsedReport, type Verdict, computeVerdict, reportHasData,
} from '@/lib/hydraulicReport';

type TFn = (key: string, opts?: Record<string, unknown>) => string;

const RANK: Record<Verdict, number> = { pass: 0, review: 1, fail: 2 };

function worst(a: Verdict | null, b: Verdict | null): Verdict | null {
  if (a && b) return RANK[a] >= RANK[b] ? a : b;
  return a ?? b;
}

function valveNumber(label: string): number {
  const m = label.match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

export function drawHydraulicBody(rd: ReportDoc, yIn: number, parsed: ParsedReport, t: TFn): number {
  let y = yIn;

  // ── Valves ──
  if (parsed.valves.length > 0) {
    y = rd.ensure(y, 40);
    const faults = parsed.valves.filter(v => v.status === 'fault').length;
    const marginals = parsed.valves.filter(v => v.status === 'marginal').length;
    const pill: Pill = faults > 0
      ? { text: `${faults} FAULT`, bg: COLOR.red, fg: COLOR.white }
      : marginals > 0
        ? { text: `${marginals} MARGINAL`, bg: COLOR.amber, fg: COLOR.white }
        : { text: 'ALL OK', bg: COLOR.green, fg: COLOR.white };
    y = sectionHeading(rd, y, t('f2evo.report_valves_title'), pill);
    y += 2;
    const chips: Chip[] = parsed.valves.map(v => ({
      title: `Valve ${valveNumber(v.label)}`,
      value: v.status,
      sub: 'code' in v && v.code !== undefined ? `code ${v.code}` : undefined,
      tone: v.status === 'fault' ? 'bad' : v.status === 'marginal' ? 'warn' : v.status === 'informational' ? 'neutral' : 'ok',
    }));
    y = drawChipGrid(rd, y, chips, 4);
    y += 3;
  }

  // ── Motor ──
  if (parsed.motor) {
    y = rd.ensure(y, 30);
    const ok = parsed.motor.status === 'ok';
    y = sectionHeading(rd, y, t('f2evo.report_motor_title'), {
      text: ok ? 'OK' : 'CHECK', bg: ok ? COLOR.green : COLOR.amber, fg: COLOR.white,
    });
    y += 2;
    y = drawStatTiles(rd, y, [
      { label: 'MOTOR STATUS', value: parsed.motor.status.replace(/_/g, ' '), color: ok ? COLOR.greenText : COLOR.amberText },
      { label: 'CURRENT DRAW', value: parsed.motor.current_amps !== null ? `${parsed.motor.current_amps.toFixed(2)} A` : '—', mono: true },
    ], 2);
    y += 3;
  }

  // ── Pressure ──
  if (parsed.pressure) {
    y = rd.ensure(y, 40);
    const ok = parsed.pressure.completed === true;
    const incomplete = parsed.pressure.completed === null;
    y = sectionHeading(rd, y, t('f2evo.report_pressure_title'), {
      text: incomplete ? 'INCOMPLETE' : ok ? 'PRESSURE OK' : 'PRESSURE FAIL',
      bg: incomplete ? COLOR.amber : ok ? COLOR.green : COLOR.red,
      fg: COLOR.white,
    });
    y += 2;
    y = drawTable(rd, y, [
      { label: 'TEST', w: 44, get: (r: any) => String(r.label).split(':')[0].trim(), align: 'left' },
      { label: 'C1', w: 20, get: (r: any) => (r.channel_pressures[0] != null ? r.channel_pressures[0].toFixed(2) : '—'), mono: true },
      { label: 'C2', w: 20, get: (r: any) => (r.channel_pressures[1] != null ? r.channel_pressures[1].toFixed(2) : '—'), mono: true },
      { label: 'C3', w: 20, get: (r: any) => (r.channel_pressures[2] != null ? r.channel_pressures[2].toFixed(2) : '—'), mono: true },
      { label: 'C4', w: 20, get: (r: any) => (r.channel_pressures[3] != null ? r.channel_pressures[3].toFixed(2) : '—'), mono: true },
      { label: 'PUMP', w: 22, get: (r: any) => (r.pump_pressure != null ? r.pump_pressure.toFixed(2) : '—'), mono: true },
      { label: 'RESULT', w: CONTENT_W - 166, get: (r: any) => (r.passed ? 'OK' : r.faulted_channels.length ? `FAIL C${r.faulted_channels.join(',C')}` : 'FAIL') },
    ], parsed.pressure.cycles, (r: any) => (r.faulted_channels.length ? 'bad' : null));
    if (incomplete) y = drawParagraph(rd, y, t('f2evo.report_pressure_incomplete'), 8, COLOR.amberText);
    y += 3;
  }

  return y;
}

export interface HydraulicReportOpts {
  hydraulic: ParsedReport | null;
  jobLabel?: string;
  jobNumber?: string;
  t: TFn;
}

/** Standalone hydraulic PDF built from the cross-bench snapshot — the
 *  F2-EVO page keeps its own richer report (with valve overrides); this
 *  is the same layout the combined report uses, generated from the
 *  Signal HIL page so all three reports come from one place. */
export function generateHydraulicReportPdf({ hydraulic, jobLabel, jobNumber, t }: HydraulicReportOpts) {
  const rd = createReportDoc();
  const verdict = reportHasData(hydraulic) ? computeVerdict(hydraulic) : null;
  drawHeader(rd, 'ABS Hydraulic Diagnostics');
  let y = drawTitleBlock(rd, {
    title: t('f2evo.report_title'),
    verdict: verdict as PdfVerdict | null,
    verdictLabel: verdict ? t(`signal.report_verdict_${verdict}`) : undefined,
    reason: verdict ? t('signal.report_hyd_snapshot_reason') : '',
  });
  y = drawJobRow(rd, y, jobLabel, jobNumber);
  if (reportHasData(hydraulic)) {
    drawHydraulicBody(rd, y, hydraulic, t);
  } else {
    drawParagraph(rd, y, t('signal.report_hyd_empty'));
  }
  drawFooter(rd, 'BRAXON — Hydraulic Bench Report');
  const word = verdict ? verdict.toUpperCase() : 'REPORT';
  const base = jobNumber ? `${jobNumber}-HYD-${word}` : `hydraulic-report-${new Date().toISOString().slice(0, 10)}-${word}`;
  rd.doc.save(`${base}.pdf`);
}

export interface CombinedReportOpts {
  ecu: EcuReportDraft | null;
  hydraulic: ParsedReport | null;
  jobLabel?: string;
  jobNumber?: string;
  t: TFn;
}

export function generateCombinedReportPdf({ ecu, hydraulic, jobLabel, jobNumber, t }: CombinedReportOpts) {
  const rd = createReportDoc();
  const ecuVerdict = ecuReportHasData(ecu) ? computeEcuVerdict(ecu) : null;
  const hydVerdict = reportHasData(hydraulic) ? computeVerdict(hydraulic) : null;
  const overall = worst(ecuVerdict, hydVerdict);

  drawHeader(rd, 'ABS Reman — Full Test');
  let y = drawTitleBlock(rd, {
    title: t('signal.report_combined_title'),
    verdict: overall as PdfVerdict | null,
    verdictLabel: overall ? t(`signal.report_verdict_${overall}`) : undefined,
    reason: t('signal.report_combined_reason', {
      ecu: ecuVerdict ? t(`signal.report_verdict_${ecuVerdict}`) : '—',
      hyd: hydVerdict ? t(`signal.report_verdict_${hydVerdict}`) : '—',
    }),
  });
  y = drawJobRow(rd, y, jobLabel, jobNumber);

  // Summary tiles: one verdict per bench.
  y = drawStatTiles(rd, y, [
    {
      label: t('signal.report_combined_ecu'),
      value: ecuVerdict ? t(`signal.report_verdict_${ecuVerdict}`) : t('signal.report_combined_na'),
      color: ecuVerdict === 'fail' ? COLOR.redText : ecuVerdict === 'pass' ? COLOR.greenText : COLOR.amberText,
    },
    {
      label: t('signal.report_combined_hydraulic'),
      value: hydVerdict ? t(`signal.report_verdict_${hydVerdict}`) : t('signal.report_combined_na'),
      color: hydVerdict === 'fail' ? COLOR.redText : hydVerdict === 'pass' ? COLOR.greenText : COLOR.amberText,
    },
  ], 2);
  y += 4;

  // ── ECU section ──
  if (ecuReportHasData(ecu)) {
    y = rd.ensure(y, 30);
    y = sectionHeading(rd, y, t('signal.report_combined_ecu_heading'));
    y = drawParagraph(rd, y + 1, ecuReasonSummary(ecu), 8);
    y += 2;
    y = drawEcuBody(rd, y, ecu, t);
  }

  // ── Hydraulic section (fresh page) ──
  if (reportHasData(hydraulic)) {
    y = rd.newPage();
    y = sectionHeading(rd, y, t('signal.report_combined_hydraulic_heading'));
    y += 3;
    y = drawHydraulicBody(rd, y, hydraulic, t);
  }

  drawFooter(rd, 'BRAXON — Full Test Report (ECU + Hydraulic)');

  const word = overall ? overall.toUpperCase() : 'REPORT';
  const base = jobNumber ? `${jobNumber}-FULL-${word}` : `full-report-${new Date().toISOString().slice(0, 10)}-${word}`;
  rd.doc.save(`${base}.pdf`);
}
