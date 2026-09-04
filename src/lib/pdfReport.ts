// Shared jsPDF chrome for BRAXON test reports.
//
// HydraulicTestReport.tsx grew its own A4/mm layout code inline; rather
// than refactor that working report, the reusable pieces (palette, header
// band, verdict title block, section headings, stat tiles, chip grid,
// data table, the dual-axis line chart) live here so the ECU report and
// the combined report share exactly the same look without copy-paste.
//
// Everything is in millimetres on a 210×297 A4 page with a 20 mm margin.

import { jsPDF } from 'jspdf';
import { REMAN_LOGO_PNG, BRAXON_WORDMARK_PNG } from '@/lib/pdfLogos';

export type RGB = [number, number, number];

export const COLOR = {
  headerBg: [15, 15, 18] as RGB,
  ink: [28, 28, 30] as RGB,
  inkSoft: [110, 110, 115] as RGB,
  gray2: [174, 174, 178] as RGB,
  hairline: [209, 209, 214] as RGB,
  cardBg: [245, 245, 247] as RGB,
  rowAlt: [250, 250, 250] as RGB,
  red: [255, 69, 59] as RGB,
  redText: [215, 0, 21] as RGB,
  redBg: [253, 236, 233] as RGB,
  amber: [255, 159, 10] as RGB,
  amberText: [178, 89, 0] as RGB,
  amberBg: [255, 246, 230] as RGB,
  green: [48, 209, 88] as RGB,
  greenText: [31, 122, 55] as RGB,
  greenBg: [234, 249, 238] as RGB,
  blue: [10, 132, 255] as RGB,
  blueText: [0, 92, 189] as RGB,
  white: [255, 255, 255] as RGB,
};

export const PAGE_W = 210;
export const PAGE_H = 297;
export const MARGIN = 20;
export const X0 = MARGIN;
export const X1 = PAGE_W - MARGIN;
export const CONTENT_W = X1 - X0;
const HEADER_H = 24;

export type PdfVerdict = 'pass' | 'review' | 'fail';

export interface ReportDoc {
  doc: jsPDF;
  fill: (c: RGB) => void;
  ink: (c: RGB) => void;
  stroke: (c: RGB) => void;
  hairline: (y: number) => void;
  /** Adds a page and returns the fresh top y. */
  newPage: () => number;
  /** Adds a page if `need` mm won't fit before the footer zone. Returns y. */
  ensure: (y: number, need: number) => number;
}

export function createReportDoc(): ReportDoc {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const fill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const ink = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const stroke = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);
  const hairline = (y: number) => { stroke(COLOR.hairline); doc.setLineWidth(0.4); doc.line(X0, y, X1, y); };
  const newPage = () => { doc.addPage(); return MARGIN; };
  const ensure = (y: number, need: number) => (y + need > PAGE_H - 24 ? newPage() : y);
  return { doc, fill, ink, stroke, hairline, newPage, ensure };
}

function drawLogo(doc: jsPDF, dataUrl: string, x: number, y: number, targetH: number, align: 'left' | 'right' = 'left') {
  const props = doc.getImageProperties(dataUrl);
  const w = (props.width / props.height) * targetH;
  const drawX = align === 'right' ? x - w : x;
  doc.addImage(dataUrl, 'PNG', drawX, y, w, targetH);
  return w;
}

/** Black BRAXON band across the top of a page. */
export function drawHeader(rd: ReportDoc, subtitle: string) {
  const { doc, fill, ink } = rd;
  fill(COLOR.headerBg);
  doc.rect(0, 0, PAGE_W, HEADER_H, 'F');
  // BRAXON wordmark (white art) on the left, subtitle flush beneath it.
  drawLogo(doc, BRAXON_WORDMARK_PNG, X0, 7, 5, 'left');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
  ink(COLOR.gray2);
  doc.text(subtitle, X0, 16.8);
  drawLogo(doc, REMAN_LOGO_PNG, X1, (HEADER_H - 11) / 2, 11, 'right');
}

const VERDICT_LABEL: Record<PdfVerdict, string> = { pass: 'PASS', review: 'REVIEW', fail: 'FAIL' };

/** Title, date, verdict badge and a wrapped plain-language reason line.
 *  Returns the y below the closing hairline, ready for the first section. */
