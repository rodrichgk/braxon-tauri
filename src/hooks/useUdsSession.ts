/* ── One held diagnostic session per bench ECU ─────────────────
   Configuring an ECU (ref lookup, discovery hit, or a manually confirmed
   address) opens a session that stays alive for the whole working session.
   Scan DTCs, Clear DTCs, ident and active tests reuse it — they never send
   their own 10 C0. It is torn down when the bench moves on: serial
   disconnect, a different ECU, or unmount. ───────────────────────────── */

import { useCallback, useEffect, useRef, useState } from 'react';
import { type SendFn } from '@/lib/isotp';
import {
  KEEP_ALIVE_MS,
  openUdsSession,
  type SessionFailure,
  type UdsSessionHandle,
} from '@/lib/udsSession';

export type SessionStatus =
  | 'idle'        // nothing held
  | 'opening'     // 10 C0 sent, waiting
  | 'open'        // 50 C0 received, keep-alive running
  | 'no_response' // session control itself unanswered
  | 'rejected'    // ECU answered 7F to session control
  | 'lost';       // was open, then stopped acking

export interface SessionState {
  status: SessionStatus;
  sendId: number | null;
  recvId: number | null;
  subFunction: number | null;
  nrc: number | null;
  openedAt: number | null;
}

export type EnsureResult =
  | { ok: true;  reused: boolean; subFunction: number }
  | { ok: false; reason: SessionFailure; nrc?: number };

const IDLE: SessionState = {
  status: 'idle', sendId: null, recvId: null, subFunction: null, nrc: null, openedAt: null,
};

export function useUdsSession(send: SendFn, isConnected: boolean) {
  const [session, setSession] = useState<SessionState>(IDLE);

  const handleRef  = useRef<UdsSessionHandle | null>(null);
  const pendingRef = useRef<Promise<EnsureResult> | null>(null);
  const sendRef    = useRef(send);
  sendRef.current  = send;
  const mountedRef = useRef(true);
  /** Bumped whenever the held session is dropped, so an open that was already
      in flight cannot resurrect it after a disconnect or unmount. */
  const genRef     = useRef(0);

  const closeSession = useCallback(() => {
    genRef.current += 1;
    handleRef.current?.close();
    handleRef.current = null;
    pendingRef.current = null;
    setSession(IDLE);
  }, []);

  /**
   * Guarantee a live session for this address. Reuses the held one when the
   * address matches, so repeated actions never re-send session control.
   */
  const ensureSession = useCallback(async (
    sendId: number,
    recvId: number,
    subFunctions?: number[],
  ): Promise<EnsureResult> => {
    const held = handleRef.current;
    if (held && !held.closed && held.sendId === sendId && held.recvId === recvId) {
      return { ok: true, reused: true, subFunction: held.subFunction };
    }
    // An open request for this same address is already in flight — join it
    // rather than putting a second 10 C0 on the bus.
    if (pendingRef.current) return pendingRef.current;

    if (held) { held.close(); handleRef.current = null; }
    const gen = ++genRef.current;
    setSession({ ...IDLE, status: 'opening', sendId, recvId });

    const attempt = (async (): Promise<EnsureResult> => {
      const res = await openUdsSession({
        send: (msg) => sendRef.current(msg),
        sendId,
        recvId,
        subFunctions,
        keepAliveMs: KEEP_ALIVE_MS,
        onLost: () => {
          if (gen !== genRef.current) return;
          handleRef.current = null;
          if (mountedRef.current) setSession(s => ({ ...s, status: 'lost', openedAt: null }));
        },
      });

      // Disconnected, unmounted, or superseded while 10 C0 was in flight —
      // drop the session we just opened instead of leaking its keep-alive.
      if (gen !== genRef.current || !mountedRef.current) {
        if (res.ok) res.session.close();
        return res.ok
          ? { ok: true, reused: false, subFunction: res.subFunction }
          : { ok: false, reason: res.reason, nrc: res.nrc };
      }

      if (res.ok) {
        handleRef.current = res.session;
        setSession({
          status: 'open',
          sendId, recvId,
          subFunction: res.subFunction,
          nrc: null,
          openedAt: Date.now(),
        });
        return { ok: true, reused: false, subFunction: res.subFunction };
      }

      setSession({
        status: res.reason === 'rejected' ? 'rejected' : 'no_response',
        sendId, recvId,
        subFunction: res.subFunction ?? null,
        nrc: res.nrc ?? null,
        openedAt: null,
      });
      return { ok: false, reason: res.reason, nrc: res.nrc };
    })();

    pendingRef.current = attempt;
    try {
      return await attempt;
    } finally {
      pendingRef.current = null;
    }
  }, []);

  /** True when a live session is held for exactly this address. */
  const hasSessionFor = useCallback((sendId: number, recvId: number) => {
    const held = handleRef.current;
    return !!held && !held.closed && held.sendId === sendId && held.recvId === recvId;
  }, []);

  // The bus is gone — the session goes with it. Debounced: a brief transport
  // blip (USB CDC stall, a Kvaser bus-off that self-recovers, an auto-reconnect
  // cycle) would otherwise tear the session down and leave the scanner stuck
  // between "opening" and "not connected". A real drop keeps `isConnected`
  // false long past this window; the ECU's own S3 timeout (~5 s) is the backstop.
  useEffect(() => {
    if (isConnected) return;
    const t = setTimeout(() => { if (!isConnected) closeSession(); }, 1800);
    return () => clearTimeout(t);
  }, [isConnected, closeSession]);

  // Never leak the keep-alive interval past unmount. The setup half matters:
  // under React.StrictMode the mount→unmount→remount cycle runs this cleanup
  // once, and without re-arming `mountedRef` here every later ensureSession()
  // would see the component as unmounted — opening the session, reporting
  // success, but never flipping the UI to "open" or holding the keep-alive.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      genRef.current += 1;
      handleRef.current?.close();
      handleRef.current = null;
    };
  }, []);

  return { session, ensureSession, closeSession, hasSessionFor };
}
