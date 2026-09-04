// ZPL for the shop's Zebra ZD420 (203 dpi → 8 dots/mm). Sent as raw bytes
// to the printer's port 9100 by the `print_label_raw` Tauri command — no
// driver, no PDF.
//
// The label is rendered to a bitmap (labelRaster.ts) exactly as the
// <LabelDesigner> preview shows it, then sent as one `^GFA` graphic — so
// what you position on screen is what prints, no `^A0`/`^BQ` translation.

import { getLabelLayout, type LabelLayout } from './labelLayout';
import { renderLabelCanvas, canvasToZplGfa, labelDots } from './labelRaster';

function z(s: string): string {
  return (s ?? '').replace(/[\^~]/g, ' ').trim();
}

export interface ZplLabelData {
  /** The value encoded in the QR (the scan URL). */
  qr: string;
  /** The job number. */
  jobNumber: string;
}

export function buildQrLabelZpl(
  { qr, jobNumber }: ZplLabelData,
  layout: LabelLayout = getLabelLayout(),
): string {
  const { w, h } = labelDots(layout);
  const canvas = renderLabelCanvas(layout, z(jobNumber).slice(0, 24), z(qr));
  return [
    '^XA',
    `^PW${w}`,
    `^LL${h}`,
    '^LH0,0',
    `^FO0,0${canvasToZplGfa(canvas)}^FS`,
    '^PQ1',
    '^XZ',
  ].join('\n');
}
