import { describe, it, expect, afterEach, vi } from 'vitest';

// Drive the board's `serial-data` events by hand. The wrapper tree's
// ReportsProvider also subscribes to `serial-data`, so the mock keeps every
// registered handler and `emit` fans out to all of them (a single-slot Map
// would let the provider's listener shadow the component's).
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
import ElectronicsBenchDashboard from '@/components/ElectronicsBenchDashboard';

// Just enough of f2evo.rs::parse_line for the lines these tests emit.
function parseLine(line: string): { kind: string; [k: string]: unknown } {
  if (line === 'OK') return { kind: 'ok' };
  if (line === 'Electronics') return { kind: 'discovery_broadcast', board: 'Electronics' };
  if (line === 'Check ok') return { kind: 'check_ok' };
  const idx = line.indexOf(':');
  const key = idx === -1 ? line : line.slice(0, idx);
  const rest = idx === -1 ? null : line.slice(idx + 1).trim();
  if (key === 'Information') return { kind: 'information' }; // bare or "Information: <text>"
  if (key === 'Volt') return { kind: 'volt', volts: Number(rest) * 0.0146484375 };
  if (key === 'Current') return { kind: 'current', amps: Number(rest) * 0.06103515625 };
  if (key === 'Comunication') return { kind: 'comunication', state: rest ?? '' };
  return { kind: 'raw', key, value: rest };
}

const opts = {
  user: { id: 'u1', name: 'Tech', role: 'technicien' as const },
  tauri: {
    f2evo_parse_line: (a: Record<string, unknown>) => parseLine(String(a.line)),
    f2evo_probe: (a: Record<string, unknown>) => String(a.board),
    f2evo_bench_mode: (a: Record<string, unknown>) => (a.mode === 'electronic' ? 'ELECTRONIC' : 'HYDRAULIC'),
    f2evo_electronics_send: (a: Record<string, unknown>) => JSON.stringify(a.command),
    get_serial_ports: () => [{ port_name: 'COM8' }, { port_name: 'COM9' }],
    is_ecu_serial_connected: () => false,
    connect_ecu_serial: () => null,
    disconnect_ecu_serial: () => null,
  },
  tauriFallback: () => [] as unknown,
  language: 'en' as const,
};

const modeCalls = (calls: Array<{ cmd: string; args: Record<string, unknown> }>) =>
  calls.filter(c => c.cmd === 'f2evo_bench_mode').map(c => c.args.mode);

const sentCommands = (calls: Array<{ cmd: string; args: Record<string, unknown> }>) =>
  calls.filter(c => c.cmd === 'f2evo_electronics_send').map(c => c.args.command);

const emitLine = async (line: string) => {
  await act(async () => {
    await emit('serial-data', line);
    await new Promise(r => setTimeout(r, 0));
  });
};

// Get the bench to the state where action buttons are live: linked (ECU
// mode) + a model uploaded (its preamble is fire-and-forget; one OK drains
// the queued model-JSON upload).
// Works under real or fake timers.
const linkAndLoadModel = async (fake = false) => {
  const ok = fake
    ? () => act(async () => { await emit('serial-data', 'OK'); })
    : () => emitLine('OK');
  fake
    ? await act(async () => { await emit('serial-data', 'Information'); })
    : await emitLine('Information');
  await act(async () => { fireEvent.click(screen.getByTestId('btn-model')); });
  await act(async () => { fireEvent.click(screen.getByTestId('btn-model-load')); });
  // Only `load_model` goes through the reliable queue (the 4 preamble
  // commands are fire-and-forget); one OK drains it.
  await ok();
};

afterEach(cleanup);

