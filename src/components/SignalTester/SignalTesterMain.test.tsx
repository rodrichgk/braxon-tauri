import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// isoTpRequest is the ECU transport — stub it so the readback poll gets
// canned per-wheel responses without a real CAN bus.
const isoTpRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/isotp', () => ({ isoTpRequest }));

// listen() is used for the serial log here. Keyed by event name so tests
// can simulate an RX line arriving over either 'serial-data' (board bridge)
// or 'kvaser-data' (Kvaser as the active CAN transport) — CANSettings.tsx /
// CANAnalyzer.tsx / LiveData.tsx / ReportsContext.tsx all already listen to
// both for exactly this reason.
const { handlers, emitLine } = vi.hoisted(() => {
  const handlers = new Map<string, ((e: { payload: string }) => void)[]>();
  return {
    handlers,
    emitLine: (event: string, payload: string) => {
      (handlers.get(event) ?? []).forEach(cb => cb({ payload }));
    },
  };
});
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (event: string, cb: (e: { payload: string }) => void) => {
    const arr = handlers.get(event) ?? [];
    arr.push(cb);
    handlers.set(event, arr);
    return () => { handlers.set(event, (handlers.get(event) ?? []).filter(h => h !== cb)); };
  }),
}));

import { renderWithProviders, cleanup, screen, act, fireEvent, waitFor } from '@/test/render';
import SignalTesterMain from './SignalTesterMain';

const FORD = '10.0961-0191.3';
const baseTauri = { get_wss_calibration: () => null, save_wss_calibration: () => null };
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

afterEach(cleanup);
// NOTE: braces matter — a bare `() => mock.mockReset()` returns the mock fn,
// which vitest then runs as a teardown hook (calling isoTpRequest() with no args).
beforeEach(() => { isoTpRequest.mockReset(); localStorage.clear(); handlers.clear(); });

