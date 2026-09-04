import { useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { XMarkIcon, PrinterIcon, LinkIcon, DocumentArrowDownIcon } from '@heroicons/react/24/outline';
import QrCode from './QrCode';
import { useTestSession } from '@/contexts/TestSessionContext';
import {
  buildScanUrl, buildScanToken, getLabelPrinter, parsePrinterTarget, type ScanEntity,
} from '@/lib/braxonScan';
import { printScanLabel } from '@/lib/scanLabel';
import { buildQrLabelZpl } from '@/lib/zplLabel';

export default function ScanModal({
  open,
  onClose,
  entity,
  entityKey,
  title,
  subtitleLines = [],
}: {
  open: boolean;
  onClose: () => void;
  entity: ScanEntity;
  entityKey: string;
  title: string;
  subtitleLines?: string[];
}) {
  const { t } = useTranslation();
  const { clientIdentity, scanServiceUrl } = useTestSession();
  const [copied, setCopied] = useState(false);
  const [printing, setPrinting] = useState(false);

  const { qrValue, phoneReady } = useMemo(() => {
    if (clientIdentity?.pcId) {
      return {
        qrValue: buildScanUrl(scanServiceUrl, clientIdentity.pcId, entity, entityKey, title),
        phoneReady: true,
      };
    }
    return { qrValue: buildScanToken(entity, entityKey), phoneReady: false };
  }, [clientIdentity?.pcId, scanServiceUrl, entity, entityKey, title]);

  if (!open) return null;

  // Only the job number goes on the sticker — everything else stays on screen.
  const jobNumber = title || entityKey;

  const savePdf = () =>
    printScanLabel({ value: qrValue, jobNumber, filename: `label-${entity}-${entityKey}` });

  const doPrint = async () => {
    setPrinting(true);
    try {
      const printer = parsePrinterTarget(getLabelPrinter());
      if (printer) {
        const zpl = buildQrLabelZpl({ qr: qrValue, jobNumber });
        await invoke('print_label_raw', { host: printer.host, port: printer.port, data: zpl });
        toast.success(t('scan.print_sent', { host: printer.host }));
      } else {
        await savePdf();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setPrinting(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(qrValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the QR is still on screen */
    }
  };

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
          className="w-full max-w-xs bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-semibold text-text-primary truncate">{title || entityKey}</span>
            <button type="button" onClick={onClose} className="text-text-tertiary hover:text-text-primary transition-colors shrink-0">
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 space-y-3">
            <div className="bg-white rounded-xl p-3 mx-auto w-fit">
              <QrCode value={qrValue} size={200} />
            </div>

            <div className="text-center space-y-0.5">
              <p className="text-[11px] font-medium text-text-secondary">{t(`scan.entity_${entity}`)}</p>
              {subtitleLines.filter(Boolean).map((l, i) => (
                <p key={i} className="text-[11px] text-text-tertiary">{l}</p>
              ))}
              {phoneReady ? (
                <p className="text-[10px] text-text-tertiary pt-1">
                  {t('scan.opens_on', { host: clientIdentity?.hostname ?? '' })}
                </p>
              ) : (
                <p className="text-[10px] text-warning pt-1">{t('scan.phone_unavailable')}</p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={doPrint}
                disabled={printing}
                className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-semibold px-2.5 py-2 rounded-lg bg-accent text-white hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                <PrinterIcon className="w-3.5 h-3.5" />
                {printing ? t('common.loading') : t('scan.print_label')}
              </button>
              <button
                type="button"
                onClick={savePdf}
                title={t('scan.save_pdf')}
                className="flex items-center justify-center px-2 py-2 rounded-lg bg-elevated border border-border text-text-secondary hover:text-text-primary transition-colors"
              >
                <DocumentArrowDownIcon className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={copy}
                title={copied ? t('scan.copied') : t('scan.copy_link')}
                className={`flex items-center justify-center px-2 py-2 rounded-lg border transition-colors ${
                  copied
                    ? 'bg-success/10 border-success/20 text-success'
                    : 'bg-elevated border-border text-text-secondary hover:text-text-primary'
                }`}
              >
                <LinkIcon className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[9px] text-text-tertiary text-center">
              {parsePrinterTarget(getLabelPrinter())
                ? t('scan.printer_set', { host: parsePrinterTarget(getLabelPrinter())!.host })
                : t('scan.printer_unset')}
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
