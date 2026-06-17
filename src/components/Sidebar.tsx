import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HomeIcon,
  Cog6ToothIcon,
  BoltIcon,
  SignalIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  BriefcaseIcon,
  ArrowRightOnRectangleIcon,
} from '@heroicons/react/24/outline';
import {
  HomeIcon as HomeSolid,
  Cog6ToothIcon as CogSolid,
  BoltIcon as BoltSolid,
  SignalIcon as SignalSolid,
  BriefcaseIcon as BriefcaseSolid,
} from '@heroicons/react/24/solid';
import { useWebSocketContext } from '@/contexts/WebSocketContext';
import { useClientSerialConnection } from '@/hooks/useClientSerialConnection';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { useSession } from '@/contexts/SessionContext';
import type { Page } from './Navigation';

const BAUD_RATES = ['9600', '19200', '38400', '57600', '115200', '230400', '460800', '500000', '921600'];

const TABS: {
  id: Page;
  label: string;
  sub: string;
  Outline: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  Solid: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}[] = [
  { id: 'home',   label: 'Dashboard',    sub: 'Info & config',       Outline: HomeIcon,      Solid: HomeSolid     },
  { id: 'valves', label: 'Valve Testing', sub: 'Hydraulic modulator', Outline: Cog6ToothIcon, Solid: CogSolid      },
  { id: 'motors', label: 'Motor Testing', sub: 'ABS block motor',     Outline: BoltIcon,      Solid: BoltSolid     },
  { id: 'signal', label: 'Signal HIL',    sub: 'WSS simulation',      Outline: SignalIcon,    Solid: SignalSolid   },
  { id: 'jobs',   label: 'Repair Jobs',   sub: 'Job tracking',        Outline: BriefcaseIcon, Solid: BriefcaseSolid },
];

interface SidebarProps {
  currentPage: Page;
  onPageChange: (page: Page) => void;
}

