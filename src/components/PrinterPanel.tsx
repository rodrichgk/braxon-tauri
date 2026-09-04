import { useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  XMarkIcon, AdjustmentsHorizontalIcon, ArrowPathIcon, Square3Stack3DIcon, InformationCircleIcon,
} from '@heroicons/react/24/outline';
import { getLabelPrinter, setLabelPrinter, parsePrinterTarget } from '@/lib/braxonScan';
import { getLabelLayout } from '@/lib/labelLayout';
import { labelDots } from '@/lib/labelRaster';
import {
  CALIBRATE, HOST_INFO, HOST_STATUS, resetPrintPosition, setPrintPosition, alignmentTest,
} from '@/lib/zebra';

export default function PrinterPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [addr, setAddr] = useState(getLabelPrinter());
  const [top, setTop] = useState(0);
  const [left, setLeft] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [info, setInfo] = useState('');

  const target = parsePrinterTarget(addr);
  const { w, h } = labelDots(getLabelLayout());

  const send = async (label: string, zpl: string) => {
    if (!target) { toast.error(t('scan.printer_bad_addr')); return; }
    setBusy(label);
    try {
      await invoke('print_label_raw', { host: target.host, port: target.port, data: zpl });
      toast.success(t('scan.printer_sent'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const queryInfo = async () => {
    if (!target) { toast.error(t('scan.printer_bad_addr')); return; }
    setBusy('info');
    setInfo('');
    try {
      const out = await invoke<string>('printer_query', {
        host: target.host, port: target.port, data: `${HOST_INFO}\r\n${HOST_STATUS}\r\n`, readMs: 2500,
      });
      setInfo(out || t('scan.printer_no_reply'));
    } catch (e) {
      setInfo(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  if (!open) return null;

  const Btn = ({ id, onClick, icon, children }: {
    id: string; onClick: () => void; icon: React.ReactNode; children: React.ReactNode;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={busy !== null}
      className="flex items-center gap-2 text-[11px] font-medium px-2.5 py-2 rounded-lg bg-elevated border border-border text-text-secondary hover:text-text-primary hover:border-accent/30 transition-colors disabled:opacity-50"
    >
      {busy === id ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : icon}
      {children}
    </button>
  );

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-[60] flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          key="panel"
          initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-semibold text-text-primary">{t('scan.printer_tools')}</span>
            <button type="button" onClick={onClose} className="text-text-tertiary hover:text-text-primary transition-colors">
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 space-y-3">
            <div>
              <label className="block text-[10px] text-text-tertiary mb-1">{t('scan.printer_hint')}</label>
              <input
                value={addr}
                onChange={e => setAddr(e.target.value)}
                onBlur={() => { if (addr !== getLabelPrinter()) setLabelPrinter(addr); }}
                spellCheck={false}
                placeholder="192.168.77.32:9100"
                className="w-full bg-elevated border border-border rounded-md px-2 py-1.5 text-[11px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent/40"
              />
            </div>

            <div className="grid grid-cols-1 gap-1.5">
              <Btn id="cal" onClick={() => send('cal', CALIBRATE)} icon={<AdjustmentsHorizontalIcon className="w-3.5 h-3.5" />}>
                {t('scan.calibrate')}
              </Btn>
              <p className="text-[9px] text-text-tertiary -mt-0.5 px-1">{t('scan.calibrate_hint')}</p>
              <Btn id="test" onClick={() => send('test', alignmentTest(w, h))} icon={<Square3Stack3DIcon className="w-3.5 h-3.5" />}>
                {t('scan.align_test')}
              </Btn>
              <Btn id="reset" onClick={() => send('reset', resetPrintPosition(w, h))} icon={<ArrowPathIcon className="w-3.5 h-3.5" />}>
                {t('scan.reset_position')}
              </Btn>
            </div>

            <div className="rounded-lg border border-border bg-elevated p-2.5 space-y-2">
              <div className="text-[11px] font-semibold text-text-secondary">{t('scan.nudge_title')}</div>
              <div className="flex items-center gap-2 text-[11px] text-text-secondary">
                <label className="flex items-center gap-1">
                  {t('scan.nudge_top')}
                  <input
                    type="number" min={-120} max={120} value={top}
                    onChange={e => setTop(Number(e.target.value) || 0)}
                    className="w-16 bg-card border border-border rounded-md px-1.5 py-1 text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/40"
                  />
                </label>
                <label className="flex items-center gap-1">
                  {t('scan.nudge_left')}
                  <input
                    type="number" min={-400} max={400} value={left}
                    onChange={e => setLeft(Number(e.target.value) || 0)}
                    className="w-16 bg-card border border-border rounded-md px-1.5 py-1 text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/40"
                  />
                </label>
              </div>
              <p className="text-[9px] text-text-tertiary">{t('scan.nudge_hint')}</p>
              <button
                type="button"
                onClick={() => send('nudge', setPrintPosition(top, left))}
                disabled={busy !== null}
                className="w-full text-[11px] font-semibold px-2.5 py-1.5 rounded-md bg-accent text-white hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {t('scan.apply_save')}
              </button>
            </div>

            <Btn id="info" onClick={queryInfo} icon={<InformationCircleIcon className="w-3.5 h-3.5" />}>
              {t('scan.printer_info')}
            </Btn>
            {info && (
              <pre className="text-[10px] text-text-secondary bg-elevated border border-border rounded-lg p-2 max-h-40 overflow-auto whitespace-pre-wrap font-mono">
                {info}
              </pre>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
