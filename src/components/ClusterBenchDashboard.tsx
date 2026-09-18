import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PlayIcon, StopIcon, ExclamationTriangleIcon, AdjustmentsHorizontalIcon,
  HandRaisedIcon, UserIcon, BeakerIcon, CpuChipIcon, Battery50Icon,
  ArrowPathIcon, ArrowRightOnRectangleIcon, ShieldExclamationIcon,
  WrenchScrewdriverIcon, KeyIcon, TruckIcon, ArrowLongLeftIcon, ArrowLongRightIcon,
  LightBulbIcon, FireIcon, LockClosedIcon, Cog6ToothIcon, SunIcon,
} from '@heroicons/react/24/outline';
import { useClientSerialConnection } from '@/hooks/useClientSerialConnection';
import { useStickyLog } from '@/hooks/useStickyLog';
import { buildFrame } from '@/lib/isotp';
import {
  clusterBenchReduce,
  initialClusterBenchState,
  type ClusterBenchMsg,
  type ClusterBenchState,
} from '@/lib/clusterBench';
import { DEMO_CLUSTER_PROFILE } from '@/lib/builtinClusterCanProfiles';
import type { ClusterCanFrame } from '@/lib/clusterCan';
import { fetchClusterBenchCatalog, indexCatalogByName, type ClusterBenchSignalMeta } from '@/lib/clusterBenchCatalog';
import ClusterGauge from '@/components/ClusterGauge';
import ClusterTelltale from '@/components/ClusterTelltale';

// icon_key (from the Postgres catalog, src-tauri/src/cluster_bench.rs's
// SEED_SIGNALS) -> the actual icon component. Postgres holds a string key,
// never a component reference.
const ICON_REGISTRY: Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  'hand-raised': HandRaisedIcon,
  user: UserIcon,
  beaker: BeakerIcon,
  'cpu-chip': CpuChipIcon,
  battery: Battery50Icon,
  'arrow-path': ArrowPathIcon,
  'arrow-right-on-rectangle': ArrowRightOnRectangleIcon,
  'shield-exclamation': ShieldExclamationIcon,
  cog: Cog6ToothIcon,
  'light-bulb': LightBulbIcon,
  fire: FireIcon,
  'lock-closed': LockClosedIcon,
  key: KeyIcon,
  wrench: WrenchScrewdriverIcon,
  truck: TruckIcon,
  'arrow-long-left': ArrowLongLeftIcon,
  'arrow-long-right': ArrowLongRightIcon,
  sun: SunIcon,
  'exclamation-triangle': ExclamationTriangleIcon,
};

// Icon per demo-profile telltale signal name — purely cosmetic, and specific
// to `DEMO_CLUSTER_PROFILE`'s own signal names. A real vehicle profile will
// need its own mapping once profiles are editable (see docs/DASHBOARD-BENCH.md
// §8); anything not listed here just falls back to a generic warning icon.
const TELLTALE_ICONS: Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  handbrake: HandRaisedIcon,
  seatbelt: UserIcon,
  seatbelt_passenger: UserIcon,
  oil_pressure: BeakerIcon,
  check_engine: CpuChipIcon,
  battery: Battery50Icon,
  abs_fault: ArrowPathIcon,
  door_open: ArrowRightOnRectangleIcon,
  door_fl: ArrowRightOnRectangleIcon,
  door_fr: ArrowRightOnRectangleIcon,
  door_rl: ArrowRightOnRectangleIcon,
  door_rr: ArrowRightOnRectangleIcon,
  bonnet_open: LockClosedIcon,
  boot_open: LockClosedIcon,
  fuel_low: ExclamationTriangleIcon,
  airbag: ShieldExclamationIcon,
  esp_fault: Cog6ToothIcon,
  esp_off: Cog6ToothIcon,
  steering_fault: Cog6ToothIcon,
  brake_system: ExclamationTriangleIcon,
  epb_fault: HandRaisedIcon,
  tpms: ExclamationTriangleIcon,
  washer_fluid_low: BeakerIcon,
  coolant_level_low: BeakerIcon,
  bulb_failure: LightBulbIcon,
  dpf: FireIcon,
  glow_plug: FireIcon,
  adblue_low: BeakerIcon,
  immobilizer: KeyIcon,
  service_due: WrenchScrewdriverIcon,
  cruise_active: ArrowPathIcon,
  trailer_connected: TruckIcon,
  high_beam: LightBulbIcon,
  low_beam: LightBulbIcon,
  front_fog: SunIcon,
  rear_fog: SunIcon,
  position_lights: LightBulbIcon,
  hazard: ExclamationTriangleIcon,
  turn_left: ArrowLongLeftIcon,
  turn_right: ArrowLongRightIcon,
};