export function drawTitleBlock(
  rd: ReportDoc,
  opts: { title: string; verdict: PdfVerdict | null; reason: string; verdictLabel?: string },
): number {
  const { doc, ink, fill, hairline } = rd;
  const top = HEADER_H + 12;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(19);
  ink(COLOR.ink);
  doc.text(opts.title, X0, top);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  ink(COLOR.inkSoft);
  doc.text(new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }), X0, top + 6.5);

  const badgeW = 34, badgeH = 13, badgeY = top - 9;
  const v = opts.verdict;
  fill(v === 'fail' ? COLOR.red : v === 'pass' ? COLOR.green : COLOR.amber);
  doc.roundedRect(X1 - badgeW, badgeY, badgeW, badgeH, 2.5, 2.5, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  ink(COLOR.white);
  doc.text(v ? (opts.verdictLabel ?? VERDICT_LABEL[v]) : '—', X1 - badgeW / 2, badgeY + badgeH / 2, { align: 'center', baseline: 'middle' });

  const reasonY = top + 13;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.7);
  ink(COLOR.inkSoft);
  const lines = doc.splitTextToSize(opts.reason || '', CONTENT_W);
  doc.text(lines, X0, reasonY);
  const afterReason = reasonY + (lines.length - 1) * 4.2;
  let y = Math.max(afterReason + 6, badgeY + badgeH + 6);
  hairline(y);
  return y + 10;
}

/** "JOB  Client (Ref)      REF.  17503301" strip. Returns the next y. */
export function drawJobRow(rd: ReportDoc, y: number, jobLabel?: string, jobNumber?: string): number {
  if (!jobLabel && !jobNumber) return y;
  const { doc, ink, hairline } = rd;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
  ink(COLOR.inkSoft);
  doc.text('JOB', X0, y);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  ink(COLOR.ink);
  doc.text(jobLabel ?? '—', X0, y + 6.5);
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
  return y + 10;
}

export interface Pill { text: string; bg: RGB; fg: RGB }

export function sectionHeading(rd: ReportDoc, y: number, title: string, pill?: Pill): number {
  const { doc, ink } = rd;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5);
  ink(COLOR.ink);
  doc.text(title, X0, y);
  if (pill) drawPill(rd, pill.text, X1, y - 4.2, 6.2, pill.bg, pill.fg, 7.5);
  return y + 7;
}

export function drawPill(rd: ReportDoc, text: string, xRight: number, yTop: number, height: number, bg: RGB, fg: RGB, fontSize = 8): number {
  const { doc, fill, ink } = rd;
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
}

