import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  XMarkIcon,
  QrCodeIcon,
  ComputerDesktopIcon,
  ArrowPathIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { useQrScanner } from '@/hooks/useQrScanner';
import { parseScan, getLabelPrinter, setLabelPrinter, type ParsedScan } from '@/lib/braxonScan';
import { useTestSession } from '@/contexts/TestSessionContext';
import LabelDesigner from './LabelDesigner';
import PrinterPanel from './PrinterPanel';

interface ActiveClient {
  pcId: string;
  hostname?: string;
  osUser?: string;
  appVersion?: string;
  lastSeen?: string;
  isMe: boolean;
}

export default function QrScannerPanel({
  open,
  onClose,
  onResult,
}: {
  open: boolean;
  onClose: () => void;
  onResult: (scan: ParsedScan) => void;
}) {
  const { t } = useTranslation();
  const { clientIdentity, scanServiceUrl, setScanServiceUrl } = useTestSession();
  const [deviceId, setDeviceId] = useState<string | undefined>();
  const [rejected, setRejected] = useState(false);
  const [clients, setClients] = useState<ActiveClient[]>([]);
  const [urlDraft, setUrlDraft] = useState(scanServiceUrl);
  const [printerDraft, setPrinterDraft] = useState(getLabelPrinter());
  const [designerOpen, setDesignerOpen] = useState(false);
  const [printerToolsOpen, setPrinterToolsOpen] = useState(false);

  const { videoRef, devices, error, streaming } = useQrScanner({
    active: open,
    deviceId,
    onDecode: text => {
      const parsed = parseScan(text);
      if (parsed) {
        setRejected(false);
        onResult(parsed);
        onClose();
      } else {
        setRejected(true);
      }
    },
  });

  useEffect(() => {
    setUrlDraft(scanServiceUrl);
    setPrinterDraft(getLabelPrinter());
  }, [scanServiceUrl, open]);

  const loadClients = () => {
    invoke<ActiveClient[]>('braxon_active_clients').then(setClients).catch(() => setClients([]));
  };
  useEffect(() => {
    if (!open) return;
    loadClients();
    const id = setInterval(loadClients, 15_000);
    return () => clearInterval(id);
  }, [open]);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          key="panel"
          initial={{ scale: 0.96, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.96, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <QrCodeIcon className="w-4 h-4" />
              {t('scan.scanner_title')}
            </span>
            <button type="button" onClick={onClose} className="text-text-tertiary hover:text-text-primary transition-colors">
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 space-y-3">
            {/* Camera */}
            <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-black">
              <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
              {streaming && (
                <div className="pointer-events-none absolute inset-6 border-2 border-accent/70 rounded-lg" />
              )}
              {error && (
                <div className="absolute inset-0 flex items-center justify-center p-4 text-center">
                  <p className="text-[11px] text-text-secondary">
                    {error === 'permission-denied'
                      ? t('scan.camera_denied')
                      : error === 'no-camera'
                        ? t('scan.camera_none')
                        : error}
                  </p>
                </div>
              )}
            </div>

            {rejected && (
              <p className="text-[11px] text-warning">{t('scan.unrecognized')}</p>
            )}

            {devices.length > 1 && (
              <select
                value={deviceId ?? ''}
                onChange={e => setDeviceId(e.target.value || undefined)}
                className="w-full bg-elevated border border-border rounded-lg px-2.5 py-1.5 text-[11px] text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/40"
              >
                <option value="">{t('scan.camera_default')}</option>
                {devices.map(d => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
                ))}
              </select>
            )}

            {/* This PC */}
            <div className="rounded-lg border border-border bg-elevated p-2.5 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-text-secondary">
                <ComputerDesktopIcon className="w-3.5 h-3.5" />
                {t('scan.this_pc')}
              </div>
              <p className="text-[11px] text-text-primary">
                {clientIdentity?.hostname ?? '…'}
                {clientIdentity && (
                  <span className="text-text-tertiary"> · {clientIdentity.pcId.slice(0, 8)}</span>
                )}
              </p>
              <label className="block text-[9px] text-text-tertiary">{t('scan.service_url_hint')}</label>
              <input
                value={urlDraft}
                onChange={e => setUrlDraft(e.target.value)}
                onBlur={() => urlDraft !== scanServiceUrl && setScanServiceUrl(urlDraft)}
                spellCheck={false}
                placeholder="https://192.168.77.182:8481"
                className="w-full bg-card border border-border rounded-md px-2 py-1 text-[10px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent/40"
              />
              <label className="block text-[9px] text-text-tertiary pt-1">{t('scan.printer_hint')}</label>
              <input
                value={printerDraft}
                onChange={e => setPrinterDraft(e.target.value)}
                onBlur={() => { if (printerDraft !== getLabelPrinter()) setLabelPrinter(printerDraft); }}
                spellCheck={false}
                placeholder="192.168.77.32:9100"
                className="w-full bg-card border border-border rounded-md px-2 py-1 text-[10px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent/40"
              />
              <div className="mt-1 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setDesignerOpen(true)}
                  className="flex-1 text-[10px] font-medium px-2 py-1 rounded-md bg-card border border-border text-text-secondary hover:text-text-primary transition-colors"
                >
                  {t('scan.layout_open')}
                </button>
                <button
                  type="button"
                  onClick={() => setPrinterToolsOpen(true)}
                  className="flex-1 text-[10px] font-medium px-2 py-1 rounded-md bg-card border border-border text-text-secondary hover:text-text-primary transition-colors"
                >
                  {t('scan.printer_tools')}
                </button>
              </div>
            </div>

            {/* Clients online */}
            <div className="rounded-lg border border-border bg-elevated p-2.5 space-y-1">
              <div className="flex items-center justify-between text-[11px] font-semibold text-text-secondary">
                <span>{t('scan.clients_online', { count: clients.length })}</span>
                <button type="button" onClick={loadClients} className="text-text-tertiary hover:text-text-primary transition-colors">
                  <ArrowPathIcon className="w-3 h-3" />
                </button>
              </div>
              {clients.map(c => (
                <div key={c.pcId} className="flex items-center gap-1.5 text-[11px] text-text-primary">
                  <span className="w-1.5 h-1.5 rounded-full bg-success shrink-0" />
                  <span className="truncate">{c.hostname || c.pcId.slice(0, 8)}</span>
                  {c.isMe && <CheckCircleIcon className="w-3 h-3 text-accent shrink-0" />}
                  {c.appVersion && <span className="text-text-tertiary ml-auto shrink-0">v{c.appVersion}</span>}
                </div>
              ))}
              {clients.length === 0 && (
                <p className="text-[10px] text-text-tertiary">{t('scan.clients_none')}</p>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
      <LabelDesigner open={designerOpen} onClose={() => setDesignerOpen(false)} />
      <PrinterPanel open={printerToolsOpen} onClose={() => setPrinterToolsOpen(false)} />
    </AnimatePresence>
  );
}
