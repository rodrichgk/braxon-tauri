import { useState, useRef, useEffect } from 'react';
import { isoTpRequest } from '@/lib/isotp';
import { wheelRequestBytes, decodeWheelValue, type WheelReadSpec } from '@/lib/wssReadback';

// A touch tighter than LiveData's 300 ms single-signal cadence so a
// 4-wheel round-robin still refreshes < 1 s.
const READBACK_POLL_MS = 180;

export interface UseWssReadbackOptions {
  /** Wheel-read spec for the selected ABS reference, or null when none is on file. */
  readSpec: WheelReadSpec | null;
  /** Main CAN transport send (board or Kvaser) — absent disables the poll. */
  canSend?: (message: string) => Promise<boolean | void> | boolean | void;
  /** Master on/off toggle — the operator's "Read wheel speeds" button. */
  enabled: boolean;
}

export interface UseWssReadbackResult {
  /** Measured km/h per wheel (FL, FR, RL, RR) — null until a reply arrives. */
  measured: (number | null)[];
  /** Non-empty when the last poll got no response. */
  error: string;
}

/**
 * Round-robin the 4 wheel DIDs over ISO-TP through the main CAN transport
 * (recursive setTimeout so requests never overlap — same shape as
 * LiveData.tsx's poll loop). Shared by the Pico's Signal Tester and the
 * legacy Nano panel so both read the ECU's own measured speed the same
 * way — confirmed against an Autel scan tool — instead of the Nano
 * panel's older passive-CAN-sniff readback, which requires guessing a
 * wheel's CAN ID/byte by hand in CAN Analyzer.
 *
 * Deliberately does not take an `isConnected` (signal-board) flag: reading
 * the ECU back over CAN only needs `canSend` (the main diagnostic
 * transport, board or Kvaser). A manual/hand-wired signal source drives
 * the sensor from outside BRAXON entirely — requiring the signal board to
 * be connected to read the ECU back would make readback unusable in
 * exactly the cases a non-BRAXON signal source exists for.
 */
export function useWssReadback({ readSpec, canSend, enabled }: UseWssReadbackOptions): UseWssReadbackResult {
  const [measured, setMeasured] = useState<(number | null)[]>([null, null, null, null]);
  const [error, setError] = useState('');
  // `canSend` is usually a fresh closure each parent render — keep it in a
  // ref so the poll effect below doesn't tear down and restart (which would
  // reset the round-robin to wheel 0 every render).
  const canSendRef = useRef(canSend);
  canSendRef.current = canSend;

  useEffect(() => {
    if (!enabled || !readSpec || !canSend) {
      setMeasured([null, null, null, null]);
      return;
    }
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    let wheel = 0;
    const posResp = readSpec.service === '22' ? 0x62 : 0x61;
    const reqSid = readSpec.service === '22' ? 0x22 : 0x21;
    const send = (m: string) => Promise.resolve(canSendRef.current?.(m));

    const tick = async () => {
      if (!alive) return;
      const w = wheel;
      const [hi, lo] = readSpec.dids[w] ?? [0, 0];
      const res = await isoTpRequest({
        send,
        sendId: readSpec.sendId,
        recvIds: [readSpec.recvId],
        data: wheelRequestBytes(readSpec, w),
        timeoutMs: 500,
        // The recv id also carries other DIDs' replies — pin this one by its echo.
        accept: p =>
          (p[0] === posResp && p[1] === hi && (readSpec.service === '21' || p[2] === lo)) ||
          (p[0] === 0x7f && p[1] === reqSid),
      });
      if (!alive) return;
      const v = res ? decodeWheelValue(res.payload, readSpec, w) : null;
      setMeasured(prev => { const n = [...prev]; n[w] = v; return n; });
      setError(res ? '' : 'no response — open the diagnostic session first');
      wheel = (wheel + 1) % 4;
      timer = setTimeout(tick, READBACK_POLL_MS);
    };
    tick();
    return () => { alive = false; clearTimeout(timer); };
    // `canSend` identity is read through `canSendRef`; only its presence matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, readSpec, !!canSend]);

  return { measured, error };
}
