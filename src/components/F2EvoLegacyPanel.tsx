import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { WrenchScrewdriverIcon, SignalIcon } from '@heroicons/react/24/outline';
import { useTranslation } from 'react-i18next';
import { useStickyLog } from '@/hooks/useStickyLog';

// ---- Types mirroring the serde-tagged enums in src-tauri/src/f2evo.rs ----
// Keep these in lockstep with the Rust side — a mismatched `action` string
// or missing field just gets silently ignored by serde on the Rust side.

type ElectronicsCmd =
  | { action: 'set_relay'; on: boolean }
  | { action: 'set_relay_ext'; on: boolean }
  | { action: 'frequency'; hz: number }
  | { action: 'select_out'; channel: number }
  | { action: 'active' }
  | { action: 'passive' }
  | { action: 'start_test' }
  | { action: 'stop_test' }
  | { action: 'check_code' }
  | { action: 'read_volt' }
  | { action: 'read_current' }
  | { action: 'read_comunication' }
  | { action: 'wheel_stop'; wheel: number }
  | { action: 'wheel_go'; wheel: number }
  | { action: 'push' }
  | { action: 'release' }
  | { action: 'turn_off_motor' }
  | { action: 'ack_electronics' };

type GearboxCmd =
  | { action: 'set_relay'; on: boolean }
  | { action: 'frequency'; hz: number }
  | { action: 'select_out'; channel: number }
  | { action: 'enable_speed' }
  | { action: 'disable_speed' }
  | { action: 'start_test' }
  | { action: 'stop_test' }
  | { action: 'set_gearbox' }
  | { action: 'set_clutch' }
  | { action: 'set_position_change' }
  | { action: 'set_parking' }
  | { action: 'set_down' }
  | { action: 'set_up' }
  | { action: 'set_position_r' }
  | { action: 'set_position_n' }
  | { action: 'set_position_d' }
  | { action: 'set_position_s' }
  | { action: 'set_position_stop' };

type SensorCmd =
  | { action: 'enable_status' }
  | { action: 'disable_status' }
  | { action: 'enable_sensor_test' }
  | { action: 'disable_sensor_test' }
  | { action: 'pump'; on: boolean }
  | { action: 'empty_channel' };

type WashingCmd =
  | { action: 'get_model' }
  | { action: 'ack_washing' }
  | { action: 'run_cycle' }
  | { action: 'raw_json_payload'; json: string };

type F2EvoEvent = { kind: string; [key: string]: unknown };

// Hydraulic Bench is deliberately excluded here — it has its own dedicated
// gauge dashboard (HydraulicBenchDashboard.tsx) with real telemetry, not
// just raw command buttons. Having it in both places was confusing (two
// different UIs for the same board, with different button sets).
export type BoardId = 'electronics' | 'gearbox' | 'sensor' | 'washing';

// ---- Generic, data-driven control specs — avoids ~50 near-identical JSX blocks ----

type Control<Cmd> =
  | { type: 'button'; label: string; cmd: Cmd }
  | { type: 'toggle'; label: string; onCmd: Cmd; offCmd: Cmd }
  | { type: 'number'; label: string; placeholder: string; build: (n: number) => Cmd }
  | { type: 'text'; label: string; placeholder: string; build: (s: string) => Cmd };

