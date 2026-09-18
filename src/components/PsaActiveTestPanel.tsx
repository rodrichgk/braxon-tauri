import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { BoltIcon, LinkSlashIcon } from '@heroicons/react/24/outline';
import { useClientSerialConnection } from '@/hooks/useClientSerialConnection';
import { useStickyLog } from '@/hooks/useStickyLog';
import { openUdsSession, type UdsSessionHandle } from '@/lib/udsSession';
import {
  buildActiveTestStart, buildActiveTestKeepAlive, buildActiveTestStop,
  PSA_BSI_SEND_ID, PSA_BSI_RECV_ID, CONFIRMED_LOCAL_ID,
} from '@/lib/psaActiveTest';

// A real-hardware sibling to the demo virtual-BSI in ClusterBenchDashboard:
// this replays the exact IOControlByLocalIdentifier sequence decoded from a
// real Peugeot 207 bench capture (reference-data/peugeot-207-bsi-commodo-can.md)
// so a technician can click a button and watch a connected dash react, the
// same way the Autel's own active-test menu did. Only 0xC5 is confirmed to
// do *something* — everything else is a candidate to brute-force by hand.
// See docs/DASHBOARD-BENCH.md's "diagnostic-polling vs. periodic-broadcast"
// note: this is the diagnostic-polling half, deliberately separate from the
// demo profile's periodic-broadcast transmitter.

const KEEP_ALIVE_MS = 250; // the capture's own cadence, ~230-250ms

interface PsaActiveTestPanelProps {
  isConnected?: boolean;
  sendMessage?: (line: string) => Promise<boolean>;
}

