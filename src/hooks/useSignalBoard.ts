/* ── Second serial transport: the WSS signal board ────────────
   When the CAN side is on the Kvaser, the old Pico/Nano board stays on USB
   purely to generate wheel-speed signals (you can't enter diagnostics while
   "moving", so the session opens at 0 km/h, then the board ramps the signal
   while the Kvaser keeps the session alive). This hook owns that board
   connection, entirely separate from useClientSerialConnection. ──────────── */

import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { signalBoard, type SerialEvent, type SerialPortInfo } from '@/lib/clientSerial';

function read<T>(key: string, fallback: T): T {
  try { const s = localStorage.getItem(key); return s !== null ? (JSON.parse(s) as T) : fallback; }
  catch { return fallback; }
}
function write<T>(key: string, v: T) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ }
}

export function useSignalBoard() {
  const [isConnected, setIsConnected] = useState(() => signalBoard.getIsConnected());
  const [ports, setPorts]             = useState<SerialPortInfo[]>([]);
  const [selectedPort, setPortState]  = useState<string | null>(() => read<string | null>('signalBoardPort', null));
  const [baudRate, setBaudState]      = useState<string>(() => read<string>('signalBoardBaud', '115200'));
  const [error, setError]             = useState<string | null>(null);

  const setSelectedPort = useCallback((p: string | null) => {
    setPortState(p);
    write('signalBoardPort', p);
    if (p) signalBoard.setPort(p);
  }, []);
  const setBaudRate = useCallback((b: string) => {
    setBaudState(b);
    write('signalBoardBaud', b);
  }, []);

  const refreshPorts = useCallback(async () => {
    try { setPorts(await signalBoard.listPorts()); }
    catch (e) { setError(String(e)); }
  }, []);

  useEffect(() => { refreshPorts(); }, [refreshPorts]);
  useEffect(() => {
    if (selectedPort) { signalBoard.setPort(selectedPort); return; }
    // No remembered port — offer the auto-detected Pico.
    invoke<string | null>('get_pico_port').then(p => { if (p) setSelectedPort(p); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const h = (e: SerialEvent) => {
      if (e.type === 'connected') { setIsConnected(true); setError(null); }
      else if (e.type === 'disconnected') setIsConnected(false);
      else if (e.type === 'error') setError(e.error?.message ?? 'error');
    };
    signalBoard.addEventListener(h);
    return () => signalBoard.removeEventListener(h);
  }, []);

  const connect = useCallback(async () => {
    if (!selectedPort) { setError('Select the signal board port'); return false; }
    setError(null);
    signalBoard.setPort(selectedPort);
    const ok = await signalBoard.connect({ baudRate: parseInt(baudRate, 10) || 115200 });
    if (ok) signalBoard.startReading();
    return ok;
  }, [selectedPort, baudRate]);

  const disconnect = useCallback(() => signalBoard.disconnect(), []);

  const sendCommand = useCallback(async (cmd: string): Promise<boolean> => {
    if (!signalBoard.getIsConnected()) { setError('Signal board not connected'); return false; }
    const ok = await signalBoard.write(cmd);
    if (!ok) setError('Failed to send to signal board');
    return ok;
  }, []);

  return {
    isConnected, connect, disconnect, sendCommand, error,
    ports, refreshPorts, selectedPort, setSelectedPort, baudRate, setBaudRate,
  };
}