const ELECTRONICS_CONTROLS: Control<ElectronicsCmd>[] = [
  { type: 'toggle', label: 'Relay', onCmd: { action: 'set_relay', on: true }, offCmd: { action: 'set_relay', on: false } },
  { type: 'toggle', label: 'Relay Ext', onCmd: { action: 'set_relay_ext', on: true }, offCmd: { action: 'set_relay_ext', on: false } },
  { type: 'number', label: 'Frequency (Hz)', placeholder: '50', build: hz => ({ action: 'frequency', hz }) },
  { type: 'number', label: 'Select Out', placeholder: 'channel', build: channel => ({ action: 'select_out', channel }) },
  { type: 'button', label: 'Active', cmd: { action: 'active' } },
  { type: 'button', label: 'Passive', cmd: { action: 'passive' } },
  { type: 'button', label: 'Start Test', cmd: { action: 'start_test' } },
  { type: 'button', label: 'Stop Test', cmd: { action: 'stop_test' } },
  { type: 'button', label: 'Check Code', cmd: { action: 'check_code' } },
  { type: 'button', label: 'Read Volt', cmd: { action: 'read_volt' } },
  { type: 'button', label: 'Read Current', cmd: { action: 'read_current' } },
  { type: 'button', label: 'Read Comunication', cmd: { action: 'read_comunication' } },
  { type: 'number', label: 'Wheel Stop', placeholder: 'wheel #', build: wheel => ({ action: 'wheel_stop', wheel }) },
  { type: 'number', label: 'Wheel Go', placeholder: 'wheel #', build: wheel => ({ action: 'wheel_go', wheel }) },
  { type: 'button', label: 'Push', cmd: { action: 'push' } },
  { type: 'button', label: 'Release', cmd: { action: 'release' } },
  { type: 'button', label: 'Turn Off Motor', cmd: { action: 'turn_off_motor' } },
  { type: 'button', label: 'Ack Electronics', cmd: { action: 'ack_electronics' } },
];

const GEARBOX_CONTROLS: Control<GearboxCmd>[] = [
  { type: 'toggle', label: 'Relay', onCmd: { action: 'set_relay', on: true }, offCmd: { action: 'set_relay', on: false } },
  { type: 'number', label: 'Frequency (Hz)', placeholder: '50', build: hz => ({ action: 'frequency', hz }) },
  { type: 'number', label: 'Select Out', placeholder: 'channel', build: channel => ({ action: 'select_out', channel }) },
  { type: 'button', label: 'Enable Speed', cmd: { action: 'enable_speed' } },
  { type: 'button', label: 'Disable Speed', cmd: { action: 'disable_speed' } },
  { type: 'button', label: 'Start Test', cmd: { action: 'start_test' } },
  { type: 'button', label: 'Stop Test', cmd: { action: 'stop_test' } },
  { type: 'button', label: 'Set Gearbox', cmd: { action: 'set_gearbox' } },
  { type: 'button', label: 'Set Clutch', cmd: { action: 'set_clutch' } },
  { type: 'button', label: 'Position Change', cmd: { action: 'set_position_change' } },
  { type: 'button', label: 'Parking', cmd: { action: 'set_parking' } },
  { type: 'button', label: 'Down', cmd: { action: 'set_down' } },
  { type: 'button', label: 'Up', cmd: { action: 'set_up' } },
  { type: 'button', label: 'Position R', cmd: { action: 'set_position_r' } },
  { type: 'button', label: 'Position N', cmd: { action: 'set_position_n' } },
  { type: 'button', label: 'Position D', cmd: { action: 'set_position_d' } },
  { type: 'button', label: 'Position S', cmd: { action: 'set_position_s' } },
  { type: 'button', label: 'Position Stop', cmd: { action: 'set_position_stop' } },
];

const SENSOR_CONTROLS: Control<SensorCmd>[] = [
  { type: 'button', label: 'Enable Status', cmd: { action: 'enable_status' } },
  { type: 'button', label: 'Disable Status', cmd: { action: 'disable_status' } },
  { type: 'button', label: 'Enable Sensor Test', cmd: { action: 'enable_sensor_test' } },
  { type: 'button', label: 'Disable Sensor Test', cmd: { action: 'disable_sensor_test' } },
  { type: 'toggle', label: 'Pump', onCmd: { action: 'pump', on: true }, offCmd: { action: 'pump', on: false } },
  { type: 'button', label: 'Empty Channel', cmd: { action: 'empty_channel' } },
];

const WASHING_CONTROLS: Control<WashingCmd>[] = [
  { type: 'button', label: 'Get Model', cmd: { action: 'get_model' } },
  { type: 'button', label: 'Ack Washing', cmd: { action: 'ack_washing' } },
  { type: 'button', label: 'Run Cycle', cmd: { action: 'run_cycle' } },
  { type: 'text', label: 'Raw JSON Payload', placeholder: '{"...": "..."}', build: json => ({ action: 'raw_json_payload', json }) },
];

