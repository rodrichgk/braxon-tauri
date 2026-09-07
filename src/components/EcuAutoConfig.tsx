/* ── ABS reference → session configuration ────────────────────
   The reference selected in the ABS DB search above already drives CAN speed,
   sensor type and WSS calibration. This panel takes the same selection and
   drives the rest of a diagnostic session from it: brand, protocol, CAN
   addressing, ECU record and its actuators — all from one lookup, no dropdown
   hunting.

   References the DB has never seen fall through to the discovery sweep, whose
   result can then be saved against that reference so the next unit of the same
   type configures instantly. ─────────────────────────────────────────────── */

import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CpuChipIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  BoltIcon,
  StopIcon,
  BookmarkIcon,
} from '@heroicons/react/24/outline';
import {
  type AbsRefLookup,
  type DiscoveryCandidateRow,
  type EcuInfo,
  type Protocol,
  type VehicleBrand,
  brandFromManufacturer,
  defaultProtocolFor,
  guessHardwareFamily,
  parseCanId,
  protocolFromDb,
  toHex3,
} from '@/lib/ecu';
import { type SendFn } from '@/lib/isotp';
import EcuDeepProfile from '@/components/EcuDeepProfile';
import { type EnsureResult, type SessionState } from '@/hooks/useUdsSession';
import {
  type DiscoveryHit,
  type DiscoveryProbe,
  type DiscoveryTier,
  dbProbes,
  dedupeProbes,
  estimateSweepSeconds,
  protocolFromProbe,
  rangeProbes,
  runDiscovery,
} from '@/lib/ecuDiscovery';

/** What a successful lookup (or discovery) hands back to the scanner. */
export interface EcuAutoConfig {
  absRef: string;
  ecu: EcuInfo | null;
  sendIdHex: string | null;
  recvIdHex: string | null;
  protocol: Protocol | null;
  brand: VehicleBrand | null;
}

interface Props {
  isConnected: boolean;
  send: SendFn;
  /** Reference selected in the ABS DB search above — the only input here. */
  absRef?: string;
  onApply: (config: EcuAutoConfig) => void;
  /** Diagnostic session held for the bench ECU, owned by the scanner. */
  session: SessionState;
  connect: (sendId: number, recvId: number, subFunctions?: number[]) => Promise<EnsureResult>;
  disconnect: () => void;
}

type LookupState = 'idle' | 'looking' | 'found' | 'unknown' | 'error';
type SweepState  = 'idle' | 'running' | 'hit' | 'miss' | 'cancelled';
type SaveState   = 'idle' | 'saving' | 'saved' | 'error';

const RENAULT_RANGE: [number, number] = [0x700, 0x7ff];
const FULL_RANGE:    [number, number] = [0x000, 0x7ff];

const TIER_LABEL: Record<DiscoveryTier, string> = {
  db:      'known ECU addresses',
  renault: 'range 0x700–0x7FF',
  full:    'full 11-bit sweep',
};