/** Grid of grey "LABEL / value" tiles, `perRow` across the content width. */
export function drawStatTiles(
  rd: ReportDoc,
  y: number,
  tiles: { label: string; value: string; color?: RGB; mono?: boolean }[],
  perRow = 3,
  tileH = 22,
): number {
  const { doc, fill, ink } = rd;
  const gap = 4;
  const tileW = (CONTENT_W - gap * (perRow - 1)) / perRow;
  tiles.forEach((tile, i) => {
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    const x = X0 + col * (tileW + gap);
    const ty = y + row * (tileH + gap);
    fill(COLOR.cardBg);
    doc.roundedRect(x, ty, tileW, tileH, 2, 2, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
    ink(COLOR.inkSoft);
    doc.text(tile.label.toUpperCase(), x + 4.5, ty + 7);
    doc.setFont(tile.mono ? 'courier' : 'helvetica', 'bold'); doc.setFontSize(13);
    ink(tile.color ?? COLOR.ink);
    const val = doc.splitTextToSize(tile.value, tileW - 9)[0] ?? tile.value;
    doc.text(val, x + 4.5, ty + 16);
  });
  const rows = Math.ceil(tiles.length / perRow);
  return y + rows * (tileH + gap) - gap + 6;
}

export interface Chip { title: string; value: string; sub?: string; tone: 'ok' | 'warn' | 'bad' | 'neutral' }

export function drawChipGrid(rd: ReportDoc, y: number, chips: Chip[], perRow = 4, chipH = 21): number {
  const { doc, fill, ink } = rd;
  const gap = 4;
  const chipW = (CONTENT_W - gap * (perRow - 1)) / perRow;
  const style: Record<Chip['tone'], { bg: RGB; fg: RGB }> = {
    ok: { bg: COLOR.cardBg, fg: COLOR.inkSoft },
    warn: { bg: COLOR.amberBg, fg: COLOR.amberText },
    bad: { bg: COLOR.redBg, fg: COLOR.redText },
    neutral: { bg: COLOR.cardBg, fg: COLOR.inkSoft },
  };
  chips.forEach((chip, i) => {
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    const x = X0 + col * (chipW + gap);
    const cy = y + row * (chipH + gap);
    const st = style[chip.tone];
    fill(st.bg);
    doc.roundedRect(x, cy, chipW, chipH, 2, 2, 'F');
    if (chip.tone !== 'ok' && chip.tone !== 'neutral') {
      fill(st.fg);
      doc.roundedRect(x, cy, 1.3, chipH, 0.6, 0.6, 'F');
    }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
    ink(COLOR.ink);
    doc.text(chip.title.toUpperCase(), x + 4.5, cy + 6.3);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    ink(st.fg);
    doc.text(chip.value.toUpperCase(), x + 4.5, cy + 12.3);
    if (chip.sub) {
      doc.setFont('courier', 'normal'); doc.setFontSize(7);
      ink(COLOR.inkSoft);
      doc.text(chip.sub, x + 4.5, cy + 16.3);
    }
  });
  const rows = Math.ceil(chips.length / perRow);
  return y + rows * (chipH + gap) - gap + 6;
}

export interface TableCol {
  label: string;
  w: number;
  get: (row: any, i: number) => string;
  mono?: boolean;
  align?: 'left' | 'right';
}

/** Simple striped data table. `rowTone` may flag a row red/amber. */
export function drawTable(
  rd: ReportDoc,
  y: number,
  cols: TableCol[],
  rows: any[],
  rowTone?: (row: any, i: number) => 'bad' | 'warn' | null,
): number {
  const { doc, fill, ink, hairline } = rd;
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
    if ((c.align ?? (i === 0 ? 'left' : 'right')) === 'left') doc.text(c.label, cx + 4, y + headH / 2, { baseline: 'middle' });
    else doc.text(c.label, cx + c.w - 3, y + headH / 2, { align: 'right', baseline: 'middle' });
  });
  y += headH;

  const rowH = 9.5;
  rows.forEach((row, i) => {
    y = rd.ensure(y, rowH + 4);
    const tone = rowTone?.(row, i) ?? null;
    if (tone === 'bad') { fill(COLOR.redBg); doc.rect(X0, y, CONTENT_W, rowH, 'F'); }
    else if (tone === 'warn') { fill(COLOR.amberBg); doc.rect(X0, y, CONTENT_W, rowH, 'F'); }
    else if (i % 2 === 1) { fill(COLOR.rowAlt); doc.rect(X0, y, CONTENT_W, rowH, 'F'); }
    cols.forEach((c, ci) => {
      const cx = xOffsets[ci];
      const text = c.get(row, i);
      doc.setFont(c.mono ? 'courier' : 'helvetica', ci === 0 ? 'bold' : 'normal');
      doc.setFontSize(c.mono ? 8 : 8.5);
      ink(ci === 0 ? COLOR.ink : COLOR.inkSoft);
      if ((c.align ?? (ci === 0 ? 'left' : 'right')) === 'left') {
        doc.text(truncate(doc, text, c.w - 6), cx + 4, y + rowH / 2, { baseline: 'middle' });
      } else {
        doc.text(text, cx + c.w - 3, y + rowH / 2, { align: 'right', baseline: 'middle' });
      }
    });
    y += rowH;
  });
  hairline(y + 1.5);
  return y + 7;
}

function truncate(doc: jsPDF, text: string, maxWidth: number): string {
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && doc.getTextWidth(out + '…') > maxWidth) out = out.slice(0, -1);
  return out + '…';
}

export interface ChartSeries {
  label: string;
  color: RGB;
  /** Points in data space; x shared with the axis, y on this series' own scale. */
  points: { x: number; y: number }[];
  /** 'left' plots against the primary axis, 'right' against the secondary. */
  axis: 'left' | 'right';
  dashed?: boolean;
}

/**
 * Dual-axis line chart — built for "wheel-speed readback vs. ABS current":
 * commanded test speed on X, km/h readback on the left axis, amps on the
 * right axis, so a current spike shows against the speed trace.
 */