describe('<SignalTesterMain> — live wheel-speed readback', () => {
  it('shows nothing extra for a reference with no read spec on file', () => {
    renderWithProviders(
      <SignalTesterMain sendMessage={vi.fn()} isConnected canSend={vi.fn()}
        selectedRef={{ id: 'x', reference: '99.9999-9999.9' }} />,
      { tauri: baseTauri, tauriFallback: () => [] },
    );
    expect(screen.queryByTestId('wss-readback')).toBeNull();
  });

  it('polls the four wheel DIDs and flags each against its commanded speed', async () => {
    // FL/FR/RR echo ~5 km/h (matches a 5 km/h command); RL echoes 9 — well
    // past the absolute-error floor, so a clear fault.
    isoTpRequest.mockImplementation(async (opts: { data: number[]; recvIds: number[] }) => {
      const did = opts.data[2];
      const kmh = did === 0x08 ? 9 : 5;
      return { payload: [0x62, 0x2b, did, kmh], fromId: opts.recvIds[0] };
    });
    const canSend = vi.fn().mockResolvedValue(true);
    renderWithProviders(
      <SignalTesterMain sendMessage={vi.fn()} isConnected canSend={canSend}
        selectedRef={{ id: 'r1', reference: FORD }} />,
      { tauri: baseTauri, tauriFallback: () => [] },
    );

    // Command 5 km/h (quick button) so every wheel has a target.
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^5$/ })); });
    await act(async () => { fireEvent.click(screen.getByTestId('btn-wss-readback')); });

    // Wait for the last wheel in the round-robin — by then all four are polled.
    await waitFor(() => {
      expect(screen.getByTestId('wss-wheel-RR')).toHaveAttribute('data-status', 'ok');
    }, { timeout: 3000 });
    expect(screen.getByTestId('wss-wheel-FL')).toHaveAttribute('data-status', 'ok');
    expect(screen.getByTestId('wss-wheel-FR')).toHaveAttribute('data-status', 'ok');
    expect(screen.getByTestId('wss-wheel-RL')).toHaveAttribute('data-status', 'off'); // reads 9 vs cmd ~5
    expect(screen.getByTestId('wss-wheel-FL')).toHaveTextContent('5.0');
    expect(isoTpRequest).toHaveBeenCalledWith(
      expect.objectContaining({ sendId: 0x760, recvIds: [0x768], data: [0x22, 0x2b, 0x06] }),
    );
  });

  it('flags a driven wheel that returns nothing as no-signal', async () => {
    isoTpRequest.mockResolvedValue(null); // ECU silent
    renderWithProviders(
      <SignalTesterMain sendMessage={vi.fn()} isConnected canSend={vi.fn().mockResolvedValue(true)}
        selectedRef={{ id: 'r1', reference: FORD }} />,
      { tauri: baseTauri, tauriFallback: () => [] },
    );
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^5$/ })); });
    await act(async () => { fireEvent.click(screen.getByTestId('btn-wss-readback')); });
    await waitFor(() => {
      expect(screen.getByTestId('wss-wheel-FL')).toHaveAttribute('data-status', 'no-signal');
    }, { timeout: 2000 });
    expect(screen.getByTestId('wss-readback')).toHaveTextContent(/no response/i);
  });

  it('checks against the legacy Nano frequency instead of the Pico when that source is selected', async () => {
    // 33 Hz * (2 m circ, 48 ppr) ≈ 4.95 km/h — close enough to the FL/FR/RR
    // 5 km/h mock to read "ok", far enough from RL's 9 km/h mock to read "off".
    localStorage.setItem('legacyFreq', '33');
    isoTpRequest.mockImplementation(async (opts: { data: number[]; recvIds: number[] }) => {
      const did = opts.data[2];
      const kmh = did === 0x08 ? 9 : 5;
      return { payload: [0x62, 0x2b, did, kmh], fromId: opts.recvIds[0] };
    });
    const canSend = vi.fn().mockResolvedValue(true);
    renderWithProviders(
      <SignalTesterMain sendMessage={vi.fn()} isConnected canSend={canSend}
        selectedRef={{ id: 'r1', reference: FORD }} />,
      { tauri: baseTauri, tauriFallback: () => [] },
    );

    // No Pico quick-speed clicked — the Pico command stays at 0 for every
    // wheel, so this would misread as "off" (or worse, "idle") if the legacy
    // source didn't override `commanded`.
    await act(async () => { fireEvent.click(screen.getByTestId('signal-source-legacy')); });
    await act(async () => { fireEvent.click(screen.getByTestId('btn-wss-readback')); });

    await waitFor(() => {
      expect(screen.getByTestId('wss-wheel-RR')).toHaveAttribute('data-status', 'ok');
    }, { timeout: 3000 });
    expect(screen.getByTestId('wss-wheel-FL')).toHaveAttribute('data-status', 'ok');
    expect(screen.getByTestId('wss-wheel-RL')).toHaveAttribute('data-status', 'off'); // 9 vs ~4.95 km/h
  });

  it('reads wheel speeds without the Pico signal board connected — only canSend is required', async () => {
    // Testing manually: no Pico wired up at all (isConnected=false), just the
    // main CAN transport reading the ECU back. Reading must not depend on the
    // signal board — that board only matters for *commanding* a frequency.
    isoTpRequest.mockImplementation(async (opts: { data: number[]; recvIds: number[]; send: (m: string) => unknown }) => {
      await opts.send('CANTx : 760 22 2B 00 00 00 00 00 00\n'); // exercise the real send path (canSend), same as production
      const did = opts.data[2];
      return { payload: [0x62, 0x2b, did, 12], fromId: opts.recvIds[0] };
    });
    const canSend = vi.fn().mockResolvedValue(true);
    renderWithProviders(
      <SignalTesterMain sendMessage={vi.fn()} isConnected={false} canSend={canSend}
        selectedRef={{ id: 'r1', reference: FORD }} />,
      { tauri: baseTauri, tauriFallback: () => [] },
    );

    expect(screen.getByTestId('btn-wss-readback')).not.toBeDisabled();
    await act(async () => { fireEvent.click(screen.getByTestId('signal-source-manual')); });
    await act(async () => { fireEvent.click(screen.getByTestId('btn-wss-readback')); });

    await waitFor(() => {
      expect(screen.getByTestId('wss-wheel-RR')).toHaveTextContent('12.0');
    }, { timeout: 3000 });
    expect(canSend).toHaveBeenCalled();
  });

  it('never flags a fault in manual mode, regardless of how far the readings diverge', async () => {
    isoTpRequest.mockImplementation(async (opts: { data: number[]; recvIds: number[] }) => {
      const did = opts.data[2];
      const kmh = did === 0x08 ? 9 : 5; // same spread that reads "off" under pico/legacy
      return { payload: [0x62, 0x2b, did, kmh], fromId: opts.recvIds[0] };
    });
    const canSend = vi.fn().mockResolvedValue(true);
    renderWithProviders(
      <SignalTesterMain sendMessage={vi.fn()} isConnected canSend={canSend}
        selectedRef={{ id: 'r1', reference: FORD }} />,
      { tauri: baseTauri, tauriFallback: () => [] },
    );

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^5$/ })); }); // pico command, ignored in manual mode
    await act(async () => { fireEvent.click(screen.getByTestId('signal-source-manual')); });
    await act(async () => { fireEvent.click(screen.getByTestId('btn-wss-readback')); });

    await waitFor(() => {
      expect(screen.getByTestId('wss-wheel-RR')).toHaveTextContent('5.0');
    }, { timeout: 3000 });
    for (const label of ['FL', 'FR', 'RL', 'RR']) {
      expect(screen.getByTestId(`wss-wheel-${label}`)).toHaveAttribute('data-status', 'unknown');
    }
    expect(screen.getByTestId('wss-wheel-RL')).toHaveTextContent('9.0'); // the raw reading still shows
    expect(screen.getByTestId('wss-readback')).toHaveTextContent(/no verdict/i);
  });
});