// Display unit per demo-profile gauge signal — same caveat as above, purely
// cosmetic and specific to the demo names.
const SIGNAL_UNITS: Record<string, string> = {
  fuel_pct: '%',
  coolant_temp_c: '°C',
  rpm: 'rpm',
  speed_kmh: 'km/h',
  oil_temp_c: '°C',
  battery_voltage: 'V',
  boost_pressure_bar: 'bar',
  oil_pressure_bar: 'bar',
};

/** A signal's human name, via `cluster_bench.signals.<name>` (both locales),
 *  falling back to a humanized version of the raw wire name for anything
 *  not yet translated — same `t(key, { defaultValue })` pattern Sidebar.tsx
 *  uses for its own nav labels. Real clusters don't have a lamp captioned
 *  `door_open`, so this — not the raw `ClusterCanSignal.name` — is what
 *  `ClusterGauge`/`ClusterTelltale` actually render. */
function signalLabel(t: (key: string, opts?: Record<string, unknown>) => string, name: string): string {
  const humanized = name.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
  return t(`cluster_bench.signals.${name}`, { defaultValue: humanized });
}

// Phase 0 of the planned dashboard/instrument-cluster bench
// (docs/DASHBOARD-BENCH.md): the "virtual BSI" CAN transmitter. Needs no new
// hardware — it rides the same board/Kvaser CAN transport every other CAN
// tool in the app already uses (`useClientSerialConnection`). Digipot/
// discrete-I/O channels wait on the real board (see the doc's Phase 1/2).
// Profile is fixed to the built-in demo for now — no profile picker/editor
// yet (that's the doc's "open decision" on profile storage).
//
// Page chrome (container/title/subtitle/entrance animation) lives in
// pages/ClusterBench.tsx, same split every sibling bench page uses
// (F2EvoHydraulic.tsx owns that for HydraulicBenchDashboard) — this
// component starts bare, like HydraulicBenchDashboard/ElectronicsBenchDashboard.

const TICK_MS = 50;

interface ClusterBenchDashboardProps {
  /** Overrides the main-transport connection state / send function — same
   *  override pattern `PowerIndicators` uses, so tests don't need to drive
   *  the real `clientSerial` singleton through a full connect flow. */
  isConnected?: boolean;
  sendMessage?: (line: string) => Promise<boolean>;
}

