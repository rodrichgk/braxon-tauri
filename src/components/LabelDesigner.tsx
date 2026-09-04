import { useCallback, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { XMarkIcon, PrinterIcon, ArrowsPointingInIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { useTestSession } from '@/contexts/TestSessionContext';
import { buildScanUrl, getLabelPrinter, parsePrinterTarget } from '@/lib/braxonScan';
import {
  DEFAULT_LAYOUT, DPMM, getLabelLayout, setLabelLayout, qrModuleCount, qrMagFor, type LabelLayout,
} from '@/lib/labelLayout';
import { renderLabelCanvas, labelDots, LABEL_FONT } from '@/lib/labelRaster';
import { buildQrLabelZpl } from '@/lib/zplLabel';
import { printScanLabel } from '@/lib/scanLabel';

const SAMPLE_JOB = '17532301';
// Full-length placeholder so the preview QR has the same module count as a
// real print even before this machine's identity has loaded.
const PLACEHOLDER_PC = '00000000-0000-0000-0000-000000000000';

type DragKind = 'qr' | 'number';

// one shared offscreen ctx for measuring the number's rendered width
let measureCtx: CanvasRenderingContext2D | null = null;
function measureNumber(text: string, fontPx: number): number {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  if (!measureCtx) return text.length * fontPx * 0.6;
  measureCtx.font = LABEL_FONT(fontPx);
  return measureCtx.measureText(text).width;
}

export default function LabelDesigner({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { clientIdentity, scanServiceUrl } = useTestSession();
  const [layout, setLayout] = useState<LabelLayout>(() => getLabelLayout());

  const { w, h } = labelDots(layout);
  const S = Math.min(2, 440 / w); // fit the preview to the modal

  const sampleUrl = useMemo(
    () => buildScanUrl(scanServiceUrl, clientIdentity?.pcId || PLACEHOLDER_PC, 'job', SAMPLE_JOB, SAMPLE_JOB),
    [scanServiceUrl, clientIdentity?.pcId],
  );
  const modules = useMemo(() => qrModuleCount(sampleUrl), [sampleUrl]);
  const qrDots = modules * qrMagFor(modules, layout.qrSize);
  const numberW = measureNumber(SAMPLE_JOB, layout.numberFont);

  // The preview IS the print — same renderer, just shown scaled.
  const previewSrc = useMemo(
    () => renderLabelCanvas(layout, SAMPLE_JOB, sampleUrl).toDataURL('image/png'),
    [layout, sampleUrl],
  );

  const dragRef = useRef<null | { kind: DragKind; cx: number; cy: number; ox: number; oy: number }>(null);

  const onMove = useCallback((e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = (e.clientX - d.cx) / S;
    const dy = (e.clientY - d.cy) / S;
    const clamp = (v: number, hi: number) => Math.round(Math.min(hi, Math.max(-40, v)));
    setLayout(l =>
      d.kind === 'qr'
        ? { ...l, qrX: clamp(d.ox + dx, w), qrY: clamp(d.oy + dy, h) }
        : { ...l, numberX: clamp(d.ox + dx, w), numberY: clamp(d.oy + dy, h) },
    );
  }, [S, w, h]);

  const onUp = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  }, [onMove]);

  const startDrag = (kind: DragKind) => (e: React.PointerEvent) => {
    e.preventDefault();
    dragRef.current = {
      kind,
      cx: e.clientX,
      cy: e.clientY,
      ox: kind === 'qr' ? layout.qrX : layout.numberX,
      oy: kind === 'qr' ? layout.qrY : layout.numberY,
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const patch = (p: Partial<LabelLayout>) => setLayout(l => ({ ...l, ...p }));
  const centerQr = () => patch({ qrX: Math.round((w - qrDots) / 2) });
  const centerNumber = () => patch({ numberX: Math.round((w - numberW) / 2) });

  const save = () => {
    setLabelLayout(layout);
    toast.success(t('scan.layout_saved'));
    onClose();
  };

  const testPrint = async () => {
    try {
      const printer = parsePrinterTarget(getLabelPrinter());
      if (printer) {
        await invoke('print_label_raw', {
          host: printer.host,
          port: printer.port,
          data: buildQrLabelZpl({ qr: sampleUrl, jobNumber: SAMPLE_JOB }, layout),
        });
        toast.success(t('scan.print_sent', { host: printer.host }));
      } else {
        await printScanLabel({ value: sampleUrl, jobNumber: SAMPLE_JOB, filename: 'label-preview' }, layout);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  if (!open) return null;

  const mm = (dots: number) => (dots / DPMM).toFixed(1);
  const gapDots = layout.qrY - (layout.numberY + layout.numberFont);

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-[60] flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          key="panel"
          initial={{ scale: 0.96, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.96, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          className="w-full max-w-xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-semibold text-text-primary">{t('scan.layout_title')}</span>
            <button type="button" onClick={onClose} className="text-text-tertiary hover:text-text-primary transition-colors">
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 space-y-3">
            <div className="flex items-center gap-3 text-[11px] text-text-secondary">
              <label className="flex items-center gap-1.5">
                {t('scan.label_width')}
                <input
                  type="number" min={10} max={120} value={layout.labelWmm}
                  onChange={e => patch({ labelWmm: Number(e.target.value) || DEFAULT_LAYOUT.labelWmm })}
                  className="w-14 bg-elevated border border-border rounded-md px-1.5 py-1 text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/40"
                />
                mm
              </label>
              <label className="flex items-center gap-1.5">
                {t('scan.label_height')}
                <input
                  type="number" min={10} max={120} value={layout.labelHmm}
                  onChange={e => patch({ labelHmm: Number(e.target.value) || DEFAULT_LAYOUT.labelHmm })}
                  className="w-14 bg-elevated border border-border rounded-md px-1.5 py-1 text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/40"
                />
                mm
              </label>
            </div>

            {/* Preview — the actual rendered label, scaled. Drag handles float on top. */}
            <div className="flex justify-center">
              <div
                className="relative bg-white rounded-sm shadow-inner touch-none select-none"
                style={{ width: w * S, height: h * S }}
              >
                <img
                  src={previewSrc}
                  alt=""
                  draggable={false}
                  className="absolute inset-0 w-full h-full"
                  style={{ imageRendering: 'pixelated' }}
                />
                <div className="absolute inset-y-0 left-1/2 w-px bg-accent/20" />
                <div className="absolute inset-x-0 top-1/2 h-px bg-accent/20" />

                <div
                  onPointerDown={startDrag('number')}
                  title={t('scan.number_size')}
                  className="absolute cursor-grab active:cursor-grabbing border border-dashed border-accent/70 hover:bg-accent/10"
                  style={{
                    left: layout.numberX * S,
                    top: layout.numberY * S,
                    width: Math.max(8, numberW) * S,
                    height: layout.numberFont * S,
                  }}
                />
                <div
                  onPointerDown={startDrag('qr')}
                  title={t('scan.qr_size')}
                  className="absolute cursor-grab active:cursor-grabbing border border-dashed border-accent/70 hover:bg-accent/10"
                  style={{ left: layout.qrX * S, top: layout.qrY * S, width: qrDots * S, height: qrDots * S }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-[10px] text-text-tertiary tabular-nums">
              <span>{t('scan.layout_hint')}</span>
              <span>{t('scan.gap')}: {gapDots >= 0 ? mm(gapDots) : `−${mm(-gapDots)}`} mm</span>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-[11px] text-text-secondary">
                <span className="w-20 shrink-0">{t('scan.qr_size')}</span>
                <input
                  type="range" min={96} max={Math.max(w, h)} step={4} value={layout.qrSize}
                  onChange={e => patch({ qrSize: Number(e.target.value) })}
                  className="flex-1 accent-accent"
                />
                <span className="w-12 text-right tabular-nums text-text-tertiary">{mm(qrDots)} mm</span>
              </label>
              <label className="flex items-center gap-2 text-[11px] text-text-secondary">
                <span className="w-20 shrink-0">{t('scan.number_size')}</span>
                <input
                  type="range" min={20} max={110} value={layout.numberFont}
                  onChange={e => patch({ numberFont: Number(e.target.value) })}
                  className="flex-1 accent-accent"
                />
                <span className="w-12 text-right tabular-nums text-text-tertiary">{mm(layout.numberFont)} mm</span>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button" onClick={centerQr}
                className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-elevated border border-border text-text-secondary hover:text-text-primary transition-colors"
              >
                <ArrowsPointingInIcon className="w-3.5 h-3.5" /> {t('scan.center_qr')}
              </button>
              <button
                type="button" onClick={centerNumber}
                className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-elevated border border-border text-text-secondary hover:text-text-primary transition-colors"
              >
                <ArrowsPointingInIcon className="w-3.5 h-3.5" /> {t('scan.center_number')}
              </button>
              <button
                type="button" onClick={() => setLayout({ ...DEFAULT_LAYOUT })}
                className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-elevated border border-border text-text-tertiary hover:text-text-primary transition-colors"
              >
                <ArrowPathIcon className="w-3.5 h-3.5" /> {t('common.reset')}
              </button>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button" onClick={testPrint}
                className="flex items-center justify-center gap-1.5 text-[11px] font-medium px-2.5 py-2 rounded-lg bg-elevated border border-border text-text-secondary hover:text-text-primary transition-colors"
              >
                <PrinterIcon className="w-3.5 h-3.5" /> {t('scan.test_print')}
              </button>
              <div className="flex-1" />
              <button
                type="button" onClick={onClose}
                className="text-[11px] font-medium px-3 py-2 rounded-lg text-text-tertiary hover:text-text-primary transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button" onClick={save}
                className="text-[11px] font-semibold px-3 py-2 rounded-lg bg-accent text-white hover:opacity-90 transition-opacity"
              >
                {t('common.save')}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
