// Zebra maintenance / alignment commands, sent to the printer's raw socket
// (port 9100) via the `print_label_raw` / `printer_query` Tauri commands.
// These are the standard fixes for "labels drifted / printing off the
// edge" — the same thing an on-site tech would do over a remote session.

/** Media re-calibration — the printer feeds a label or two and re-learns
 *  the label length and the gap position. The main misalignment fix. */
export const CALIBRATE = '~JC';

/** Persist the printer's current settings to non-volatile memory. */
export const SAVE_SETTINGS = '^XA^JUS^XZ';

/** Model + firmware + resolution + memory. */
export const HOST_INFO = '~HI';
/** Status: paper out, pause, buffer, errors, detected label length… */
export const HOST_STATUS = '~HS';

/** Clear any saved top/left print-position offset and re-store the label
 *  size, then save. Undoes a bad nudge. */
export function resetPrintPosition(widthDots: number, heightDots: number): string {
  return `^XA^LH0,0^LT0^LS0^PW${Math.round(widthDots)}^LL${Math.round(heightDots)}^JUS^XZ`;
}

/** Shift every print up/down (`top`, ±120 dots) and left/right (`left`,
 *  ±9999 dots) into the printable area, then save it into the printer. */
export function setPrintPosition(topDots: number, leftDots: number): string {
  const top = Math.max(-120, Math.min(120, Math.round(topDots)));
  const left = Math.max(-9999, Math.min(9999, Math.round(leftDots)));
  return `^XA^LT${top}^LS${left}^JUS^XZ`;
}

/** A label that's just an outer border + a box in every corner + a centre
 *  label, so anything outside the printable zone is obvious. */
export function alignmentTest(widthDots: number, heightDots: number): string {
  const w = Math.round(widthDots);
  const h = Math.round(heightDots);
  const c = 48;
  return [
    '^XA',
    `^PW${w}`,
    `^LL${h}`,
    '^LH0,0',
    `^FO0,0^GB${w},${h},4^FS`,
    `^FO0,0^GB${c},${c},4^FS`,
    `^FO${w - c},0^GB${c},${c},4^FS`,
    `^FO0,${h - c}^GB${c},${c},4^FS`,
    `^FO${w - c},${h - c}^GB${c},${c},4^FS`,
    `^FO${Math.round(w / 2) - 72},${Math.round(h / 2) - 15}^A0N,30,30^FDALIGN OK^FS`,
    '^PQ1',
    '^XZ',
  ].join('\n');
}