export default function PsaActiveTestPanel({
  isConnected: isConnectedProp,
  sendMessage,
}: PsaActiveTestPanelProps = {}) {
  const { t } = useTranslation();
  const { isConnected: hookConnected, sendCommand } = useClientSerialConnection();
  const isConnected = isConnectedProp ?? hookConnected;
  const send = sendMessage ?? sendCommand;
  const {
    lines: log, add: addLog, clear: clearLog, containerRef, endRef: logEndRef, handleScroll,
    visible: logVisible, toggleVisible: toggleLogVisible,
  } = useStickyLog();

  const [sessionState, setSessionState] = useState<'closed' | 'opening' | 'open' | 'failed'>('closed');
  const sessionRef = useRef<UdsSessionHandle | null>(null);
  const [activeLocalId, setActiveLocalId] = useState<number | null>(null);
  const keepAliveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [candidateHex, setCandidateHex] = useState('C6');

  const stopKeepAlive = useCallback(() => {
    if (keepAliveTimerRef.current) {
      clearInterval(keepAliveTimerRef.current);
      keepAliveTimerRef.current = null;
    }
  }, []);

  const deactivate = useCallback(() => {
    stopKeepAlive();
    if (activeLocalId != null) {
      const line = buildActiveTestStop(activeLocalId);
      send(line);
      addLog(`TX ${line.trim()}`);
    }
    setActiveLocalId(null);
  }, [activeLocalId, send, addLog, stopKeepAlive]);

  // A dropped transport shouldn't leave a keep-alive timer running against a
  // connection that no longer exists.
  useEffect(() => {
    if (!isConnected) {
      stopKeepAlive();
      setActiveLocalId(null);
      sessionRef.current = null;
      setSessionState('closed');
    }
  }, [isConnected, stopKeepAlive]);

  useEffect(() => stopKeepAlive, [stopKeepAlive]);

  const ensureSession = useCallback(async (): Promise<UdsSessionHandle | null> => {
    if (sessionRef.current && !sessionRef.current.closed) return sessionRef.current;
    setSessionState('opening');
    const res = await openUdsSession({
      send,
      sendId: PSA_BSI_SEND_ID,
      recvId: PSA_BSI_RECV_ID,
      onLost: () => { sessionRef.current = null; setSessionState('closed'); },
    });
    if (res.ok) {
      sessionRef.current = res.session;
      setSessionState('open');
      return res.session;
    }
    setSessionState('failed');
    addLog(`ERR: session open failed (${res.reason})`);
    return null;
  }, [send, addLog]);

  const activate = useCallback(async (localId: number) => {
    const session = await ensureSession();
    if (!session) return;
    const line = buildActiveTestStart(localId);
    send(line);
    addLog(`TX ${line.trim()}`);
    setActiveLocalId(localId);
    keepAliveTimerRef.current = setInterval(() => {
      const ka = buildActiveTestKeepAlive(localId);
      send(ka);
    }, KEEP_ALIVE_MS);
  }, [ensureSession, send, addLog]);

  const toggle = (localId: number) => {
    if (activeLocalId === localId) deactivate();
    else activate(localId);
  };

  const candidateId = parseInt(candidateHex, 16);
  const candidateValid = candidateHex.trim() !== '' && !Number.isNaN(candidateId) && candidateId >= 0 && candidateId <= 0xff;

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-text-primary">
          {t('cluster_bench.psa_test.title', { defaultValue: 'Peugeot 207 BSI — real active test' })}
        </h2>
        <p className="text-xs text-text-secondary mt-0.5">
          {t('cluster_bench.psa_test.subtitle', {
            defaultValue: 'Replays a real captured session (0x752 → 0x652). Only 0xC5 is confirmed to do something — everything else is a guess to try against a connected dash.',
          })}
        </p>
      </div>

      {!isConnected && (
        <div className="alert alert-warning flex items-center gap-2" role="alert" data-testid="psa-test-offline">
          <LinkSlashIcon className="h-4 w-4 shrink-0" />
          <span>{t('cluster_bench.offline', { defaultValue: 'Connect the CAN transport (board or Kvaser) to arm the bench.' })}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="psa-test-confirmed"
          disabled={!isConnected || sessionState === 'opening'}
          onClick={() => toggle(CONFIRMED_LOCAL_ID)}
          className={[
            'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold border transition-colors',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            activeLocalId === CONFIRMED_LOCAL_ID
              ? 'bg-danger/15 text-danger border-danger/25 hover:bg-danger/25'
              : 'bg-success/15 text-success border-success/25 hover:bg-success/25',
          ].join(' ')}
        >
          <BoltIcon className="w-4 h-4" />
          {activeLocalId === CONFIRMED_LOCAL_ID
            ? t('cluster_bench.psa_test.stop', { defaultValue: 'Stop' })
            : t('cluster_bench.psa_test.activate_confirmed', { defaultValue: 'Activate 0xC5 (confirmed)' })}
        </button>

        <div className="flex items-center gap-1.5 ml-2">
          <span className="text-xs text-text-tertiary">
            {t('cluster_bench.psa_test.candidate_label', { defaultValue: 'Try local ID' })}
          </span>
          <span className="text-xs font-mono text-text-tertiary">0x</span>
          <input
            type="text"
            value={candidateHex}
            disabled={activeLocalId != null && activeLocalId !== candidateId}
            onChange={e => setCandidateHex(e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 2))}
            className="w-12 text-xs font-mono bg-elevated border border-border rounded px-1.5 py-1 text-text-primary"
            aria-label={t('cluster_bench.psa_test.candidate_label', { defaultValue: 'Try local ID' })}
          />
          <button
            type="button"
            disabled={!isConnected || !candidateValid || sessionState === 'opening'}
            onClick={() => toggle(candidateId)}
            className={[
              'text-xs font-semibold rounded-lg px-3 py-1.5 border transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
              activeLocalId === candidateId
                ? 'bg-danger/15 text-danger border-danger/25 hover:bg-danger/25'
                : 'bg-elevated text-text-secondary border-border hover:text-text-primary',
            ].join(' ')}
          >
            {activeLocalId === candidateId
              ? t('cluster_bench.psa_test.stop', { defaultValue: 'Stop' })
              : t('cluster_bench.psa_test.try', { defaultValue: 'Try' })}
          </button>
        </div>
      </div>

      <div className="pt-2 border-t border-border">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-text-primary">
            {t('f2evo.log')} {log.length > 0 && <span className="text-xs font-normal text-text-tertiary">({log.length})</span>}
          </h3>
          <div className="flex gap-1.5">
            <button onClick={toggleLogVisible} className="text-xs btn-secondary px-2.5 py-1">
              {logVisible ? t('f2evo.hide_log') : t('f2evo.show_log')}
            </button>
            {logVisible && (
              <button onClick={clearLog} className="text-xs btn-secondary px-2.5 py-1">{t('common.clear')}</button>
            )}
          </div>
        </div>
        {logVisible && (
          <div
            ref={containerRef}
            onScroll={handleScroll}
            className="bg-elevated border border-border rounded-xl p-3 font-mono text-[11px] overflow-y-auto overscroll-y-contain h-32 space-y-0.5"
          >
            {log.length === 0
              ? <span className="text-text-tertiary">{t('f2evo.no_messages')}</span>
              : log.map((line, i) => (
                <div key={i} className={line.startsWith('TX') ? 'text-accent' : line.startsWith('ERR:') ? 'text-danger' : 'text-success'}>
                  {line}
                </div>
              ))
            }
            <div ref={logEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}
