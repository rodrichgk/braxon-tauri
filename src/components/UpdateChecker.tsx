import { useState, useEffect } from 'react';
import { checkUpdate, installUpdate, onUpdaterEvent } from '@tauri-apps/api/updater';
import { relaunch } from '@tauri-apps/api/process';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowDownTrayIcon, XMarkIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { useTranslation } from 'react-i18next';

type Status = 'idle' | 'available' | 'downloading' | 'ready' | 'error';

export default function UpdateChecker() {
  const { t } = useTranslation();
  const [status, setStatus]       = useState<Status>('idle');
  const [version, setVersion]     = useState('');
  const [notes, setNotes]         = useState('');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    checkUpdate()
      .then(({ shouldUpdate, manifest }) => {
        if (shouldUpdate && manifest) {
          setVersion(manifest.version);
          setNotes(manifest.body ?? '');
          setStatus('available');
        }
      })
      .catch(() => {}); // silently ignore: offline, wrong URL, dev mode, etc.
  }, []);

  const handleInstall = async () => {
    setStatus('downloading');

    const unlisten = await onUpdaterEvent(({ status: s, error }) => {
      if (s === 'DONE') { setStatus('ready'); unlisten(); }
      if (s === 'ERROR') { console.error('Updater error:', error); setStatus('error'); unlisten(); }
    });

    try {
      await installUpdate();
    } catch (e) {
      console.error('installUpdate failed:', e);
      setStatus('error');
    }
  };

  const visible = !dismissed && status !== 'idle';

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="update-banner"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
          className="overflow-hidden shrink-0"
        >
          <div className="flex items-center gap-3 px-4 py-2 bg-accent/10 border-b border-accent/20 text-xs">

            {status === 'ready' && (
              <>
                <ArrowPathIcon className="w-4 h-4 text-success shrink-0" />
                <span className="text-success font-medium flex-1">
                  {t('update.ready')} — BRAXON v{version}
                </span>
                <button
                  onClick={() => relaunch()}
                  className="btn-success text-[11px] px-3 py-1"
                >
                  {t('update.restart')}
                </button>
              </>
            )}

            {status === 'downloading' && (
              <>
                <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin shrink-0" />
                <span className="text-accent flex-1">
                  {t('update.downloading')} BRAXON v{version}
                </span>
              </>
            )}

            {status === 'error' && (
              <>
                <span className="text-danger flex-1">{t('update.error')}</span>
                <button onClick={() => setStatus('available')} className="btn-secondary text-[11px] px-2 py-0.5">
                  {t('update.retry')}
                </button>
                <button onClick={() => setDismissed(true)} className="text-text-tertiary hover:text-text-primary p-1 ml-1">
                  <XMarkIcon className="w-3.5 h-3.5" />
                </button>
              </>
            )}

            {status === 'available' && (
              <>
                <ArrowDownTrayIcon className="w-4 h-4 text-accent shrink-0" />
                <span className="text-text-primary flex-1">
                  {t('update.available')}{' '}
                  <span className="font-semibold text-accent">BRAXON v{version}</span>
                  {notes && (
                    <span className="text-text-secondary ml-2 hidden sm:inline">— {notes}</span>
                  )}
                </span>
                <button
                  onClick={handleInstall}
                  className="btn-primary text-[11px] px-3 py-1"
                >
                  {t('update.download')}
                </button>
                <button
                  onClick={() => setDismissed(true)}
                  className="text-text-tertiary hover:text-text-primary p-1 ml-1"
                  aria-label="Dismiss"
                >
                  <XMarkIcon className="w-3.5 h-3.5" />
                </button>
              </>
            )}

          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
