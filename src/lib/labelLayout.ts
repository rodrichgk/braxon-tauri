// Label size + where the job number and QR sit on it.
// Position/size fields are in printer dots (203 dpi → 8 dots/mm), the same
// units ZPL `^FO` uses, so the <LabelDesigner> preview maps 1:1 to print.
// Label size is stored in mm (what the operator reads off the roll).
// Edited visually in <LabelDesigner>, persisted here, consumed by
// zplLabel.ts (direct print) and scanLabel.ts (PDF fallback).

import QRCode from 'qrcode';

export const DPMM = 8; // 203 dpi

export interface LabelLayout {
  /** Physical label stock, millimetres. */
  labelWmm: number;
  labelHmm: number;
  /** Job number: top-left of the ZPL character cell + cell height, dots. */
  numberX: number;
  numberY: number;
  numberFont: number;
  /** QR: top-left corner, dots. */
  qrX: number;
  qrY: number;
  /** Target QR box size in dots. Printed size is the largest whole-module
   *  multiple that fits this, so a longer URL never overflows the label. */
  qrSize: number;
}

export const DEFAULT_LAYOUT: LabelLayout = {
  labelWmm: 50,
  labelHmm: 40,
  numberX: 70,
  numberY: 16,
  numberFont: 54,
  qrX: 98,
  qrY: 96,
  qrSize: 208,
};

const KEY = 'braxonLabelLayout';

function clampNum(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

export function getLabelLayout(): LabelLayout {
  let s: Partial<LabelLayout> = {};
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) s = JSON.parse(raw);
  } catch {
    /* ignore — fall back to defaults */
  }
  const labelWmm = clampNum(s.labelWmm, 10, 120, DEFAULT_LAYOUT.labelWmm);
  const labelHmm = clampNum(s.labelHmm, 10, 120, DEFAULT_LAYOUT.labelHmm);
  const w = labelWmm * DPMM;
  const h = labelHmm * DPMM;
  return {
    labelWmm,
    labelHmm,
    numberX: clampNum(s.numberX, -40, w, DEFAULT_LAYOUT.numberX),
    numberY: clampNum(s.numberY, -40, h, DEFAULT_LAYOUT.numberY),
    numberFont: clampNum(s.numberFont, 12, 160, DEFAULT_LAYOUT.numberFont),
    qrX: clampNum(s.qrX, -40, w, DEFAULT_LAYOUT.qrX),
    qrY: clampNum(s.qrY, -40, h, DEFAULT_LAYOUT.qrY),
    qrSize: clampNum(s.qrSize, 80, Math.max(w, h), DEFAULT_LAYOUT.qrSize),
  };
}

export function setLabelLayout(layout: LabelLayout): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(layout));
  } catch {
    /* ignore */
  }
}

/** Real module count for `data` at ECC level M (what `^FDMA,` uses), so
 *  the preview and the print agree on the QR's on-label size. */
export function qrModuleCount(data: string): number {
  try {
    return QRCode.create(data, { errorCorrectionLevel: 'M' }).modules.size;
  } catch {
    return 45; // ~version 7, a sane mid value if creation fails
  }
}

/** Largest whole-module magnification whose QR fits `targetDots`. */
export function qrMagFor(modules: number, targetDots: number): number {
  return Math.max(2, Math.min(14, Math.floor(targetDots / modules)));
}
