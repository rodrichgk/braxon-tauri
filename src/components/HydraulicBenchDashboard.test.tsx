import { describe, it, expect, afterEach, vi } from 'vitest';

// Fan-out serial-data mock (ReportsProvider in the wrapper also subscribes).
const { emit, listen } = vi.hoisted(() => {
  const handlers = new Set<{ name: string; cb: (e: { payload: unknown }) => unknown }>();
  return {
    listen: vi.fn(async (name: string, cb: (e: { payload: unknown }) => unknown) => {
      const entry = { name, cb };
      handlers.add(entry);
      return () => handlers.delete(entry);
    }),
    emit: async (name: string, payload: unknown) => {
      for (const h of [...handlers]) if (h.name === name) await h.cb({ payload });
    },
  };
});
vi.mock('@tauri-apps/api/event', () => ({ listen }));

import { renderWithProviders, cleanup, screen, act, fireEvent } from '@/test/render';
import HydraulicBenchDashboard from '@/components/HydraulicBenchDashboard';

function parseLine(line: string): { kind: string; [k: string]: unknown } {
  if (line === 'OK') return { kind: 'ok' };
  if (line === 'ACK Hydraulics') return { kind: 'ack', board: 'Hydraulics' };
  if (line === 'Hydraulics') return { kind: 'discovery_broadcast', board: 'Hydraulics' };
  return { kind: 'raw', key: line, value: null };
}

const opts = {
  user: { id: 'u1', name: 'Tech', role: 'technicien' as const },
  tauri: {
    f2evo_parse_line: (a: Record<string, unknown>) => parseLine(String(a.line)),
    f2evo_probe: () => 'Hydraulics',
    f2evo_hydraulic_send: (a: Record<string, unknown>) => JSON.stringify(a.command),
  },
  tauriFallback: () => [] as unknown,
  language: 'en' as const,
};

const hydSends = (calls: Array<{ cmd: string; args: Record<string, unknown> }>) =>
  calls.filter(c => c.cmd === 'f2evo_hydraulic_send').map(c => c.args.command);
const emitLine = (line: string) => act(async () => { await emit('serial-data', line); });

afterEach(cleanup);

describe('HydraulicBenchDashboard — disconnect / reconnect', () => {
  it('shows a Disconnect once linked, and Disconnect pauses the link (POD off + status stop)', async () => {
    const { tauriCalls } = renderWithProviders(<HydraulicBenchDashboard isConnected />, opts);
    await emitLine('ACK Hydraulics'); // -> linked
    const btn = screen.getByTestId('hyd-btn-release');
    expect(btn).toBeEnabled();

    await act(async () => { fireEvent.click(btn); });
    for (let i = 0; i < 2; i++) await emitLine('OK'); // drain pod_disable + disable_status

    const cmds = hydSends(tauriCalls);
    expect(cmds).toContainEqual({ action: 'pod_disable' });
    expect(cmds).toContainEqual({ action: 'disable_status' });
    expect(screen.getByText(/link paused/i)).toBeInTheDocument();
    expect(screen.getByTestId('hyd-btn-reconnect')).toBeInTheDocument();
  });

  it('a paused link ignores a re-announcement, and Reconnect re-runs the handshake', async () => {
    const { tauriCalls } = renderWithProviders(<HydraulicBenchDashboard isConnected />, opts);
    await emitLine('ACK Hydraulics');
    await act(async () => { fireEvent.click(screen.getByTestId('hyd-btn-release')); });
    for (let i = 0; i < 2; i++) await emitLine('OK'); // drain pod_disable + disable_status
    tauriCalls.length = 0;

    await emitLine('Hydraulics'); // stray re-announce while paused
    expect(hydSends(tauriCalls)).not.toContainEqual({ action: 'ack_hydraulics' });

    await act(async () => { fireEvent.click(screen.getByTestId('hyd-btn-reconnect')); });
    await emitLine('OK'); // drain ack_hydraulics -> enable_status goes out
    const cmds = hydSends(tauriCalls);
    expect(cmds).toContainEqual({ action: 'ack_hydraulics' });
    expect(cmds).toContainEqual({ action: 'enable_status' });
    expect(screen.queryByText(/link paused/i)).not.toBeInTheDocument();
  });

  it('a real disconnect clears the paused state (fresh connect auto-links)', async () => {
    const { rerender } = renderWithProviders(<HydraulicBenchDashboard isConnected />, opts);
    await emitLine('ACK Hydraulics');
    await act(async () => { fireEvent.click(screen.getByTestId('hyd-btn-release')); });
    expect(screen.getByText(/link paused/i)).toBeInTheDocument();

    vi.useFakeTimers();
    try {
      rerender(<HydraulicBenchDashboard isConnected={false} />);
      await act(async () => { await vi.advanceTimersByTimeAsync(4000); }); // past the 3 s grace wipe
    } finally {
      vi.useRealTimers();
    }
    rerender(<HydraulicBenchDashboard isConnected />);
    expect(screen.queryByText(/link paused/i)).not.toBeInTheDocument();
  });
});