const BOARDS: { id: BoardId; label: string; sendCommand: string; probeKeyword: string | null }[] = [
  { id: 'electronics', label: 'Electronics / ABS', sendCommand: 'f2evo_electronics_send', probeKeyword: 'electronics' },
  { id: 'gearbox',     label: 'Gearbox',           sendCommand: 'f2evo_gearbox_send',     probeKeyword: null },
  { id: 'sensor',      label: 'Sensor',            sendCommand: 'f2evo_sensor_send',      probeKeyword: null },
  { id: 'washing',     label: 'Washing',           sendCommand: 'f2evo_washing_send',     probeKeyword: 'washing' },
];

interface F2EvoLegacyPanelProps {
  isConnected: boolean;
  board: BoardId;
}

// Boards that announce themselves with a bare keyword and expect an
// immediate ACK to complete the handshake (MainMenuForm.Handle_DataReceived
// in the original app does this automatically, not on user action — until
// it happens the board just keeps re-announcing and ignores everything
// else). Hydraulics is deliberately absent: HydraulicBenchDashboard owns
// that ack since it owns the Hydraulic Bench UI.
const AUTO_ACK: Record<string, { invokeName: string; cmd: unknown }> = {
  Electronics: { invokeName: 'f2evo_electronics_send', cmd: { action: 'ack_electronics' } },
  WASHING: { invokeName: 'f2evo_washing_send', cmd: { action: 'ack_washing' } },
};