export function drawLineChart(
  rd: ReportDoc,
  y: number,
  opts: {
    x: number; w: number; h: number;
    xLabel: string; leftLabel: string; rightLabel?: string;
    series: ChartSeries[];
  },
): number {
  const { doc, fill, ink, stroke } = rd;
  const { x, w, h } = opts;
  const padL = 12, padR = opts.rightLabel ? 12 : 4, padT = 6, padB = 12;
  const plotX = x + padL, plotY = y + padT;
  const plotW = w - padL - padR, plotH = h - padT - padB;

  const allX = opts.series.flatMap(s => s.points.map(p => p.x));
  const xMin = Math.min(...allX, 0);
  const xMax = Math.max(...allX, 1);
  const axisRange = (which: 'left' | 'right') => {
    const ys = opts.series.filter(s => s.axis === which).flatMap(s => s.points.map(p => p.y));
    if (!ys.length) return [0, 1];
    const lo = Math.min(...ys, 0);
    const hi = Math.max(...ys, 1);
    return [lo, hi === lo ? lo + 1 : hi];
  };
  const [lMin, lMax] = axisRange('left');
  const [rMin, rMax] = axisRange('right');

  const sx = (v: number) => plotX + ((v - xMin) / (xMax - xMin || 1)) * plotW;
  const syL = (v: number) => plotY + plotH - ((v - lMin) / (lMax - lMin || 1)) * plotH;
  const syR = (v: number) => plotY + plotH - ((v - rMin) / (rMax - rMin || 1)) * plotH;

  // Plot frame + horizontal gridlines
  fill(COLOR.white);
  doc.rect(x, y, w, h, 'F');
  stroke(COLOR.hairline); doc.setLineWidth(0.25);
  for (let g = 0; g <= 4; g++) {
    const gy = plotY + (plotH / 4) * g;
    doc.line(plotX, gy, plotX + plotW, gy);
  }
  stroke(COLOR.gray2); doc.setLineWidth(0.4);
  doc.line(plotX, plotY, plotX, plotY + plotH);
  doc.line(plotX, plotY + plotH, plotX + plotW, plotY + plotH);

  // Axis ticks / labels
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6);
  ink(COLOR.inkSoft);
  for (let g = 0; g <= 4; g++) {
    const frac = g / 4;
    const gy = plotY + plotH - frac * plotH;
    doc.text((lMin + frac * (lMax - lMin)).toFixed(0), plotX - 1.5, gy, { align: 'right', baseline: 'middle' });
    if (opts.rightLabel) {
      doc.text((rMin + frac * (rMax - rMin)).toFixed(1), plotX + plotW + 1.5, gy, { baseline: 'middle' });
    }
  }
  for (let g = 0; g <= 4; g++) {
    const frac = g / 4;
    const gx = plotX + frac * plotW;
    doc.text((xMin + frac * (xMax - xMin)).toFixed(0), gx, plotY + plotH + 4, { align: 'center' });
  }
  doc.text(opts.xLabel, plotX + plotW / 2, y + h - 1.5, { align: 'center' });
  doc.setFontSize(6);
  doc.text(opts.leftLabel, x + 2.5, plotY - 2);
  if (opts.rightLabel) doc.text(opts.rightLabel, plotX + plotW + padR - 1, plotY - 2, { align: 'right' });

  // Series
  opts.series.forEach(s => {
    if (s.points.length === 0) return;
    const pts = [...s.points].sort((a, b) => a.x - b.x);
    const sy = s.axis === 'right' ? syR : syL;
    stroke(s.color); doc.setLineWidth(0.8);
    if (s.dashed && doc.setLineDashPattern) doc.setLineDashPattern([1, 1], 0);
    for (let i = 1; i < pts.length; i++) {
      doc.line(sx(pts[i - 1].x), sy(pts[i - 1].y), sx(pts[i].x), sy(pts[i].y));
    }
    if (doc.setLineDashPattern) doc.setLineDashPattern([], 0);
    fill(s.color);
    pts.forEach(p => doc.circle(sx(p.x), sy(p.y), 0.7, 'F'));
  });

  // Legend
  let lx = plotX;
  const ly = y + h + 3.5;
  doc.setFontSize(6.5);
  opts.series.forEach(s => {
    fill(s.color);
    doc.circle(lx + 1, ly - 0.6, 1, 'F');
    ink(COLOR.inkSoft);
    doc.text(s.label, lx + 3.5, ly);
    lx += 4 + doc.getTextWidth(s.label) + 6;
  });

  return y + h + 7;
}

export function drawFooter(rd: ReportDoc, label: string) {
  const { doc, ink, hairline } = rd;
  const footerY = PAGE_H - 14;
  hairline(footerY - 5);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
  ink(COLOR.gray2);
  doc.text(label, PAGE_W / 2, footerY, { align: 'center' });
}

/** Wrapped paragraph in the soft-ink body style. Returns the next y. */
export function drawParagraph(rd: ReportDoc, y: number, text: string, size = 8.5, color: RGB = COLOR.inkSoft): number {
  const { doc, ink } = rd;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(size);
  ink(color);
  const lines = doc.splitTextToSize(text, CONTENT_W);
  doc.text(lines, X0, y);
  return y + lines.length * (size * 0.42) + 3;
}
