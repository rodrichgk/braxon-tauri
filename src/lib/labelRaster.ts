// Renders the whole label to a 1-bit bitmap and packs it as a ZPL `^GFA`
// graphic. This makes the <LabelDesigner> preview and the printed label
// identical pixel-for-pixel — no `^A0` font metrics or `^BQ` origin quirks
// to diverge from what's on screen.

import QRCode from 'qrcode';
import { DPMM, qrMagFor, type LabelLayout } from './labelLayout';

export function labelDots(layout: LabelLayout) {
  return {
    w: Math.max(8, Math.round(layout.labelWmm * DPMM)),
    h: Math.max(8, Math.round(layout.labelHmm * DPMM)),
  };
}

/** Canvas font shared by the raster and the designer's drag handles, so a
 *  measured text width matches what actually renders. Consolas ships on
 *  every Windows box (WebView2 = Chromium on Windows). */
export const LABEL_FONT = (px: number) => `bold ${px}px Consolas, "Courier New", monospace`;

/** The label as it will print: white ground, black number, black QR, at
 *  1 canvas px per printer dot. */
export function renderLabelCanvas(layout: LabelLayout, jobNumber: string, qrUrl: string): HTMLCanvasElement {
  const { w, h } = labelDots(layout);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#000';

  // Job number
  ctx.font = LABEL_FONT(layout.numberFont);
  ctx.textBaseline = 'top';
  ctx.fillText(jobNumber, layout.numberX, layout.numberY);

  // QR — draw modules straight from the matrix (synchronous, exact size)
  try {
    const qr = QRCode.create(qrUrl, { errorCorrectionLevel: 'M' });
    const n = qr.modules.size;
    const bits = qr.modules.data;
    const mag = qrMagFor(n, layout.qrSize);
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        if (bits[row * n + col]) {
          ctx.fillRect(layout.qrX + col * mag, layout.qrY + row * mag, mag, mag);
        }
      }
    }
  } catch {
    /* leave the QR area blank if creation fails */
  }

  return canvas;
}

/** Pack a canvas into a `^GFA` graphic field (row-run + repeat-row
 *  compressed — a mostly-white label ends up small). */
export function canvasToZplGfa(canvas: HTMLCanvasElement): string {
  const w = canvas.width;
  const h = canvas.height;
  const img = canvas.getContext('2d')!.getImageData(0, 0, w, h).data;
  const rowBytes = Math.ceil(w / 8);
  const total = rowBytes * h;

  let data = '';
  let prevHex: string | null = null;
  for (let y = 0; y < h; y++) {
    const bytes = new Uint8Array(rowBytes);
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const opaque = img[i + 3] >= 128;
      const lum = opaque ? img[i] * 0.299 + img[i + 1] * 0.587 + img[i + 2] * 0.114 : 255;
      if (lum < 128) bytes[x >> 3] |= 0x80 >> (x & 7);
    }
    let hex = '';
    for (let b = 0; b < rowBytes; b++) hex += bytes[b].toString(16).padStart(2, '0');
    hex = hex.toUpperCase();

    if (hex === prevHex) {
      data += ':'; // repeat previous row
      continue;
    }
    prevHex = hex;
    const trimmed = hex.replace(/(00)+$/, '');
    // ',' = fill the rest of this row with white
    data += trimmed.length === hex.length ? hex : `${trimmed},`;
  }
  return `^GFA,${total},${total},${rowBytes},${data}`;
}
