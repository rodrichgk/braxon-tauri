// Thermal label PDF fallback for when no network printer is configured.
// Same bitmap the direct-ZPL path prints (labelRaster.ts), dropped onto a
// page the exact size of the label. Uses jsPDF (already a dependency).

import { jsPDF } from 'jspdf';
import { getLabelLayout, type LabelLayout } from './labelLayout';
import { renderLabelCanvas } from './labelRaster';

function z(s: string): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

export interface ScanLabelOptions {
  /** The URL/token encoded in the QR. */
  value: string;
  /** The job number. */
  jobNumber: string;
  /** Download name, without extension. */
  filename: string;
}

export async function printScanLabel(
  { value, jobNumber, filename }: ScanLabelOptions,
  layout: LabelLayout = getLabelLayout(),
): Promise<void> {
  const canvas = renderLabelCanvas(layout, z(jobNumber).slice(0, 24), z(value));
  const wmm = Math.max(layout.labelWmm, layout.labelHmm);
  const hmm = Math.min(layout.labelWmm, layout.labelHmm);

  const doc = new jsPDF({
    orientation: layout.labelWmm >= layout.labelHmm ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [hmm, wmm],
  });
  doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, layout.labelWmm, layout.labelHmm);
  doc.autoPrint();
  doc.save(`${filename}.pdf`);
}