describe('<SignalTesterMain> — per-reference protocol', () => {
  it('applies a saved protocol assignment + geometry when a reference is selected', async () => {
    const saved = JSON.stringify({
      circ: 2.05, ppr: 44, channels: [null, null, null, null],
      protocol: { profiles: [4, 1, 5, 0], akMultipliers: [200, 100, 150, 100] },
    });
    const sent: string[] = [];
    renderWithProviders(
      <SignalTesterMain sendMessage={(m: string) => { sent.push(m); }} isConnected
        selectedRef={{ id: 'r1', reference: FORD }} />,
      { tauri: { ...baseTauri, get_wss_calibration: () => saved }, tauriFallback: () => [] },
    );
    await settle();
    // Every channel gets its protocol; AK channels (0 and 2) also get a multiplier.
    expect(sent).toEqual(expect.arrayContaining(['C0,4\n', 'C1,1\n', 'C2,5\n', 'C3,0\n', 'M0,200\n', 'M2,150\n']));
    expect(sent).not.toContain('M1,100\n'); // ch1 is DF11 → no multiplier push
    // Geometry applied to the wheel-model inputs.
    expect(screen.getByDisplayValue('2.05')).toBeInTheDocument();
    expect(screen.getByDisplayValue('44')).toBeInTheDocument();
    expect(screen.getByTestId('wss-ref-status')).toHaveTextContent(new RegExp(FORD));
  });

  it('Save to reference merges the protocol and keeps the existing channels', async () => {
    let savedCalibration: string | null = null;
    renderWithProviders(
      <SignalTesterMain sendMessage={vi.fn()} isConnected
        selectedRef={{ id: 'r1', reference: FORD }} />,
      {
        tauri: {
          get_wss_calibration: () => JSON.stringify({ circ: 2, ppr: 48, channels: [{ canId: 1, byteIdx: 3 }, null, null, null] }),
          save_wss_calibration: (a: Record<string, unknown>) => { savedCalibration = String(a.calibration); return null; },
        },
        tauriFallback: () => [],
      },
    );
    await settle();
    await act(async () => { fireEvent.click(screen.getByTestId('btn-wss-save-ref')); });
    await settle();

    expect(savedCalibration).not.toBeNull();
    const blob = JSON.parse(savedCalibration as unknown as string);
    expect(blob.protocol).toEqual({ profiles: [0, 0, 0, 0], akMultipliers: [100, 100, 100, 100] });
    expect(blob.channels).toEqual([{ canId: 1, byteIdx: 3 }, null, null, null]); // untouched
    expect(blob.circ).toBe(2);
    expect(blob.ppr).toBe(48);
  });
});

describe('<SignalTesterMain> — Serial Log', () => {
  it('shows RX traffic arriving over either the board bridge or Kvaser', async () => {
    renderWithProviders(
      <SignalTesterMain sendMessage={vi.fn()} isConnected canSend={vi.fn()}
        selectedRef={{ id: 'r1', reference: FORD }} />,
      { tauri: baseTauri, tauriFallback: () => [] },
    );

    // Board bridge traffic (e.g. the WSS Nano/Pico sharing the CAN port).
    await act(async () => { emitLine('serial-data', '2016 3 3 127 34'); });
    expect(screen.getByText('RX: 2016 3 3 127 34')).toBeInTheDocument();

    // Kvaser traffic — the diagnostic session can be on Kvaser while this
    // signal board stays on its own USB link; RX lines must still surface.
    await act(async () => { emitLine('kvaser-data', '1541 8 12 34 0 0 0 0 0 0'); });
    expect(screen.getByText('RX: 1541 8 12 34 0 0 0 0 0 0')).toBeInTheDocument();
  });
});