export default function F2EvoLegacyPanel({ isConnected, board }: F2EvoLegacyPanelProps) {
  const { t } = useTranslation();
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const {
    lines: log, add: addLog, clear: clearLog, containerRef, endRef: logEndRef, handleScroll,
    visible: logVisible, toggleVisible: toggleLogVisible,
  } = useStickyLog();

  const sendCmd = async (invokeName: string, cmd: unknown) => {
    try {
      // Key must be "command", not "cmd" — Tauri's own invoke() envelope
      // uses a top-level "cmd" field to route to the right Rust function;
      // an arg also named "cmd" silently overwrites it, and the call just
      // hangs forever instead of erroring.
      const frame = await invoke<string>(invokeName, { command: cmd });
      addLog(`TX: ${JSON.stringify(frame)}`);
    } catch (e) {
      addLog(`ERR: ${String(e)}`);
    }
  };

  useEffect(() => {
    const unsub = listen<string>('serial-data', async e => {
      const line = e.payload;
      try {
        const parsed = await invoke<F2EvoEvent>('f2evo_parse_line', { line });
        addLog(`RX: ${line}  →  ${JSON.stringify(parsed)}`);
        if (parsed.kind === 'discovery_broadcast' && typeof parsed.board === 'string') {
          const ack = AUTO_ACK[parsed.board];
          if (ack) {
            addLog(`AUTO-ACK: sending ack for ${parsed.board}…`);
            sendCmd(ack.invokeName, ack.cmd);
          }
        }
      } catch {
        addLog(`RX: ${line}`);
      }
    });
    return () => { unsub.then(u => u()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const probe = async (keyword: string) => {
    try {
      const frame = await invoke<string>('f2evo_probe', { board: keyword });
      addLog(`TX (probe): ${frame}`);
    } catch (e) {
      addLog(`ERR: ${String(e)}`);
    }
  };

  const currentBoard = BOARDS.find(b => b.id === board)!;

  // Auto-probe whenever a probeable board's tab is active and we're
  // connected — same reasoning as HydraulicBenchDashboard: the board
  // typically announces itself unprompted anyway, but this gets a faster
  // response and removes a redundant manual click.
  useEffect(() => {
    if (isConnected && currentBoard.probeKeyword) probe(currentBoard.probeKeyword);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, board]);

  const controls: Control<unknown>[] =
    board === 'electronics' ? (ELECTRONICS_CONTROLS as Control<unknown>[]) :
    board === 'gearbox'     ? (GEARBOX_CONTROLS as Control<unknown>[]) :
    board === 'sensor'      ? (SENSOR_CONTROLS as Control<unknown>[]) :
                               (WASHING_CONTROLS as Control<unknown>[]);

  return (
    <div className="card w-full">
      <h2 className="card-header flex items-center justify-between">
        <span className="flex items-center gap-2">
          <WrenchScrewdriverIcon className="h-4 w-4 text-warning" />
          {t('f2evo.title')}
        </span>
        <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-warning/15 text-warning border border-warning/20">
          RAW COMMANDS
        </span>
      </h2>
      <p className="text-xs text-text-tertiary -mt-2 mb-3">{t('f2evo.subtitle')}</p>

      {currentBoard.probeKeyword && (
        <button
          disabled={!isConnected}
          onClick={() => probe(currentBoard.probeKeyword!)}
          className="mb-3 flex items-center gap-1.5 text-xs btn-secondary px-2.5 py-1.5 disabled:opacity-40"
        >
          <SignalIcon className="w-3.5 h-3.5" />
          {t('f2evo.probe')} "{currentBoard.probeKeyword}"
        </button>
      )}

      {/* Controls */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
        {controls.map((ctrl, i) => {
          const key = `${board}-${i}`;
          if (ctrl.type === 'button') {
            return (
              <button
                key={key}
                disabled={!isConnected}
                onClick={() => sendCmd(currentBoard.sendCommand, ctrl.cmd)}
                className="px-2.5 py-2 rounded-lg text-xs font-medium bg-elevated text-text-secondary border border-border hover:text-text-primary transition-colors disabled:opacity-40 text-left"
              >
                {ctrl.label}
              </button>
            );
          }
          if (ctrl.type === 'toggle') {
            return (
              <div key={key} className="flex items-center gap-1 col-span-1">
                <span className="text-[11px] text-text-tertiary flex-1 truncate">{ctrl.label}</span>
                <button
                  disabled={!isConnected}
                  onClick={() => sendCmd(currentBoard.sendCommand, ctrl.onCmd)}
                  className="px-2 py-1 rounded-md text-[10px] font-semibold bg-success/15 text-success border border-success/20 disabled:opacity-40"
                >ON</button>
                <button
                  disabled={!isConnected}
                  onClick={() => sendCmd(currentBoard.sendCommand, ctrl.offCmd)}
                  className="px-2 py-1 rounded-md text-[10px] font-semibold bg-danger/15 text-danger border border-danger/20 disabled:opacity-40"
                >OFF</button>
              </div>
            );
          }
          if (ctrl.type === 'number') {
            return (
              <div key={key} className="flex items-center gap-1 col-span-1">
                <input
                  type="number"
                  placeholder={ctrl.placeholder}
                  value={inputs[key] ?? ''}
                  onChange={e => setInputs(prev => ({ ...prev, [key]: e.target.value }))}
                  className="input-field text-[11px] py-1 w-16"
                />
                <button
                  disabled={!isConnected}
                  onClick={() => sendCmd(currentBoard.sendCommand, ctrl.build(parseInt(inputs[key] ?? '0', 10) || 0))}
                  className="flex-1 px-2 py-1.5 rounded-md text-[10px] font-medium bg-elevated text-text-secondary border border-border hover:text-text-primary disabled:opacity-40 truncate"
                  title={ctrl.label}
                >
                  {ctrl.label}
                </button>
              </div>
            );
          }
          // text
          return (
            <div key={key} className="flex items-center gap-1 col-span-2 sm:col-span-3">
              <input
                type="text"
                placeholder={ctrl.placeholder}
                value={inputs[key] ?? ''}
                onChange={e => setInputs(prev => ({ ...prev, [key]: e.target.value }))}
                className="input-field text-[11px] py-1 flex-1"
              />
              <button
                disabled={!isConnected}
                onClick={() => sendCmd(currentBoard.sendCommand, ctrl.build(inputs[key] ?? ''))}
                className="px-2.5 py-1.5 rounded-md text-[10px] font-medium bg-elevated text-text-secondary border border-border hover:text-text-primary disabled:opacity-40 shrink-0"
              >
                {ctrl.label}
              </button>
            </div>
          );
        })}
      </div>

      {/* Log */}
      <div className="pt-3 border-t border-border">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-text-primary">
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
            className="bg-elevated border border-border rounded-xl p-3 font-mono text-[11px] overflow-y-auto overscroll-y-contain h-48 space-y-0.5"
          >
            {log.length === 0
              ? <span className="text-text-tertiary">{t('f2evo.no_messages')}</span>
              : log.map((line, i) => (
                <div key={i} className={
                  line.startsWith('TX') ? 'text-accent' :
                  line.startsWith('ERR:') ? 'text-danger' : 'text-success'
                }>{line}</div>
              ))
            }
            <div ref={logEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}