export default function Sidebar({ currentPage, onPageChange }: SidebarProps) {
  const [esp32Expanded, setEsp32Expanded] = useState(false);

  const { devices, selectedDeviceId, selectDevice, isConnectedToDevice } = useWebSocketContext();
  const { legacyMode, setLegacyMode } = useAppSettings();
  const { currentUser, currentJob, isGuest, logout } = useSession();

  const {
    isConnected: serialConnected,
    connect: serialConnect,
    disconnect: serialDisconnect,
    errorMessage: serialError,
    ports,
    refreshPorts,
    selectedPort,
    setSelectedPort,
    baudRate,
    setBaudRate,
    picoDetected,
  } = useClientSerialConnection();

  // Refresh ports on mount
  useEffect(() => { refreshPorts(); }, []);

  const esp32Devices = devices.filter(d => d.device_type === 'esp32');
  const connected = isConnectedToDevice || serialConnected;

  return (
    <aside className="w-[220px] h-full flex flex-col bg-sidebar border-r border-sidebar-border shrink-0 select-none">

      {/* ── Navigation ── */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {TABS.map(({ id, label, sub, Outline, Solid }) => {
          const active = currentPage === id;
          return (
            <button
              key={id}
              onClick={() => onPageChange(id)}
              className={[
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left relative overflow-hidden',
                'transition-colors duration-150 group',
                active
                  ? 'bg-accent/10 text-accent'
                  : 'text-text-secondary hover:text-text-primary hover:bg-text-tertiary/10',
              ].join(' ')}
            >
              {active && (
                <motion.div
                  layoutId="nav-pill"
                  className="absolute left-0 w-[3px] h-5 bg-accent rounded-r-full"
                  style={{ top: '50%', y: '-50%' }}
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <span className="shrink-0">
                {active ? <Solid className="w-4 h-4" /> : <Outline className="w-4 h-4" />}
              </span>
              <span className="flex flex-col min-w-0">
                <span className="text-[13px] font-medium leading-tight truncate">{label}</span>
                <span className={[
                  'text-[10px] leading-tight truncate mt-0.5',
                  active ? 'text-accent/60' : 'text-text-tertiary',
                ].join(' ')}>
                  {sub}
                </span>
              </span>
            </button>
          );
        })}
      </nav>

      {/* ── User / Job strip ── */}
      {currentUser && (
        <div className="border-t border-sidebar-border shrink-0 px-3 py-2 space-y-1.5">
          <div className="flex items-center gap-2">
            {/* Avatar */}
            <div className="w-6 h-6 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center shrink-0">
              <span className="text-[10px] font-bold text-accent leading-none">
                {currentUser.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <span className="flex-1 text-xs font-medium text-text-primary truncate">{currentUser.name}</span>
            <button
              onClick={logout}
              title={isGuest ? 'Sign in' : 'Log out'}
              className={[
                'p-1 transition-colors shrink-0',
                isGuest ? 'text-accent hover:text-accent/70' : 'text-text-tertiary hover:text-danger',
              ].join(' ')}
            >
              <ArrowRightOnRectangleIcon className="w-3.5 h-3.5" />
            </button>
          </div>
          {currentJob && (
            <button
              onClick={() => onPageChange('jobs')}
              className="w-full flex items-center gap-2 px-2 py-1.5 bg-accent/5 border border-accent/20
                rounded-lg hover:bg-accent/10 transition-colors text-left"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-slow shrink-0" />
              <span className="text-[11px] text-accent font-medium truncate flex-1">{currentJob.jobNumber}</span>
              <span className="text-[9px] text-text-tertiary shrink-0">active</span>
            </button>
          )}
        </div>
      )}

      {/* ── Connection panel (always visible) ── */}
      <div className="border-t border-sidebar-border shrink-0 px-3 py-3 space-y-2.5">

        {/* Status badge */}
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className={[
              'w-2 h-2 rounded-full shrink-0',
              connected ? 'bg-success animate-pulse-slow' : 'bg-text-tertiary',
            ].join(' ')} />
            <span className={[
              'text-xs font-medium truncate',
              connected ? 'text-success' : 'text-text-tertiary',
            ].join(' ')}>
              {connected
                ? isConnectedToDevice
                  ? 'ESP32 Connected'
                  : `${selectedPort ?? 'Serial'} · ${baudRate}`
                : 'No connection'}
            </span>
          </div>
          {legacyMode && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-warning/15 text-warning shrink-0">
              NANO
            </span>
          )}
          {!legacyMode && picoDetected && !serialConnected && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-accent/15 text-accent shrink-0">
              PICO
            </span>
          )}
        </div>

        {/* Serial controls */}
        {!serialConnected ? (
          <>
            {/* Port + refresh */}
            <div className="flex items-center gap-1.5">
              <select
                value={selectedPort ?? ''}
                onChange={e => setSelectedPort(e.target.value || null)}
                className="flex-1 min-w-0 bg-elevated border border-border rounded-lg px-2 py-1.5
                  text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/40
                  focus:border-accent/50 transition-all"
              >
                <option value="">
                  {ports.length === 0 ? '— no ports —' : '— select port —'}
                </option>
                {ports.map(p => (
                  <option key={p.port_name} value={p.port_name}>{p.port_name}</option>
                ))}
              </select>
              <button
                onClick={refreshPorts}
                title="Refresh ports"
                className="p-1.5 bg-elevated border border-border rounded-lg text-text-tertiary
                  hover:text-text-primary transition-all shrink-0"
              >
                <ArrowPathIcon className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Baud rate */}
            <select
              value={baudRate}
              onChange={e => setBaudRate(e.target.value)}
              className="w-full bg-elevated border border-border rounded-lg px-2 py-1.5
                text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/40
                focus:border-accent/50 transition-all"
            >
              {BAUD_RATES.map(r => (
                <option key={r} value={r}>{r} baud</option>
              ))}
            </select>

            {ports.length === 0 && (
              <p className="text-[10px] text-warning px-1">Connect Pico via USB then refresh ↻</p>
            )}
            {serialError && (
              <p className="text-[10px] text-danger px-1 break-words">{serialError}</p>
            )}
          </>
        ) : (
          <div className="px-1 text-[11px] text-text-secondary">
            {selectedPort} @ {baudRate} baud
          </div>
        )}

        {/* Connect / Disconnect button */}
        <button
          onClick={() => serialConnected ? serialDisconnect() : serialConnect()}
          disabled={!serialConnected && !selectedPort}
          className={[
            'w-full py-2 text-xs font-semibold rounded-lg transition-all duration-150',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            serialConnected
              ? 'bg-danger/10 text-danger hover:bg-danger/20 border border-danger/20'
              : 'bg-accent/10 text-accent hover:bg-accent/20 border border-accent/20',
          ].join(' ')}
        >
          {serialConnected ? 'Disconnect Serial' : 'Connect Serial'}
        </button>

        {/* Legacy mode toggle */}
        <div className="flex items-center justify-between px-1 pt-1 border-t border-sidebar-border">
          <div>
            <span className="text-[11px] font-medium text-text-secondary">Legacy (Arduino Nano)</span>
            {legacyMode && (
              <p className="text-[9px] text-warning mt-0.5 leading-tight">500 000 baud · AD9833+MCP2515</p>
            )}
          </div>
          <button
            onClick={() => {
              const next = !legacyMode;
              setLegacyMode(next);
              if (next && baudRate !== '500000') setBaudRate('500000');
            }}
            title={legacyMode ? 'Disable legacy mode (Arduino Nano)' : 'Enable legacy mode (Arduino Nano)'}
            className={[
              'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200',
              legacyMode ? 'bg-warning' : 'bg-elevated border border-border',
            ].join(' ')}
          >
            <span className={[
              'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200',
              legacyMode ? 'translate-x-[18px]' : 'translate-x-0.5',
            ].join(' ')} />
          </button>
        </div>

        {/* ESP32 section — collapsible since it's less common */}
        {esp32Devices.length > 0 && (
          <div>
            <button
              onClick={() => setEsp32Expanded(v => !v)}
              className="w-full flex items-center justify-between px-1 py-1 text-[10px] font-semibold
                text-text-tertiary uppercase tracking-widest hover:text-text-secondary transition-colors"
            >
              <span>ESP32 ({esp32Devices.length})</span>
              <motion.span
                animate={{ rotate: esp32Expanded ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronDownIcon className="w-3 h-3" />
              </motion.span>
            </button>

            <AnimatePresence initial={false}>
              {esp32Expanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="mt-1.5 space-y-1">
                    {esp32Devices.map(d => {
                      const isSelected = d.id === selectedDeviceId;
                      const inUse = !!d.paired_with_client && !isSelected;
                      return (
                        <div
                          key={d.id}
                          className="flex items-center justify-between bg-elevated rounded-lg px-2.5 py-1.5 border border-border"
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className={[
                              'w-1.5 h-1.5 rounded-full shrink-0',
                              isSelected ? 'bg-success' : inUse ? 'bg-warning' : 'bg-text-tertiary',
                            ].join(' ')} />
                            <span className="text-xs text-text-primary truncate">{d.id}</span>
                          </div>
                          <button
                            onClick={() => selectDevice(isSelected ? null : d.id)}
                            disabled={inUse}
                            className={[
                              'text-[11px] font-medium px-2 py-0.5 rounded-md shrink-0 ml-1',
                              'transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
                              isSelected ? 'text-danger hover:bg-danger/10' : 'text-accent hover:bg-accent/10',
                            ].join(' ')}
                          >
                            {isSelected ? 'Drop' : inUse ? 'Busy' : 'Use'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </aside>
  );
}
