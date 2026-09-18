import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// isoTpRequest backs the DID-based readback (useWssReadback) — stub it so
// the poll gets canned per-wheel responses without a real CAN bus.
const isoTpRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/isotp', () => ({ isoTpRequest }));

// A controllable fake for Tauri's listen() — keyed by event name so tests
// can simulate a line arriving over either 'serial-data' (the Nano's own
// link) or 'kvaser-data' (real CAN traffic when Kvaser is the main
// transport and this Nano is only wired to drive the WSS signal).
const { handlers, emit } = vi.hoisted(() => {
  const handlers = new Map<string, ((e: { payload: string }) => void)[]>();
  return {
    handlers,
    emit: (event: string, payload: string) => {
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
import LegacySignalPanel from './LegacySignalPanel';

afterEach(() => { cleanup(); vi.useRealTimers(); });
// NOTE: braces matter — a bare `() => mock.mockReset()` returns the mock fn,
// which vitest then runs as a teardown hook (calling isoTpRequest() with no args).
beforeEach(() => { localStorage.clear(); handlers.clear(); isoTpRequest.mockReset(); });

// Recording requires a live signal type first — the frequency slider (and
// Record) stay disabled on "Stop".
function selectDf11() {
  fireEvent.click(screen.getByRole('button', { name: /^df11/i }));
}

function moveSlider(hz: number) {
  fireEvent.change(screen.getByRole('slider'), { target: { value: String(hz) } });
}

// useRecording.addRecordingPoint always seeds the *first* point of a take as
// a {time:0, frequency:0} anchor — whatever value that first call carries is
// discarded (mirrors the bench always starting from a standstill). So every
// take here fires one throwaway move before the moves that should be kept.
// That throwaway move must differ from the slider's current DOM value (0) —
// firing a "change" to an unchanged value never invokes React's onChange.
function recordRamp() {
  fireEvent.click(screen.getByRole('button', { name: /^record$/i }));
  moveSlider(1);   // discarded anchor (must differ from the current value, 0)
  moveSlider(200); // 0→200 accel
  moveSlider(0);   // 200→0 brake
  fireEvent.click(screen.getByRole('button', { name: /^stop$/i }));
}

// For playback-timing tests: fake timers must already be active, and the
// clock is advanced by a known amount between moves so the recorded cycle
// has an exact, predictable shape — 0 Hz at t=0, 200 Hz at t=5s, 0 Hz at
// t=10s — matching src/lib/signalPlayback.test.ts's CYCLE fixture.
function recordControlledRamp() {
  fireEvent.click(screen.getByRole('button', { name: /^record$/i }));
  moveSlider(1); // discarded anchor at t=0
  act(() => vi.advanceTimersByTime(5000));
  moveSlider(200); // accel, recorded at t=5s
  act(() => vi.advanceTimersByTime(5000));
  moveSlider(0); // brake, recorded at t=10s
  fireEvent.click(screen.getByRole('button', { name: /^stop$/i }));
}

describe('<LegacySignalPanel> — Recording Studio', () => {
  it('disables Record until a signal type is selected', () => {
    renderWithProviders(<LegacySignalPanel sendMessage={vi.fn()} isConnected />, { language: 'en' });
    expect(screen.getByRole('button', { name: /^record$/i })).toBeDisabled();
    selectDf11();
    expect(screen.getByRole('button', { name: /^record$/i })).toBeEnabled();
  });

  it('records slider moves as a timestamped profile and allows saving it', () => {
    renderWithProviders(<LegacySignalPanel sendMessage={vi.fn()} isConnected />, { language: 'en' });
    selectDf11();

    recordRamp();

    // RecordingControls surfaces the captured point count once stopped:
    // the discarded anchor (0), the accel point (200) and the brake point (0).
    expect(screen.getByText(/3 pts/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^play$/i })).toBeEnabled();
  });

  it('loops the recorded curve for the chosen duration, pausing 4s between cycles, then stops', async () => {
    vi.useFakeTimers();
    const sent: string[] = [];
    renderWithProviders(
      <LegacySignalPanel sendMessage={(m: string) => sent.push(m)} isConnected />,
      { language: 'en' },
    );
    selectDf11();
    sent.length = 0; // drop the DF11 waveform-select command

    recordControlledRamp();
    sent.length = 0; // drop the live commands sent while dragging

    // Shortest available duration so the test doesn't need to fast-forward
    // through many loops: use the number field directly.
    fireEvent.change(screen.getByDisplayValue('5'), { target: { value: '1' } }); // 1 minute = 60s

    fireEvent.click(screen.getByRole('button', { name: /^play$/i }));
    expect(screen.getByText(/test in progress/i)).toBeInTheDocument();

    // t=0: the recorded anchor (0 Hz) fires immediately.
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(sent).toEqual(['Frequency : 0\n']);
    sent.length = 0;

    // t=5s: accel point.
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(sent).toEqual(['Frequency : 200\n']);
    sent.length = 0;

    // t=10s: brake point — end of the first cycle.
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(sent).toEqual(['Frequency : 0\n']);
    sent.length = 0;

    // Nothing new during the 4s ABS-reaction pause (loop 2's own 0 Hz start
    // is deduped against the value already held from the end of loop 1).
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(sent).toEqual([]);

    // t=19s: second loop's accel point.
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(sent).toEqual(['Frequency : 200\n']);
    sent.length = 0;

    // t=24s: second loop's brake point.
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(sent).toEqual(['Frequency : 0\n']);

    // Run out the rest of the 60s test — playback stops itself.
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(screen.queryByText(/test in progress/i)).toBeNull();
    expect(screen.getByRole('button', { name: /^play$/i })).toBeInTheDocument();
  });

  it('Stop Playback cancels remaining timers and forces the signal to 0 Hz immediately', async () => {
    vi.useFakeTimers();
    const sent: string[] = [];
    renderWithProviders(
      <LegacySignalPanel sendMessage={(m: string) => sent.push(m)} isConnected />,
      { language: 'en' },
    );
    selectDf11();
    recordControlledRamp();
    fireEvent.change(screen.getByDisplayValue('5'), { target: { value: '10' } }); // 10 minutes

    fireEvent.click(screen.getByRole('button', { name: /^play$/i }));
    // Let the immediate (t=0) anchor command send, then stop mid-ramp.
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    sent.length = 0;

    fireEvent.click(screen.getByRole('button', { name: /^stop$/i }));
    expect(sent).toEqual(['Frequency : 0\n']);
    expect(screen.getByRole('button', { name: /^play$/i })).toBeInTheDocument();

    // Advancing time after Stop must not resurrect any cancelled timeout.
    sent.length = 0;
    await act(async () => { await vi.advanceTimersByTimeAsync(600_000); });
    expect(sent).toEqual([]);
  });

  it('preset duration buttons set the minute field', () => {
    renderWithProviders(<LegacySignalPanel sendMessage={vi.fn()} isConnected />, { language: 'en' });
    fireEvent.click(screen.getByRole('button', { name: '10m' }));
    expect(screen.getByDisplayValue('10')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '5m' }));
    expect(screen.getByDisplayValue('5')).toBeInTheDocument();
  });

  // The bug report this covers: switching the main CAN transport to Kvaser
  // (so this Nano is only wired to drive the WSS signal, not sniff the
  // bus) made the "ABS Speed Readback" grid go blank, because it only ever
  // listened on the Nano's own 'serial-data' line — real CAN traffic now
  // arrives on 'kvaser-data' instead. Both carry the identical
  // `<id> <dlc> <bytes...>` line shape on purpose (kvaser.rs's
  // `format_frame`), so the fix is listening on both.
  describe('live wheel-speed readback', () => {
    const seedChannel = () => localStorage.setItem('wssChannels', JSON.stringify([
      { canId: 0x201, byteIdx: 3, kmhScale: 1, kmhOffset: 0, kmhPerHz: 0.05 },
      null, null, null,
    ]));

    it('decodes a CAN frame arriving over the Nano\'s own serial-data link', async () => {
      seedChannel();
      renderWithProviders(<LegacySignalPanel sendMessage={vi.fn()} isConnected />, { language: 'en' });

      await act(async () => { emit('serial-data', '513 8 0 0 0 42 0 0 0 0'); });

      expect(screen.getByText('42.0')).toBeInTheDocument();
    });

    it('decodes a CAN frame arriving over Kvaser when Kvaser is the main CAN transport', async () => {
      seedChannel();
      renderWithProviders(<LegacySignalPanel sendMessage={vi.fn()} isConnected />, { language: 'en' });

      await act(async () => { emit('kvaser-data', '513 8 0 0 0 42 0 0 0 0'); });

      expect(screen.getByText('42.0')).toBeInTheDocument();
    });
  });

  // "I'm reading from the Autel and ABS, I know it's correct, not like the
  // guessing I'm doing with these calculations" — when the selected
  // reference has a known wssReadback spec, prefer the same active
  // DID-polling readback the Pico's Signal Tester uses over the passive
  // CAN-sniff one above, which needs a hand-mapped channel to work at all.
  describe('DID-based live wheel-speed readback (known reference)', () => {
    const FORD = { id: 'r1', reference: '10.0961-0191.3' }; // has a wssReadback spec
    const UNKNOWN = { id: 'r2', reference: '99.9999-9999.9' }; // no spec on file

    it('only appears when the selected reference has a known spec', () => {
      const { unmount } = renderWithProviders(
        <LegacySignalPanel sendMessage={vi.fn()} isConnected selectedRef={UNKNOWN} canSend={vi.fn()} />,
        { language: 'en' },
      );
      expect(screen.queryByTestId('legacy-wss-readback')).toBeNull();
      unmount();

      renderWithProviders(
        <LegacySignalPanel sendMessage={vi.fn()} isConnected selectedRef={FORD} canSend={vi.fn()} />,
        { language: 'en' },
      );
      expect(screen.getByTestId('legacy-wss-readback')).toBeInTheDocument();
    });

    it('polls the ECU over ISO-TP through canSend and flags against the driven frequency', async () => {
      // FL/FR/RL/RR DIDs are 0x2B 06..09 on 0x760→0x768 for this ref.
      isoTpRequest.mockImplementation(async (opts: { data: number[] }) => {
        const did = opts.data[2];
        return { payload: [0x62, 0x2b, did, 5], fromId: 0x768, pending: false };
      });
      const canSend = vi.fn().mockResolvedValue(true);
      renderWithProviders(
        <LegacySignalPanel sendMessage={vi.fn()} isConnected selectedRef={FORD} canSend={canSend} />,
        { language: 'en' },
      );
      selectDf11();
      moveSlider(100); // default geometry (2 m circ, 48 ppr) → 15 km/h commanded

      fireEvent.click(screen.getByTestId('btn-legacy-wss-readback'));

      await waitFor(() =>
        expect(screen.getByTestId('legacy-wss-wheel-FL')).toHaveTextContent('5.0'));
      // 15 km/h commanded vs 5 km/h measured is well outside tolerance.
      expect(screen.getByTestId('legacy-wss-wheel-FL')).toHaveAttribute('data-status', 'off');
    });

    it('reads without needing the Nano signal-generator link connected — only canSend is required', async () => {
      isoTpRequest.mockImplementation(async (opts: { data: number[]; send: (m: string) => unknown }) => {
        await opts.send('CANTx : 760 22 2B 00 00 00 00 00 00\n'); // exercise the real send path
        const did = opts.data[2];
        return { payload: [0x62, 0x2b, did, 3], fromId: 0x768, pending: false };
      });
      const canSend = vi.fn().mockResolvedValue(true);
      renderWithProviders(
        <LegacySignalPanel sendMessage={vi.fn()} isConnected={false} selectedRef={FORD} canSend={canSend} />,
        { language: 'en' },
      );
      expect(screen.getByTestId('btn-legacy-wss-readback')).not.toBeDisabled();
      fireEvent.click(screen.getByTestId('btn-legacy-wss-readback'));

      await waitFor(() =>
        expect(screen.getByTestId('legacy-wss-wheel-FL')).toHaveTextContent('3.0'));
      expect(canSend).toHaveBeenCalled();
    });
  });

  it('unmounting mid-playback clears pending timers (no crash, no further sends)', async () => {
    vi.useFakeTimers();
    const sent: string[] = [];
    const { unmount } = renderWithProviders(
      <LegacySignalPanel sendMessage={(m: string) => sent.push(m)} isConnected />,
      { language: 'en' },
    );
    selectDf11();
    recordControlledRamp();
    fireEvent.change(screen.getByDisplayValue('5'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /^play$/i }));
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); }); // into the accel point
    sent.length = 0;

    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(600_000); });
    expect(sent).toEqual([]);
  });
});