describe('ElectronicsBenchDashboard', () => {
  it('shows an offline notice and disables actions when not connected', () => {
    renderWithProviders(<ElectronicsBenchDashboard isConnected={false} />, opts);
    expect(screen.getByTestId('abs-offline')).toBeInTheDocument();
    expect(screen.getByTestId('btn-battery')).toBeDisabled();
  });

  it('holds actions disabled until the bench is linked AND a model is loaded', async () => {
    renderWithProviders(<ElectronicsBenchDashboard isConnected />, opts);
    expect(screen.getByTestId('btn-battery')).toBeDisabled(); // still "switching"
    await emitLine('Information'); // linked, but no model yet
    expect(screen.getByTestId('btn-battery')).toBeDisabled();
    await act(async () => { fireEvent.click(screen.getByTestId('btn-model')); });
    await act(async () => { fireEvent.click(screen.getByTestId('btn-model-load')); });
    expect(screen.getByTestId('btn-battery')).toBeEnabled();
  });

  it('gates Key Power and Speed Test behind the earlier steps', async () => {
    const { user } = renderWithProviders(<ElectronicsBenchDashboard isConnected />, opts);
    await linkAndLoadModel();
    expect(screen.getByTestId('btn-battery')).toBeEnabled();
    expect(screen.getByTestId('btn-key')).toBeDisabled();
    expect(screen.getByTestId('btn-speed')).toBeDisabled();

    await user.click(screen.getByTestId('btn-battery'));
    expect(screen.getByTestId('btn-key')).toBeEnabled();
    expect(screen.getByTestId('btn-speed')).toBeDisabled();
  });

  it('sends a lone Check Code when Battery Voltage is engaged', async () => {
    const { user, tauriCalls } = renderWithProviders(<ElectronicsBenchDashboard isConnected />, opts);
    await linkAndLoadModel();
    await user.click(screen.getByTestId('btn-battery'));
    expect(sentCommands(tauriCalls)).toContainEqual({ action: 'check_code' });
  });

  it('runs Set Rele ON then Start Test once Key Power is engaged (queue draining on OK)', async () => {
    const { user, tauriCalls } = renderWithProviders(<ElectronicsBenchDashboard isConnected />, opts);
    await linkAndLoadModel();
    await user.click(screen.getByTestId('btn-battery'));
    await emitLine('OK'); // ack Check Code

    await user.click(screen.getByTestId('btn-key'));
    for (let i = 0; i < 4; i++) await emitLine('OK'); // ack the 4-command sequence

    const cmds = sentCommands(tauriCalls).map(c => JSON.stringify(c));
    const relayAt = cmds.indexOf(JSON.stringify({ action: 'set_relay', on: true }));
    const startAt = cmds.indexOf(JSON.stringify({ action: 'start_test' }));
    expect(relayAt).toBeGreaterThanOrEqual(0);
    expect(startAt).toBeGreaterThan(relayAt);
  });

  it('reflects a Volt line from the board in the voltage readout', async () => {
    renderWithProviders(<ElectronicsBenchDashboard isConnected />, opts);
    expect(screen.getByTestId('abs-voltage')).toHaveTextContent('—');
    await emitLine('Volt:1024'); // 1024 * 0.0146484375 ≈ 15.0 V
    expect(screen.getByTestId('abs-voltage')).toHaveTextContent('15.0');
    expect(screen.getByTestId('abs-link-state')).toHaveTextContent(/linked/i);
  });

  it('sends ACK Electronics when the bench announces via an Information line', async () => {
    const { tauriCalls } = renderWithProviders(<ElectronicsBenchDashboard isConnected />, opts);
    tauriCalls.length = 0; // ignore the on-connect one-shot ack
    await emitLine('Information: Electronic connected.');
    expect(sentCommands(tauriCalls)).toContainEqual({ action: 'ack_electronics' });
    expect(screen.getByTestId('abs-link-state')).toHaveTextContent(/linked/i);
  });

  it('advances the command queue on a substantive reply, not just a bare OK', async () => {
    const { user, tauriCalls } = renderWithProviders(<ElectronicsBenchDashboard isConnected />, opts);
    await emitLine('Information'); // linked
    await user.click(screen.getByTestId('btn-battery')); // -> check_code (front)
    await emitLine('Check ok'); // no OK from this board — the reply itself must drain it
    // check_ok drains check_code; its follow-up (Set ReleExt ON) can now go out.
    await emitLine('OK');
    expect(sentCommands(tauriCalls)).toContainEqual({ action: 'set_relay_ext', on: true });
  });

  it('auto-acks an Electronics discovery broadcast', async () => {
    const { tauriCalls } = renderWithProviders(<ElectronicsBenchDashboard isConnected />, opts);
    await emitLine('Electronics');
    expect(sentCommands(tauriCalls)).toContainEqual({ action: 'ack_electronics' });
  });

  it('fills the form from the catalogue picker and uploads that model', async () => {
    const { tauriCalls } = renderWithProviders(<ElectronicsBenchDashboard isConnected />, opts);
    await emitLine('Information');
    await act(async () => { fireEvent.click(screen.getByTestId('btn-model')); });

    await act(async () => { fireEvent.change(screen.getByTestId('model-mfr'), { target: { value: 'Mini' } }); });
    const pick = screen.getByTestId('model-pick') as HTMLSelectElement;
    const miniOpt = [...pick.options].find(o => o.text.includes('Mini MK60'))!;
    expect(miniOpt).toBeTruthy();
    await act(async () => { fireEvent.change(pick, { target: { value: miniOpt.value } }); });

    await act(async () => { fireEvent.click(screen.getByTestId('btn-model-load')); });
    await emitLine('OK'); // drain load_model

    const load = sentCommands(tauriCalls).find(
      (c): c is { action: 'load_model'; json: string } =>
        (c as { action: string }).action === 'load_model',
    );
    const payload = JSON.parse(load!.json);
    expect(payload.Model).toContain('Mini MK60');
    expect(payload.Code).toBe(2019);
    expect(payload.Wheel1Res1).toBe(2100);
    expect(screen.getByTestId('abs-cable')).toHaveTextContent('GRM0019');
  });

  it('streams the model CAN init on Key Power and holds Start Test until comms come alive', async () => {
    const { tauriCalls } = renderWithProviders(<ElectronicsBenchDashboard isConnected />, opts);
    await emitLine('Information');

    // Alfa "Mito Bosch 8.1" (id 1) has a Stringhe entry (1 base + 1 motor
    // frame) and WaitComunication = true.
    await act(async () => { fireEvent.click(screen.getByTestId('btn-model')); });
    await act(async () => { fireEvent.change(screen.getByTestId('model-mfr'), { target: { value: 'Alfa' } }); });
    const pick = screen.getByTestId('model-pick') as HTMLSelectElement;
    const opt = [...pick.options].find(o => o.text.includes('Mito Bosch 8.1'))!;
    expect(opt).toBeTruthy();
    await act(async () => { fireEvent.change(pick, { target: { value: opt.value } }); });
    await act(async () => { fireEvent.click(screen.getByTestId('btn-model-load')); });
    await emitLine('OK'); // drain load_model

    await act(async () => { fireEvent.click(screen.getByTestId('btn-battery')); });
    await emitLine('Check ok'); // drains check_code
    await emitLine('OK');       // drains Set ReleExt ON

    await act(async () => { fireEvent.click(screen.getByTestId('btn-key')); });
    // Set Rele ON + the CAN batch go out; Start Test does NOT (deferred).
    let cmds = sentCommands(tauriCalls);
    expect(cmds).toContainEqual({ action: 'set_relay', on: true });
    await emitLine('OK'); // drain Set Rele ON -> the can_frames batch is sent
    cmds = sentCommands(tauriCalls);
    expect(cmds.some(c => (c as { action: string }).action === 'can_frames')).toBe(true);
    expect(cmds).not.toContainEqual({ action: 'start_test' });
    expect(screen.getByTestId('abs-link-state').closest('.card')).toHaveTextContent(/CAN init|CAN bus/i);

    await emitLine('OK'); // drain the can_frames batch -> queue empty, waiting on comms
    // The bus reports in → the deferred Start Test fires.
    await emitLine('Comunication: Active KWP');
    for (let i = 0; i < 3; i++) await emitLine('OK');
    expect(sentCommands(tauriCalls)).toContainEqual({ action: 'start_test' });
  });

  it('lets the operator cancel a long CAN init upload and starts the test anyway', async () => {
    const { tauriCalls } = renderWithProviders(<ElectronicsBenchDashboard isConnected />, opts);
    await emitLine('Information');

    // Mini MK60 (id 274): 80 CAN base frames → 16 batches, WaitComunication.
    await act(async () => { fireEvent.click(screen.getByTestId('btn-model')); });
    await act(async () => { fireEvent.change(screen.getByTestId('model-mfr'), { target: { value: 'Mini' } }); });
    const pick = screen.getByTestId('model-pick') as HTMLSelectElement;
    const opt = [...pick.options].find(o => o.text.includes('Mini MK60'))!;
    await act(async () => { fireEvent.change(pick, { target: { value: opt.value } }); });
    await act(async () => { fireEvent.click(screen.getByTestId('btn-model-load')); });
    await emitLine('OK');

    await act(async () => { fireEvent.click(screen.getByTestId('btn-battery')); });
    await emitLine('Check ok');
    await emitLine('OK');
    await act(async () => { fireEvent.click(screen.getByTestId('btn-key')); });
    await emitLine('OK'); // drain Set Rele ON → CAN batches start streaming

    // The cancel affordance is offered while frames are queued.
    const cancel = screen.getByTestId('btn-can-cancel');
    await act(async () => { fireEvent.click(cancel); });
    const sentBefore = sentCommands(tauriCalls).filter(c => (c as { action: string }).action === 'can_frames').length;

    // No more CAN frames go out, and the held Start Test is released.
    for (let i = 0; i < 4; i++) await emitLine('OK');
    const sentAfter = sentCommands(tauriCalls).filter(c => (c as { action: string }).action === 'can_frames').length;
    expect(sentAfter).toBe(sentBefore);
    expect(sentCommands(tauriCalls)).toContainEqual({ action: 'start_test' });
    expect(screen.queryByTestId('btn-can-cancel')).not.toBeInTheDocument();
  });

  it('uploads the model JSON and shows the cable to connect', async () => {
    const { tauriCalls } = renderWithProviders(<ElectronicsBenchDashboard isConnected />, opts);
    await emitLine('Information');
    expect(screen.getByText(/no model selected/i)).toBeInTheDocument();

    await act(async () => { fireEvent.click(screen.getByTestId('btn-model')); });
    await act(async () => {
      fireEvent.change(screen.getByTestId('model-code'), { target: { value: '2137' } });
    });
    await act(async () => { fireEvent.click(screen.getByTestId('btn-model-load')); });

    // The 4 preamble commands go out fire-and-forget (no queue stall on a
    // silent bench); the model JSON is the only queued one.
    const preamble = sentCommands(tauriCalls).map(c => (c as { action: string }).action);
    expect(preamble).toEqual(expect.arrayContaining(['stop_test', 'frequency', 'select_out', 'passive']));

    const load = sentCommands(tauriCalls).find(
      (c): c is { action: 'load_model'; json: string } =>
        (c as { action: string }).action === 'load_model',
    );
    expect(load).toBeTruthy();
    const payload = JSON.parse(load!.json);
    expect(payload.Model).toBe('Generic ABS');
    expect(payload.Code).toBe(2137);
    expect(payload.Component).toBe(0);
    expect(payload.Signal).toBe(1); // default signal 0 + 1

    expect(screen.getByTestId('abs-cable')).toHaveTextContent('GRM0137');
    expect(screen.queryByText(/no model selected/i)).not.toBeInTheDocument();
  });

  it('pulls the shared bench into ECU mode on connect (ELECTRONIC + a boot-keyword fallback)', () => {
    const { tauriCalls } = renderWithProviders(<ElectronicsBenchDashboard isConnected />, opts);
    expect(modeCalls(tauriCalls)).toContain('electronic');
    // The boot keyword goes out once too, for firmware that only knows it.
    expect(tauriCalls.some(c => c.cmd === 'f2evo_probe' && c.args.board === 'electronics')).toBe(true);
  });

  it('stops poking ECU mode once the board links', async () => {
    vi.useFakeTimers();
    try {
      const { tauriCalls } = renderWithProviders(<ElectronicsBenchDashboard isConnected />, opts);
      await act(async () => { await emit('serial-data', 'Information'); }); // -> linked
      const after = modeCalls(tauriCalls).length;
      await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
      expect(modeCalls(tauriCalls).length).toBe(after); // no further ELECTRONIC pokes
    } finally {
      vi.useRealTimers();
    }
  });

  it('Release stands the ECU outputs down, hands the bench back, and hides ECU actions', async () => {
    vi.useFakeTimers();
    try {
      const { tauriCalls } = renderWithProviders(<ElectronicsBenchDashboard isConnected />, opts);
      await act(async () => { await emit('serial-data', 'Information'); }); // linked
      await act(async () => { fireEvent.click(screen.getByTestId('btn-battery')); });
      await act(async () => { await emit('serial-data', 'OK'); });
      await act(async () => { fireEvent.click(screen.getByTestId('btn-release')); });
      for (let i = 0; i < 6; i++) await act(async () => { await emit('serial-data', 'OK'); }); // drain the shutdown sequence

      const cmds = sentCommands(tauriCalls);
      expect(cmds).toContainEqual({ action: 'set_relay', on: false });
      expect(cmds).toContainEqual({ action: 'set_relay_ext', on: false });

      await act(async () => { await vi.advanceTimersByTimeAsync(1500); }); // let the hand-back fire
      expect(modeCalls(tauriCalls)).toContain('hydraulic');

      expect(screen.getByTestId('abs-link-state')).toHaveTextContent(/released/i);
      expect(screen.getByTestId('btn-battery')).toBeDisabled();
      expect(screen.getByTestId('btn-reconnect')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('Reconnect clears the release and resumes the ECU-mode switch', async () => {
    vi.useFakeTimers();
    try {
      const { tauriCalls } = renderWithProviders(<ElectronicsBenchDashboard isConnected />, opts);
      await act(async () => { await emit('serial-data', 'Information'); });
      await act(async () => { fireEvent.click(screen.getByTestId('btn-release')); });
      await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
      const beforeReconnect = modeCalls(tauriCalls).filter(m => m === 'electronic').length;

      await act(async () => { fireEvent.click(screen.getByTestId('btn-reconnect')); });
      await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
      expect(modeCalls(tauriCalls).filter(m => m === 'electronic').length).toBeGreaterThan(beforeReconnect);
    } finally {
      vi.useRealTimers();
    }
  });

  it('offers a Retry after the ECU-mode switch gives up, and it re-arms the loop', async () => {
    vi.useFakeTimers();
    try {
      const { tauriCalls } = renderWithProviders(<ElectronicsBenchDashboard isConnected />, opts);
      // Never link -> the 8 pokes exhaust.
      await act(async () => { await vi.advanceTimersByTimeAsync(8 * 800 + 200); });
      expect(screen.getByTestId('abs-link-state')).toHaveTextContent(/no response/i);
      const before = modeCalls(tauriCalls).filter(m => m === 'electronic').length;

      await act(async () => { fireEvent.click(screen.getByTestId('btn-retry-switch')); });
      await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
      expect(modeCalls(tauriCalls).filter(m => m === 'electronic').length).toBeGreaterThan(before);
    } finally {
      vi.useRealTimers();
    }
  });

  it('routes ECU commands to the second port and auto-detects which port the ECU board is on', async () => {
    const { tauriCalls } = renderWithProviders(<ElectronicsBenchDashboard isConnected />, opts);
    await act(async () => { await new Promise(r => setTimeout(r, 0)); }); // let get_serial_ports resolve
    const sel = screen.getByTestId('second-port-select') as HTMLSelectElement;
    expect([...sel.options].map(o => o.value)).toContain('COM8');
    await act(async () => { fireEvent.change(sel, { target: { value: 'COM8' } }); });
    await act(async () => { fireEvent.click(screen.getByTestId('btn-second-connect')); });
    expect(tauriCalls.some(c => c.cmd === 'connect_ecu_serial' && c.args.portName === 'COM8')).toBe(true);

    // The Disconnect button shows a real translation, not a raw i18n key.
    const dc = screen.getByTestId('btn-second-disconnect');
    expect(dc).toHaveTextContent(/disconnect/i);
    expect(dc.textContent).not.toMatch(/abs_bench|f2evo\./);

    // Default: ECU commands go to the second port. The board's announce
    // arriving there confirms it and the ACK goes back out on the same port.
    await act(async () => { await emit('ecu-serial-data', 'Information'); await new Promise(r => setTimeout(r, 0)); });
    const ackToSecond = tauriCalls.filter(
      c => c.cmd === 'f2evo_electronics_send'
        && (c.args.command as { action: string }).action === 'ack_electronics'
        && c.args.ecu === true,
    );
    expect(ackToSecond.length).toBeGreaterThan(0);
    expect(screen.getByTestId('abs-second-port')).toHaveTextContent(/ECU commands/i);
    expect(screen.getByTestId('abs-second-port')).not.toHaveTextContent(/primary port/i);

    // A Volt: reply arriving on the PRIMARY port instead proves the ECU board
    // is actually there — the routing flips (recovers a backwards-cabled bench
    // with no operator action).
    tauriCalls.length = 0;
    await act(async () => { await emit('serial-data', 'Volt:1024'); await new Promise(r => setTimeout(r, 0)); });
    expect(screen.getByTestId('abs-second-port')).toHaveTextContent(/primary port/i);
  });

  it('routes ECU commands to the primary port when no second port is connected', async () => {
    const { user, tauriCalls } = renderWithProviders(<ElectronicsBenchDashboard isConnected />, opts);
    await linkAndLoadModel();
    await user.click(screen.getByTestId('btn-battery')); // -> check_code
    const ecuSends = tauriCalls.filter(c => c.cmd === 'f2evo_electronics_send');
    // `ecuOnSecond` defaults to true; with no second port open every ECU
    // frame must still go out on the primary (`ecu: false`), or the backend
    // rejects it with "Serial port not connected".
    expect(ecuSends.length).toBeGreaterThan(0);
    expect(ecuSends.every(c => c.args.ecu === false)).toBe(true);
  });

  it('a bare OK from the mode port neither flips ECU routing nor drains the ECU queue', async () => {
    const { tauriCalls } = renderWithProviders(<ElectronicsBenchDashboard isConnected />, opts);
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    await act(async () => { fireEvent.change(screen.getByTestId('second-port-select'), { target: { value: 'COM8' } }); });
    await act(async () => { fireEvent.click(screen.getByTestId('btn-second-connect')); });
    // Link via the ECU (second) port — its announce lands there, so routing
    // stays on the second port and the model upload goes out there.
    await act(async () => { await emit('ecu-serial-data', 'Information'); await new Promise(r => setTimeout(r, 0)); });
    await act(async () => { fireEvent.click(screen.getByTestId('btn-model')); });
    await act(async () => { fireEvent.click(screen.getByTestId('btn-model-load')); });

    tauriCalls.length = 0;
    // Stray OK from the mode / hydraulic MCU on the PRIMARY port.
    await act(async () => { await emit('serial-data', 'OK'); });
    await act(async () => { await new Promise(r => setTimeout(r, 350)); }); // one retry tick
    // Routing unchanged (OK is not an ECU-specific reply)...
    const secondPortCard = screen.getByTestId('abs-second-port');
    expect(secondPortCard).toHaveTextContent(/ECU commands/i);
    expect(secondPortCard).toHaveTextContent(/second port/i);
    expect(secondPortCard).not.toHaveTextContent(/primary port/i);
    // ...and the upload is still being retried on the second port.
    const loadFrames = () => tauriCalls.filter(
      c => c.cmd === 'f2evo_electronics_send'
        && (c.args.command as { action: string }).action === 'load_model',
    );
    expect(loadFrames().length).toBeGreaterThan(0);
    expect(loadFrames().every(c => c.args.ecu === true)).toBe(true);

    // The real ack, on the ECU (second) port, drains it — retries stop.
    tauriCalls.length = 0;
    await act(async () => { await emit('ecu-serial-data', 'OK'); });
    await act(async () => { await new Promise(r => setTimeout(r, 400)); });
    expect(loadFrames().length).toBe(0);
  });

  it('a released bench ignores inbound board data', async () => {
    vi.useFakeTimers();
    try {
      const { tauriCalls } = renderWithProviders(<ElectronicsBenchDashboard isConnected />, opts);
      await act(async () => { await emit('serial-data', 'Information'); });
      await act(async () => { fireEvent.click(screen.getByTestId('btn-release')); });
      tauriCalls.length = 0;
      await act(async () => { await emit('serial-data', 'Volt:1024'); });
      await act(async () => { await emit('serial-data', 'Electronics'); }); // stray re-announce
      expect(sentCommands(tauriCalls)).not.toContainEqual({ action: 'ack_electronics' });
      expect(screen.getByTestId('abs-voltage')).toHaveTextContent('—');
    } finally {
      vi.useRealTimers();
    }
  });

  it('reveals brake / motor / signal controls under Advanced', async () => {
    const { user } = renderWithProviders(<ElectronicsBenchDashboard isConnected />, opts);
    expect(screen.queryByTestId('btn-brake')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /advanced/i }));
    expect(screen.getByTestId('btn-brake')).toBeInTheDocument();
    expect(screen.getByTestId('btn-motor')).toBeInTheDocument();
    expect(screen.getByTestId('btn-signal-mode')).toBeInTheDocument();
  });

  it('mounts without console errors', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderWithProviders(<ElectronicsBenchDashboard isConnected />, opts);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

// The command queue, the 1 s poll/ramp cadence and the disconnect grace
// window are the component's whole reason to exist beyond the pure reducer
// (docs/TESTING.md §"timers"). Driven here with fake timers.
describe('ElectronicsBenchDashboard — timers & lifecycle', () => {
  const acked = (line: string) => act(async () => { await emit('serial-data', line); });
  const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  const only = (calls: Array<{ cmd: string; args: Record<string, unknown> }>, action: string) =>
    calls.filter(c => c.cmd === 'f2evo_electronics_send' && (c.args.command as { action: string }).action === action).length;

  it('re-sends the front frame every ~300 ms until the board answers', async () => {
    vi.useFakeTimers();
    const { tauriCalls } = renderWithProviders(<ElectronicsBenchDashboard isConnected />, opts);
    await linkAndLoadModel(true); // linked + model loaded -> action buttons live
    tauriCalls.length = 0;
    act(() => { fireEvent.click(screen.getByTestId('btn-battery')); }); // enqueues check_code
    expect(only(tauriCalls, 'check_code')).toBe(1); // immediate first send
    await advance(320);
    expect(only(tauriCalls, 'check_code')).toBe(2);
    await advance(320);
    expect(only(tauriCalls, 'check_code')).toBe(3);
    await acked('Check ok'); // substantive reply advances the queue (no bare OK)
    await advance(1000);
    expect(only(tauriCalls, 'check_code')).toBe(3); // no more re-sends
  });

  it('drops a never-answered frame after the give-up window and stops', async () => {
    vi.useFakeTimers();
    const { tauriCalls } = renderWithProviders(<ElectronicsBenchDashboard isConnected />, opts);
    await linkAndLoadModel(true);
    tauriCalls.length = 0;
    act(() => { fireEvent.click(screen.getByTestId('btn-battery')); });
    await advance(3500); // past GIVE_UP_MS (3 s)
    const after = only(tauriCalls, 'check_code');
    await advance(3000);
    expect(only(tauriCalls, 'check_code')).toBe(after); // dropped, not still retrying
  });

  it('polls Volt/Current/Comunication once linked and the battery is engaged', async () => {
    vi.useFakeTimers();
    const { tauriCalls } = renderWithProviders(<ElectronicsBenchDashboard isConnected />, opts);
    await linkAndLoadModel(true);
    act(() => { fireEvent.click(screen.getByTestId('btn-battery')); });
    await acked('OK'); // drain check_code
    tauriCalls.length = 0;
    await advance(1100);
    for (let i = 0; i < 3; i++) await acked('OK'); // drain the poll batch
    const cmds = sentCommands(tauriCalls);
    expect(cmds).toContainEqual({ action: 'read_volt' });
    expect(cmds).toContainEqual({ action: 'read_current' });
    expect(cmds).toContainEqual({ action: 'read_comunication' });
  });

  it('ramps the wheel-speed frequency by 20 Hz per tick while Speed Test runs', async () => {
    vi.useFakeTimers();
    const { tauriCalls } = renderWithProviders(<ElectronicsBenchDashboard isConnected />, opts);
    await linkAndLoadModel(true);
    act(() => { fireEvent.click(screen.getByTestId('btn-battery')); });
    await acked('OK');
    act(() => { fireEvent.click(screen.getByTestId('btn-key')); });
    for (let i = 0; i < 4; i++) await acked('OK');
    act(() => { fireEvent.click(screen.getByTestId('btn-speed')); });
    for (let i = 0; i < 2; i++) await acked('OK');
    tauriCalls.length = 0;
    await advance(1100);
    for (let i = 0; i < 6; i++) await acked('OK'); // drain poll + ramp batch
    expect(sentCommands(tauriCalls)).toContainEqual({ action: 'frequency', hz: 20 });
  });

  it('holds bench state through a brief disconnect, then wipes it after the grace window', async () => {
    vi.useFakeTimers();
    const { rerender } = renderWithProviders(<ElectronicsBenchDashboard isConnected />, opts);
    await acked('Volt:900'); // 900 * 0.0146484375 ≈ 13.2 V, marks linked
    expect(screen.getByTestId('abs-voltage')).toHaveTextContent('13.2');

    rerender(<ElectronicsBenchDashboard isConnected={false} />);
    await advance(2000);
    expect(screen.getByTestId('abs-voltage')).toHaveTextContent('13.2'); // still inside 3 s grace
    await advance(2000);
    expect(screen.getByTestId('abs-voltage')).toHaveTextContent('—'); // wiped
  });

  it('keeps bench state for the long window while auto-reconnect is retrying', async () => {
    vi.useFakeTimers();
    const { rerender } = renderWithProviders(<ElectronicsBenchDashboard isConnected />, opts);
    await acked('Volt:900');
    rerender(<ElectronicsBenchDashboard isConnected={false} isReconnecting />);
    await advance(10_000); // well past the plain 3 s window
    expect(screen.getByTestId('abs-voltage')).toHaveTextContent('13.2');
  });

  it('stops re-sending after the component unmounts mid-retry', async () => {
    vi.useFakeTimers();
    const { unmount, tauriCalls } = renderWithProviders(<ElectronicsBenchDashboard isConnected />, opts);
    await acked('Electronics'); // retry loop now running on ack_electronics
    const before = only(tauriCalls, 'ack_electronics');
    unmount();
    await advance(3000);
    expect(only(tauriCalls, 'ack_electronics')).toBe(before);
  });

  it('releases the second COM port only when the primary link is lost past the grace window', async () => {
    vi.useFakeTimers();
    const { rerender, tauriCalls } = renderWithProviders(<ElectronicsBenchDashboard isConnected />, opts);
    await advance(0); // let get_serial_ports / is_ecu_serial_connected resolve
    await act(async () => { fireEvent.change(screen.getByTestId('second-port-select'), { target: { value: 'COM8' } }); });
    await act(async () => { fireEvent.click(screen.getByTestId('btn-second-connect')); });
    expect(screen.getByTestId('btn-second-disconnect')).toBeInTheDocument();
    tauriCalls.length = 0;

    // A blip that heals inside the 3 s grace must NOT tear the ECU port down
    // (the F2-EVO's composite USB device usually re-enumerates both ports).
    rerender(<ElectronicsBenchDashboard isConnected={false} />);
    await advance(2000);
    rerender(<ElectronicsBenchDashboard isConnected />);
    await advance(2000);
    expect(tauriCalls.some(c => c.cmd === 'disconnect_ecu_serial')).toBe(false);
    expect(screen.getByTestId('btn-second-disconnect')).toBeInTheDocument();

    // A real loss past the grace window releases it — the picker returns to
    // its connect state so it isn't left claimed with nowhere to reconnect.
    rerender(<ElectronicsBenchDashboard isConnected={false} />);
    await advance(3500);
    expect(tauriCalls.some(c => c.cmd === 'disconnect_ecu_serial')).toBe(true);
    expect(screen.getByTestId('btn-second-connect')).toBeInTheDocument();
  });
});