export default function ClusterBenchDashboard({
  isConnected: isConnectedProp,
  sendMessage,
}: ClusterBenchDashboardProps = {}) {
  const { t } = useTranslation();
  const { isConnected: hookConnected, sendCommand } = useClientSerialConnection();
  const isConnected = isConnectedProp ?? hookConnected;
  const send = sendMessage ?? sendCommand;
  const {
    lines: log, add: addLog, clear: clearLog, containerRef, endRef: logEndRef, handleScroll,
    visible: logVisible, toggleVisible: toggleLogVisible,
  } = useStickyLog();

  const [state, setState] = useState<ClusterBenchState>(() =>
    clusterBenchReduce(initialClusterBenchState(), { action: 'load_profile', profile: DEMO_CLUSTER_PROFILE }).state,
  );
  const stateRef = useRef(state);
  stateRef.current = state;

  // Which signals are hidden from the main view for this test session — not
  // every vehicle has every lamp/sensor the demo catalog covers, and a real
  // dash a tech is actually testing shouldn't be buried among 40+ controls
  // it doesn't have. UI-only, session-scoped: doesn't affect what gets
  // transmitted (a hidden signal still packs at its current/default value —
  // see `packFrameBytes`), only what's shown/toggleable.
  const [hiddenSignals, setHiddenSignals] = useState<Set<string>>(new Set());
  const toggleHidden = useCallback((name: string) => {
    setHiddenSignals(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }, []);

  // Postgres-backed catalog (icon/unit/category per signal name) — merged
  // over the hardcoded fallback maps below in FrameCard, so this dashboard
  // still works fully if the DB is unreachable or hasn't answered yet.
  const [catalog, setCatalog] = useState<Map<string, ClusterBenchSignalMeta>>(new Map());
  useEffect(() => {
    let cancelled = false;
    fetchClusterBenchCatalog()
      .then(rows => { if (!cancelled) setCatalog(indexCatalogByName(rows)); })
      .catch(() => { /* DB unreachable — the hardcoded fallback maps carry this session */ });
    return () => { cancelled = true; };
  }, []);

  const dispatch = useCallback((msg: ClusterBenchMsg) => {
    const step = clusterBenchReduce(stateRef.current, msg);
    stateRef.current = step.state;
    setState(step.state);
    for (const frame of step.frames) {
      const line = buildFrame(frame.id, frame.bytes);
      send(line);
      addLog(`TX ${line.trim()}`);
    }
  }, [send, addLog]);

  useEffect(() => {
    if (!state.running) return;
    const id = setInterval(() => dispatch({ action: 'tick', nowMs: Date.now() }), TICK_MS);
    return () => clearInterval(id);
  }, [state.running, dispatch]);

  // A transport that drops out from under a running bench shouldn't leave it
  // believing it's still armed (the next `start` would otherwise skip
  // re-clearing cycle timers it never actually got to use).
  useEffect(() => {
    if (!isConnected && state.running) dispatch({ action: 'stop' });
  }, [isConnected, state.running, dispatch]);

  const profile = state.profile;

  return (
    <div className="space-y-4">
      {!isConnected && (
        <div className="alert alert-warning flex items-center gap-2" role="alert" data-testid="cluster-bench-offline">
          <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
          <span>{t('cluster_bench.offline', { defaultValue: 'Connect the CAN transport (board or Kvaser) to arm the bench.' })}</span>
        </div>
      )}

      <div className="flex items-center justify-end">
        <button
          type="button"
          data-testid="cluster-bench-toggle"
          disabled={!isConnected || !profile}
          onClick={() => dispatch({ action: state.running ? 'stop' : 'start' })}
          className={[
            'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold border transition-colors',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            state.running
              ? 'bg-danger/15 text-danger border-danger/25 hover:bg-danger/25'
              : 'bg-success/15 text-success border-success/25 hover:bg-success/25',
          ].join(' ')}
        >
          {state.running ? <StopIcon className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />}
          {state.running ? t('cluster_bench.stop', { defaultValue: 'Stop' }) : t('cluster_bench.start', { defaultValue: 'Start' })}
        </button>
      </div>

      {profile && (
        <div className="space-y-3">
          {profile.frames.map(frame => (
            <FrameCard
              key={frame.id}
              frame={frame}
              values={state.values}
              disabled={!isConnected}
              onChange={(name, value) => dispatch({ action: 'set_value', name, value })}
              onSendNow={() => dispatch({ action: 'send_frame', id: frame.id })}
              hiddenSignals={hiddenSignals}
              onToggleHidden={toggleHidden}
              catalog={catalog}
            />
          ))}
        </div>
      )}

      {/* Log — same widget/keys as HydraulicBenchDashboard's own. */}
      <div className="pt-3 mt-4 border-t border-border">
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
            className="bg-elevated border border-border rounded-xl p-3 font-mono text-[11px] overflow-y-auto overscroll-y-contain h-40 space-y-0.5"
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

function FrameCard({
  frame, values, disabled, onChange, onSendNow, hiddenSignals, onToggleHidden, catalog,
}: {
  frame: ClusterCanFrame;
  values: Record<string, number>;
  disabled: boolean;
  onChange: (name: string, value: number) => void;
  onSendNow: () => void;
  hiddenSignals: Set<string>;
  onToggleHidden: (name: string) => void;
  catalog: Map<string, ClusterBenchSignalMeta>;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const visibleSignals = frame.signals.filter(s => !hiddenSignals.has(s.name));

  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-text-secondary">
          ID 0x{frame.id.toString(16).toUpperCase()} ·{' '}
          {frame.cycleMs > 0
            ? `${frame.cycleMs} ms`
            : t('cluster_bench.on_demand', { defaultValue: 'on demand' })}
        </span>
        <div className="flex items-center gap-3">
          {frame.cycleMs === 0 && (
            <button
              type="button"
              disabled={disabled}
              onClick={onSendNow}
              className="text-[11px] font-semibold text-accent hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t('cluster_bench.send_now', { defaultValue: 'Send now' })}
            </button>
          )}
          <button
            type="button"
            onClick={() => setEditing(v => !v)}
            className="flex items-center gap-1 text-[11px] font-semibold text-text-secondary hover:text-text-primary"
          >
            <AdjustmentsHorizontalIcon className="w-3.5 h-3.5" />
            {editing
              ? t('cluster_bench.done', { defaultValue: 'Done' })
              : t('cluster_bench.customize', { defaultValue: 'Customize' })}
          </button>
        </div>
      </div>

      {editing ? (
        // Per-vehicle/per-test signal picker — not every dashboard has every
        // lamp/sensor this catalog covers.
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
          {frame.signals.map(signal => (
            <label key={signal.name} className="flex items-center gap-2 text-xs text-text-secondary">
              <input
                type="checkbox"
                className="accent-accent"
                checked={!hiddenSignals.has(signal.name)}
                onChange={() => onToggleHidden(signal.name)}
              />
              {signalLabel(t, signal.name)}
            </label>
          ))}
        </div>
      ) : visibleSignals.length === 0 ? (
        <p className="text-xs text-text-tertiary italic">
          {t('cluster_bench.none_enabled', { defaultValue: 'Nothing enabled for this test — tap Customize to pick signals.' })}
        </p>
      ) : (
        // Column count = this frame's own *visible* signal count, not a
        // fixed breakpoint number: a `grid-cols-6` row with 4 items in it
        // leaves 2 empty trailing columns (items left-biased, not spread
        // out), and `justify-center` on a flex row just clumps fixed-width
        // items into a tight group with big empty margins instead of
        // filling the card. Sizing columns to the exact visible count makes
        // every column equal width and the row always fill edge-to-edge
        // with even gaps, regardless of how many signals are shown.
        <div
          className="grid gap-4 justify-items-center"
          style={{ gridTemplateColumns: `repeat(${visibleSignals.length}, minmax(0, 1fr))` }}
        >
          {visibleSignals.map(signal => {
            const value = values[signal.name] ?? signal.offset;
            const label = signalLabel(t, signal.name);
            const meta = catalog.get(signal.name);
            if (signal.lengthBits === 1) {
              const Icon = (meta?.iconKey && ICON_REGISTRY[meta.iconKey])
                || TELLTALE_ICONS[signal.name]
                || ExclamationTriangleIcon;
              return (
                <ClusterTelltale
                  key={signal.name}
                  label={label}
                  icon={Icon}
                  active={value !== 0}
                  disabled={disabled}
                  onToggle={() => onChange(signal.name, value !== 0 ? 0 : 1)}
                />
              );
            }
            const max = signal.offset + signal.scale * ((1 << signal.lengthBits) - 1);
            return (
              <ClusterGauge
                key={signal.name}
                label={label}
                unit={meta?.unit ?? SIGNAL_UNITS[signal.name] ?? ''}
                value={value}
                min={signal.offset}
                max={max}
                step={signal.scale || 1}
                disabled={disabled}
                onChange={v => onChange(signal.name, v)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