export default function EcuAutoConfig({
  isConnected, send, absRef, onApply, session, connect, disconnect,
}: Props) {
  const [lookupState, setLookupState] = useState<LookupState>('idle');
  const [lookup, setLookup]         = useState<AbsRefLookup | null>(null);
  const [errorMsg, setErrorMsg]     = useState('');

  const [sweepState, setSweepState] = useState<SweepState>('idle');
  const [sweepTier, setSweepTier]   = useState<DiscoveryTier | null>(null);
  const [progress, setProgress]     = useState({ done: 0, total: 0 });
  const [hit, setHit]               = useState<DiscoveryHit | null>(null);
  // Protocol inferred from the hit's own session-control response — saved
  // alongside the address so the *next* lookup of this reference picks the
  // right protocol tab on its own instead of defaulting to KWP2000.
  const [hitProtocol, setHitProtocol] = useState<Protocol | null>(null);
  const [fullSweepArmed, setFullSweepArmed] = useState(false);

  const [saveState, setSaveState]   = useState<SaveState>('idle');

  const ref        = absRef?.trim() ?? '';
  const cancelRef  = useRef(false);
  /** Bumped on every new selection, so a sweep aimed at the previous unit
      cannot report its outcome into the panel of the current one. */
  const sweepToken = useRef(0);
  const sendRef    = useRef(send);
  sendRef.current  = send;
  const onApplyRef = useRef(onApply);
  onApplyRef.current = onApply;
  const connectRef = useRef(connect);
  connectRef.current = connect;
  const disconnectRef = useRef(disconnect);
  disconnectRef.current = disconnect;
  const isConnectedRef = useRef(isConnected);
  isConnectedRef.current = isConnected;

  useEffect(() => () => { cancelRef.current = true; }, []);

  /** Look the reference up and, when it resolves to addressing, apply it. */
  const runLookup = useCallback(async (value: string, autoApply = true) => {
    if (!value) { setLookupState('idle'); setLookup(null); return null; }

    setLookupState('looking');
    setErrorMsg('');
    try {
      const res = await invoke<AbsRefLookup | null>('get_ecu_by_abs_ref', { absRef: value });
      setLookup(res);

      const hasAddressing = !!res?.sendId;
      const dbProtocol = protocolFromDb(res?.protocol ?? res?.ecu?.protocol);
      // Worth applying if the reference resolved to *anything* usable — CAN
      // addressing, a stored protocol (e.g. VW TP2.0, which needs no CAN id),
      // or a linked ECU record.
      const worthApplying = hasAddressing || dbProtocol !== null || !!res?.ecu;
      setLookupState(worthApplying ? 'found' : 'unknown');

      if (res && worthApplying && autoApply) {
        const sendId = parseCanId(res.sendId);
        const recvId = parseCanId(res.recvId) ?? (sendId !== null ? sendId + 0x20 : null);
        const protocol = dbProtocol ?? defaultProtocolFor(sendId);
        onApplyRef.current({
          absRef:    res.absRef,
          ecu:       res.ecu,
          sendIdHex: sendId !== null ? toHex3(sendId) : null,
          recvIdHex: recvId !== null ? toHex3(recvId) : null,
          protocol,
          brand:     brandFromManufacturer(res.manufacturer),
        });
        // Configuring the bench ECU is the connect step: open the session now
        // and hold it, so Scan / Clear / Active Tests work straight away.
        // OBD-II is sessionless; VW TP2.0 opens its channel from Diagnostics.
        if (isConnectedRef.current && protocol !== 'OBD2' && protocol !== 'VWTP20' && sendId !== null && recvId !== null) {
          void connectRef.current(sendId, recvId);
        }
      }
      return res;
    } catch (e) {
      // No DB configured / unreachable — discovery and the manual path below
      // still work, they just have nothing to prioritise from.
      setLookupState('error');
      setErrorMsg(String(e));
      setLookup(null);
      return null;
    }
  }, []);

  /** A new selection in the search above reconfigures the whole session. */
  useEffect(() => {
    cancelRef.current = true;   // abandon a sweep aimed at the previous unit
    sweepToken.current += 1;
    disconnectRef.current();    // and drop the session held for it
    setSweepState('idle');
    setSweepTier(null);
    setHit(null);
    setHitProtocol(null);
    setProgress({ done: 0, total: 0 });
    setSaveState('idle');
    setFullSweepArmed(false);
    runLookup(ref);
  }, [ref, runLookup]);

  // ── Discovery ─────────────────────────────────────────────────
  // Only reachable when the reference has no stored sendId: a ref that is
  // already mapped never sweeps the bus.
  const startSweep = async (tier: DiscoveryTier) => {
    if (!isConnected || sweepState === 'running' || !ref) return;
    // Hard guard, not just hidden buttons: a reference with stored addressing
    // must never put probe traffic on the bus.
    if (lookupState === 'found' && lookup?.sendId) return;

    const family = lookup?.hardwareFamily ?? guessHardwareFamily(ref);
    let probes: DiscoveryProbe[] = [];

    if (tier === 'db') {
      let rows: DiscoveryCandidateRow[] = [];
      try {
        rows = await invoke<DiscoveryCandidateRow[]>('get_discovery_candidates', {
          hardwareFamily: family,
        });
      } catch { rows = []; }
      probes = dedupeProbes(dbProbes(rows));
      if (!probes.length) {
        setSweepTier('db');
        setProgress({ done: 0, total: 0 });
        setSweepState('miss');
        return;
      }
    } else {
      const [from, to] = tier === 'renault' ? RENAULT_RANGE : FULL_RANGE;
      probes = dedupeProbes(rangeProbes(from, to, tier));
    }

    cancelRef.current = false;
    const token = sweepToken.current;
    setSweepTier(tier);
    setSweepState('running');
    setHit(null);
    setHitProtocol(null);
    setSaveState('idle');
    setFullSweepArmed(false); // each full sweep needs its own confirmation
    setProgress({ done: 0, total: probes.length });

    const found = await runDiscovery({
      send: (msg) => sendRef.current(msg),
      probes,
      isCancelled: () => cancelRef.current,
      onProgress: (done, total) => setProgress({ done, total }),
    });

    if (token !== sweepToken.current) return;  // selection changed under us
    if (cancelRef.current) { setSweepState('cancelled'); return; }

    if (found) {
      setHit(found);
      setSweepState('hit');
      const detectedProtocol = protocolFromProbe(found.payload);
      setHitProtocol(detectedProtocol);
      // Configure the bench straight away — saving to the DB stays a separate,
      // explicit step so a one-off probe result never pollutes the database.
      onApplyRef.current({
        absRef:    ref,
        ecu:       null,
        sendIdHex: toHex3(found.sendId),
        recvIdHex: toHex3(found.recvId),
        protocol:  detectedProtocol,
        brand:     null,
      });
      // Discovery is the connect action: the ECU just accepted a session, so
      // hold it open with the keep-alive rather than making the user do
      // anything else before scanning.
      if (found.sessionOpen) {
        void connectRef.current(found.sendId, found.recvId, [found.subFunction]);
      }
    } else {
      setSweepState('miss');
    }
  };

  const cancelSweep = () => { cancelRef.current = true; };

  const saveHit = async () => {
    if (!hit || !ref) return;
    setSaveState('saving');
    try {
      await invoke('save_abs_ref_ecu', {
        absRef:         ref,
        ecuFile:        lookup?.ecu?.ecuFile ?? null,
        sendId:         toHex3(hit.sendId),
        recvId:         toHex3(hit.recvId),
        // Was hardcoded null — the next lookup of this reference then had no
        // stored protocol to go on and always fell back to guessing KWP2000,
        // forcing a manual tab switch every time. Save what the hit itself
        // proved (from the session-control response shape).
        protocol:       hitProtocol,
        hardwareFamily: lookup?.hardwareFamily ?? guessHardwareFamily(ref),
        source:         'discovery',
      });
      setSaveState('saved');
      // Re-read so the panel now shows the reference as a known mapping.
      await runLookup(ref, false);
    } catch {
      setSaveState('error');
    }
  };

  /** Pick one of the same-family ECUs the reference could not narrow down. */
  const chooseCandidate = (ecu: EcuInfo) => {
    const sendId = parseCanId(ecu.sendId);
    const recvId = parseCanId(ecu.recvId) ?? (sendId !== null ? sendId + 0x20 : null);
    const protocol = protocolFromDb(ecu.protocol) ?? defaultProtocolFor(sendId);
    onApplyRef.current({
      absRef:    ref,
      ecu,
      sendIdHex: sendId !== null ? toHex3(sendId) : null,
      recvIdHex: recvId !== null ? toHex3(recvId) : null,
      protocol,
      brand:     null,
    });
    if (isConnected && protocol !== 'OBD2' && sendId !== null && recvId !== null) {
      void connect(sendId, recvId);
    }
    setLookupState('found');
    setLookup(l => l ? { ...l, ecu, sendId: ecu.sendId, recvId: ecu.recvId, protocol: ecu.protocol } : l);
  };

  // ── Derived display ───────────────────────────────────────────
  const family      = lookup?.hardwareFamily ?? guessHardwareFamily(ref);
  const known       = lookupState === 'found' && !!lookup?.sendId;
  const canDiscover = !!ref && !known && lookupState !== 'looking';
  const sweepPct    = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="mb-3 p-2.5 bg-elevated border border-border rounded-xl space-y-2">

      {/* Selected reference — comes from the ABS DB search above */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[11px] font-semibold text-text-primary shrink-0 flex items-center gap-1.5">
          <CpuChipIcon className="w-3.5 h-3.5 text-text-tertiary" />
          ECU setup
        </span>
        {ref ? (
          <span className="text-[10px] font-medium text-accent bg-accent/10 border border-accent/20 px-1.5 py-0.5 rounded font-mono">
            {ref}
          </span>
        ) : (
          <span className="text-[9px] text-warning">no ABS ref selected</span>
        )}
        {family && (
          <span className="text-[10px] font-semibold text-accent bg-accent/10 border border-accent/20 px-1.5 py-0.5 rounded">
            {family}
          </span>
        )}
        {lookupState === 'looking' && (
          <span className="flex items-center gap-1 text-[9px] text-text-tertiary ml-auto">
            <ArrowPathIcon className="w-3 h-3 animate-spin" />
            looking up…
          </span>
        )}

        {/* Live connection state — the session is what actually makes the ECU
            answer, so it gets its own indicator rather than being implied. */}
        {session.status !== 'idle' && (
          <span className={[
            'flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded border ml-auto',
            session.status === 'open'
              ? 'text-success bg-success/10 border-success/25'
              : session.status === 'opening'
                ? 'text-accent bg-accent/10 border-accent/25'
                : session.status === 'rejected'
                  ? 'text-warning bg-warning/10 border-warning/25'
                  : 'text-danger bg-danger/10 border-danger/25',
          ].join(' ')}>
            <span className={[
              'w-1.5 h-1.5 rounded-full bg-current shrink-0',
              session.status === 'open' ? 'animate-pulse' : '',
            ].join(' ')} />
            {session.status === 'open'
              ? `Session open · keep-alive 2s${session.sendId !== null ? ` · 0x${toHex3(session.sendId)}` : ''}`
              : session.status === 'opening'
                ? 'Opening session…'
                : session.status === 'rejected'
                  ? 'Session refused by ECU'
                  : session.status === 'lost'
                    ? 'Session lost — ECU stopped acking'
                    : 'No answer to session control'}
          </span>
        )}
      </div>

      {/* Lookup outcome */}
      <AnimatePresence mode="wait">
        {!ref && (
          <motion.p key="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="text-[9px] text-text-tertiary leading-relaxed"
          >
            Select an ABS reference in the search above — protocol, CAN addressing and active tests configure themselves from it.
          </motion.p>
        )}

        {known && lookup && (
          <motion.div key="found" initial={{ opacity: 0, y: -2 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-start gap-1.5 text-[10px] bg-success/5 border border-success/20 rounded-lg px-2 py-1.5"
          >
            <CheckCircleIcon className="w-3.5 h-3.5 text-success shrink-0 mt-px" />
            <span className="text-text-secondary leading-relaxed">
              <span className="text-success font-semibold">Configured</span>
              {lookup.ecu ? <> · {lookup.ecu.ecuName}</> : null}
              {' · CAN '}
              <span className="font-mono text-text-primary">
                0x{lookup.sendId}→0x{lookup.recvId ?? toHex3((parseCanId(lookup.sendId) ?? 0) + 0x20)}
              </span>
              {lookup.protocol ? ` · ${lookup.protocol}` : ''}
              {lookup.manufacturer ? ` · ${lookup.manufacturer}` : ''}
              {lookup.source === 'mapping' ? ' · saved mapping' : ' · matched by family'}
            </span>
          </motion.div>
        )}

        {lookupState === 'unknown' && (
          <motion.div key="unknown" initial={{ opacity: 0, y: -2 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="text-[10px] text-warning bg-warning/5 border border-warning/20 rounded-lg px-2 py-1.5 leading-relaxed"
          >
            <ExclamationTriangleIcon className="w-3.5 h-3.5 inline-block mr-1 -mt-px" />
            No stored CAN addressing for this reference
            {lookup?.candidates.length
              ? ` — ${lookup.candidates.length} ${family ?? ''} ECU${lookup.candidates.length !== 1 ? 's' : ''} in the DB, pick one or run discovery.`
              : ' — run discovery to find it, or select the ECU model manually below.'}
          </motion.div>
        )}

        {lookupState === 'error' && (
          <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex items-center gap-1.5 text-[10px] text-danger bg-danger/5 border border-danger/20 rounded-lg px-2 py-1.5"
          >
            <span className="min-w-0 flex-1 truncate" title={errorMsg}>
              Lookup failed — {errorMsg || 'database unreachable'}
            </span>
            <button onClick={() => runLookup(ref)} className="underline shrink-0 hover:text-text-secondary">
              retry
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Same-family candidates when the reference is ambiguous */}
      {lookupState === 'unknown' && !!lookup?.candidates.length && (
        <div className="flex flex-wrap gap-1.5">
          {lookup.candidates.map(ecu => (
            <button
              key={ecu.ecuFile}
              onClick={() => chooseCandidate(ecu)}
              className="text-[10px] font-medium px-2 py-1 rounded-lg border border-border text-text-secondary hover:bg-app transition-colors"
            >
              {ecu.ecuName}
              <span className="font-mono text-text-tertiary ml-1">
                {ecu.sendId ? `0x${ecu.sendId}` : 'K-line'}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Discovery — unknown references only */}
      {canDiscover && (
        <div className="space-y-1.5 pt-0.5 border-t border-border">
          <div className="flex items-center gap-1.5 flex-wrap pt-1.5">
            <span className="text-[10px] text-text-tertiary shrink-0">Discover ECU</span>

            {sweepState === 'running' ? (
              <button
                onClick={cancelSweep}
                className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg border border-danger/25 text-danger bg-danger/10 transition-colors"
              >
                <StopIcon className="w-3 h-3" />
                Stop
              </button>
            ) : (
              <>
                <button
                  onClick={() => startSweep('db')}
                  disabled={!isConnected}
                  className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg border border-accent/30 text-accent hover:bg-accent/10 transition-colors disabled:opacity-40"
                >
                  <BoltIcon className="w-3 h-3" />
                  Known addresses
                </button>
                <button
                  onClick={() => startSweep('renault')}
                  disabled={!isConnected}
                  className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg border border-border text-text-secondary hover:bg-app transition-colors disabled:opacity-40"
                >
                  0x700–0x7FF
                  <span className="text-text-tertiary">
                    ~{estimateSweepSeconds(RENAULT_RANGE[1] - RENAULT_RANGE[0] + 1)}s
                  </span>
                </button>
                <button
                  onClick={() => fullSweepArmed ? startSweep('full') : setFullSweepArmed(true)}
                  disabled={!isConnected}
                  className={[
                    'flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg border transition-colors disabled:opacity-40',
                    fullSweepArmed
                      ? 'border-warning/30 text-warning bg-warning/10'
                      : 'border-border text-text-tertiary hover:bg-app',
                  ].join(' ')}
                >
                  {fullSweepArmed ? (
                    <>
                      <ExclamationTriangleIcon className="w-3 h-3" />
                      Confirm full sweep (~{Math.round(estimateSweepSeconds(FULL_RANGE[1] + 1) / 60)} min)
                    </>
                  ) : 'Full 11-bit sweep'}
                </button>
              </>
            )}
            {!isConnected && (
              <span className="text-[9px] text-text-tertiary italic">connect to the Nano first</span>
            )}
          </div>

          {/* Sweep progress / result */}
          {sweepState === 'running' && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[9px] text-text-tertiary">
                <span>Probing {sweepTier ? TIER_LABEL[sweepTier] : ''} — 10 C0 then 10 03 per ID</span>
                <span className="font-mono">{progress.done}/{progress.total}</span>
              </div>
              <div className="h-1 bg-app rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-accent"
                  animate={{ width: `${sweepPct}%` }}
                  transition={{ duration: 0.15 }}
                />
              </div>
            </div>
          )}

          {sweepState === 'hit' && hit && (
            <div className="flex items-center gap-1.5 flex-wrap text-[10px] bg-success/5 border border-success/20 rounded-lg px-2 py-1.5">
              <CheckCircleIcon className="w-3.5 h-3.5 text-success shrink-0" />
              <span className="text-text-secondary">
                ECU answered at{' '}
                <span className="font-mono text-text-primary">
                  0x{toHex3(hit.sendId)}→0x{toHex3(hit.recvId)}
                </span>
                {hit.label ? ` (${hit.label})` : ''}
                {hit.sessionOpen
                  ? ` — session 0x${hit.subFunction.toString(16).toUpperCase()} open, connected`
                  : ` — but it refused the session (7F 10 ${hit.nrc !== undefined
                      ? hit.nrc.toString(16).toUpperCase().padStart(2, '0') : '??'}), so requests may go unanswered`}
              </span>
              <button
                onClick={saveHit}
                disabled={saveState === 'saving' || saveState === 'saved'}
                className={[
                  'flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg border transition-colors disabled:opacity-60 ml-auto',
                  saveState === 'saved'
                    ? 'text-success bg-success/10 border-success/25'
                    : saveState === 'error'
                      ? 'text-danger bg-danger/10 border-danger/25'
                      : 'text-accent hover:bg-accent/10 border-accent/30',
                ].join(' ')}
              >
                <BookmarkIcon className="w-3 h-3" />
                {saveState === 'saving' ? 'Saving…'
                  : saveState === 'saved' ? '✓ Saved to DB'
                  : saveState === 'error' ? 'Save failed'
                  : `Save to DB for ${ref}`}
              </button>
            </div>
          )}

          {sweepState === 'hit' && hit && (
            <EcuDeepProfile
              isConnected={isConnected}
              send={send}
              sendId={hit.sendId}
              recvId={hit.recvId}
            />
          )}

          {sweepState === 'miss' && (
            <p className="text-[10px] text-text-tertiary bg-app border border-border rounded-lg px-2 py-1.5">
              {sweepTier === 'db'
                ? progress.total === 0
                  ? 'No addresses stored for this kind of unit yet — try the 0x700–0x7FF range.'
                  : 'No known address answered — try the 0x700–0x7FF range next.'
                : sweepTier === 'renault'
                  ? 'Nothing answered in 0x700–0x7FF. Check power and CAN wiring, or run the full sweep.'
                  : 'Nothing answered on any 11-bit ID. The unit may be K-line only — use the bus recorder below.'}
            </p>
          )}

          {sweepState === 'cancelled' && (
            <p className="text-[10px] text-text-tertiary">Sweep stopped at {progress.done}/{progress.total}.</p>
          )}
        </div>
      )}
    </div>
  );
}
