import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { motion } from 'framer-motion';
import {
  HomeIcon,
  Cog6ToothIcon,
  BoltIcon,
  SignalIcon,
  ArrowPathIcon,
  BriefcaseIcon,
  ClipboardDocumentListIcon,
  ArrowRightOnRectangleIcon,
  BeakerIcon,
  CpuChipIcon,
  CogIcon,
  EyeIcon,
  SparklesIcon,
  QrCodeIcon,
} from '@heroicons/react/24/outline';
import {
  HomeIcon as HomeSolid,
  Cog6ToothIcon as CogSolid,
  BoltIcon as BoltSolid,
  SignalIcon as SignalSolid,
  BriefcaseIcon as BriefcaseSolid,
  ClipboardDocumentListIcon as ClipboardSolid,
  BeakerIcon as BeakerSolid,
  CpuChipIcon as CpuChipSolid,
  CogIcon as CogSolidAlt,
  EyeIcon as EyeSolid,
  SparklesIcon as SparklesSolid,
} from '@heroicons/react/24/solid';
import { useClientSerialConnection } from '@/hooks/useClientSerialConnection';
import { useSignalBoard } from '@/hooks/useSignalBoard';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { useSession } from '@/contexts/SessionContext';
import { useScanRouter } from '@/hooks/useScanRouter';
import NotificationBell from './NotificationBell';
import QrScannerPanel from './QrScannerPanel';
import type { Page } from '@/lib/pages';

const BAUD_RATES = ['9600', '19200', '38400', '57600', '115200', '230400', '460800', '500000', '921600'];

// CAN bus bitrates the Kvaser interface supports here. 500 k is the ISO 15765-4
// / OBD-II default; 250 k covers the odd Renault/Nissan diagnostic bus.
const CAN_BITRATES = [
  { value: '250000', label: '250 kbit/s' },
  { value: '500000', label: '500 kbit/s' },
  { value: '1000000', label: '1 Mbit/s' },
];

const TAB_DEFS: {
  id: Page;
  labelKey: string;
  subKey: string;
  defaultLabel: string;
  defaultSub: string;
  Outline: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  Solid: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}[] = [
  { id: 'home',   labelKey: 'nav.dashboard', subKey: 'nav.dashboard_sub', defaultLabel: 'Dashboard', defaultSub: 'Overview & settings', Outline: HomeIcon,      Solid: HomeSolid      },
  { id: 'valves', labelKey: 'nav.valves',    subKey: 'nav.valves_sub',    defaultLabel: 'Valves', defaultSub: 'Hydraulic modulator', Outline: Cog6ToothIcon, Solid: CogSolid       },
  { id: 'motors', labelKey: 'nav.motors',    subKey: 'nav.motors_sub',    defaultLabel: 'Motors', defaultSub: 'ABS block motor', Outline: BoltIcon,      Solid: BoltSolid      },
  { id: 'signal', labelKey: 'nav.signal',    subKey: 'nav.signal_sub',    defaultLabel: 'Signal HIL', defaultSub: 'WSS simulation', Outline: SignalIcon,    Solid: SignalSolid    },
  { id: 'jobs',   labelKey: 'nav.jobs',      subKey: 'nav.jobs_sub',      defaultLabel: 'Jobs', defaultSub: 'Active work orders', Outline: BriefcaseIcon, Solid: BriefcaseSolid },
  { id: 'reman',  labelKey: 'nav.reman',     subKey: 'nav.reman_sub',     defaultLabel: 'Reman Data', defaultSub: 'Analytics & records', Outline: ClipboardDocumentListIcon, Solid: ClipboardSolid },
  { id: 'f2evo_hydraulic', labelKey: 'nav.f2evo_hydraulic', subKey: 'nav.f2evo_hydraulic_sub', defaultLabel: 'F2-EVO Hydraulic', defaultSub: 'Hydraulic bench control', Outline: BeakerIcon, Solid: BeakerSolid },
  { id: 'f2evo_electronics', labelKey: 'nav.f2evo_electronics', subKey: 'nav.f2evo_electronics_sub', defaultLabel: 'F2-EVO Electronics', defaultSub: 'ABS board control', Outline: CpuChipIcon, Solid: CpuChipSolid },
  { id: 'f2evo_gearbox', labelKey: 'nav.f2evo_gearbox', subKey: 'nav.f2evo_gearbox_sub', defaultLabel: 'F2-EVO Gearbox', defaultSub: 'Gearbox control', Outline: CogIcon, Solid: CogSolidAlt },
  { id: 'f2evo_sensor', labelKey: 'nav.f2evo_sensor', subKey: 'nav.f2evo_sensor_sub', defaultLabel: 'F2-EVO Sensor', defaultSub: 'Sensor testing', Outline: EyeIcon, Solid: EyeSolid },
  { id: 'f2evo_washing', labelKey: 'nav.f2evo_washing', subKey: 'nav.f2evo_washing_sub', defaultLabel: 'F2-EVO Washing', defaultSub: 'Washing station', Outline: SparklesIcon, Solid: SparklesSolid },
];

interface SidebarProps {
  currentPage: Page;
  onPageChange: (page: Page) => void;
}

export default function Sidebar({ currentPage, onPageChange }: SidebarProps) {
  const { t } = useTranslation();

  const { legacyMode, setLegacyMode } = useAppSettings();
  const { currentUser, currentJob, isGuest, logout } = useSession();
  const routeScan = useScanRouter();
  const [scannerOpen, setScannerOpen] = useState(false);

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
    source,
    setSource,
    kvaserChannels,
    refreshKvaserChannels,
    selectedKvaserChannel,
    setSelectedKvaserChannel,
    canBitrate,
    setCanBitrate,
  } = useClientSerialConnection();

  const isKvaser = source === 'kvaser';

  // Second transport: the WSS signal board (only relevant alongside the Kvaser).
  const sb = useSignalBoard();

  // Refresh ports on mount
  useEffect(() => { refreshPorts(); }, []);

  const connected = serialConnected;

  return (
    <aside className="w-[220px] h-full flex flex-col bg-sidebar border-r border-sidebar-border shrink-0 select-none">

      {/* ── Navigation ── */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {TAB_DEFS.map(({ id, labelKey, subKey, defaultLabel, defaultSub, Outline, Solid }) => {
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
                  className="absolute left-0 inset-y-0 my-auto w-[3px] h-5 bg-accent rounded-r-full"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <span className="shrink-0">
                {active ? <Solid className="w-4 h-4" /> : <Outline className="w-4 h-4" />}
              </span>
              <span className="flex flex-col min-w-0">
                <span className="text-[13px] font-medium leading-tight truncate">{t(labelKey, { defaultValue: defaultLabel })}</span>
                <span className={[
                  'text-[10px] leading-tight truncate mt-0.5',
                  active ? 'text-accent/60' : 'text-text-tertiary',
                ].join(' ')}>
                  {t(subKey, { defaultValue: defaultSub })}
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
              onClick={() => setScannerOpen(true)}
              title={t('scan.open_scanner', { defaultValue: 'Scan a QR code' })}
              className="p-1 text-text-tertiary hover:text-accent transition-colors shrink-0"
            >
              <QrCodeIcon className="w-3.5 h-3.5" />
            </button>
            <NotificationBell />
            <button
              onClick={logout}
              title={isGuest ? t('common.sign_in') : t('common.sign_out')}
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
              <span className="text-[9px] text-text-tertiary shrink-0">{t('common.active')}</span>
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
                ? (isKvaser
                    ? `${kvaserChannels[selectedKvaserChannel]?.name ?? `CAN ch ${selectedKvaserChannel}`} · ${Math.round((parseInt(canBitrate, 10) || 0) / 1000)}k`
                    : `${selectedPort ?? 'Serial'} · ${baudRate}`)
                : t('connection.no_connection')}
            </span>
          </div>
          {legacyMode && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-warning/15 text-warning shrink-0">
              NANO
            </span>
          )}
          {isKvaser && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-purple-400/15 text-purple-400 shrink-0">
              KVASER
            </span>
          )}
          {!legacyMode && !isKvaser && picoDetected && !serialConnected && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-accent/15 text-accent shrink-0">
              PICO
            </span>
          )}
        </div>

        {/* Interface picker — board bridge vs a Kvaser CANlib device */}
        {!serialConnected && (
          <div className="flex gap-0.5 p-0.5 bg-app rounded-lg">
            {(['board', 'kvaser'] as const).map(s => (
              <button
                key={s}
                onClick={() => setSource(s)}
                className={[
                  'flex-1 py-1 text-[10px] font-semibold rounded-md transition-colors',
                  source === s
                    ? 'bg-elevated text-text-primary shadow-sm'
                    : 'text-text-tertiary hover:text-text-secondary',
                ].join(' ')}
              >
                {s === 'board' ? 'Board' : 'Kvaser'}
              </button>
            ))}
          </div>
        )}

        {/* Serial controls */}
        {!serialConnected ? (
          <>
            {/* Port / channel + refresh */}
            <div className="flex items-center gap-1.5">
              {isKvaser ? (
                <select
                  value={selectedKvaserChannel}
                  onChange={e => setSelectedKvaserChannel(parseInt(e.target.value, 10))}
                  className="flex-1 min-w-0 bg-elevated border border-border rounded-lg px-2 py-1.5
                    text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/40
                    focus:border-accent/50 transition-all"
                >
                  {kvaserChannels.length === 0 && (
                    <option value={0}>No Kvaser device</option>
                  )}
                  {kvaserChannels.map(ch => (
                    <option key={ch.index} value={ch.index}>
                      {ch.name}{ch.serial ? ` · #${ch.serial}` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  value={selectedPort ?? ''}
                  onChange={e => setSelectedPort(e.target.value || null)}
                  className="flex-1 min-w-0 bg-elevated border border-border rounded-lg px-2 py-1.5
                    text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/40
                    focus:border-accent/50 transition-all"
                >
                  <option value="">
                    {ports.length === 0 ? t('connection.no_ports') : t('connection.select_port')}
                  </option>
                  {ports.map(p => (
                    <option key={p.port_name} value={p.port_name}>{p.port_name}</option>
                  ))}
                </select>
              )}
              <button
                onClick={isKvaser ? refreshKvaserChannels : refreshPorts}
                title={isKvaser ? 'Refresh Kvaser channels' : 'Refresh ports'}
                className="p-1.5 bg-elevated border border-border rounded-lg text-text-tertiary
                  hover:text-text-primary transition-all shrink-0"
              >
                <ArrowPathIcon className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Baud rate / CAN bitrate */}
            {isKvaser ? (
              <select
                value={canBitrate}
                onChange={e => setCanBitrate(e.target.value)}
                className="w-full bg-elevated border border-border rounded-lg px-2 py-1.5
                  text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/40
                  focus:border-accent/50 transition-all"
              >
                {CAN_BITRATES.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            ) : (
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
            )}

            {isKvaser ? (
              kvaserChannels.length === 0 && (
                <p className="text-[10px] text-warning px-1">
                  Plug in the Kvaser (install “Kvaser Drivers for Windows”) then refresh ↻
                </p>
              )
            ) : (
              ports.length === 0 && (
                <p className="text-[10px] text-warning px-1">Connect Pico via USB then refresh ↻</p>
              )
            )}
            {serialError && (
              <p className="text-[10px] text-danger px-1 break-words">{serialError}</p>
            )}
          </>
        ) : (
          <div className="px-1 text-[11px] text-text-secondary">
            {isKvaser
              ? `${kvaserChannels[selectedKvaserChannel]?.name ?? `CAN ch ${selectedKvaserChannel}`} @ ${Math.round((parseInt(canBitrate, 10) || 0) / 1000)} kbit/s`
              : `${selectedPort} @ ${baudRate} baud`}
          </div>
        )}

        {/* Connect / Disconnect button */}
        <button
          onClick={() => serialConnected ? serialDisconnect() : serialConnect()}
          disabled={!serialConnected && (isKvaser ? kvaserChannels.length === 0 : !selectedPort)}
          className={[
            'w-full py-2 text-xs font-semibold rounded-lg transition-all duration-150',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            serialConnected
              ? 'bg-danger/10 text-danger hover:bg-danger/20 border border-danger/20'
              : 'bg-accent/10 text-accent hover:bg-accent/20 border border-accent/20',
          ].join(' ')}
        >
          {serialConnected ? t('connection.disconnect') : t('connection.connect')}
        </button>

        {/* ── Signal board (WSS) — second transport, Kvaser mode only ── */}
        {isKvaser && (
          <div className="pt-1.5 border-t border-sidebar-border space-y-1.5">
            <div className="flex items-center gap-2 px-1">
              <span className={[
                'w-1.5 h-1.5 rounded-full shrink-0',
                sb.isConnected ? 'bg-success animate-pulse-slow' : 'bg-text-tertiary',
              ].join(' ')} />
              <span className="text-[10px] font-medium text-text-secondary flex-1">
                Signal board (WSS)
              </span>
              {sb.isConnected && (
                <span className="text-[9px] text-success">{sb.selectedPort}</span>
              )}
            </div>

            {!sb.isConnected && (
              <div className="flex items-center gap-1.5">
                <select
                  value={sb.selectedPort ?? ''}
                  onChange={e => sb.setSelectedPort(e.target.value || null)}
                  className="flex-1 min-w-0 bg-elevated border border-border rounded-lg px-2 py-1
                    text-[11px] text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/40"
                >
                  <option value="">{sb.ports.length === 0 ? 'no ports' : 'select port'}</option>
                  {sb.ports.map(p => (
                    <option key={p.port_name} value={p.port_name}>{p.port_name}</option>
                  ))}
                </select>
                <button
                  onClick={sb.refreshPorts}
                  title="Refresh ports"
                  className="p-1 bg-elevated border border-border rounded-lg text-text-tertiary hover:text-text-primary shrink-0"
                >
                  <ArrowPathIcon className="w-3 h-3" />
                </button>
              </div>
            )}

            <button
              onClick={() => sb.isConnected ? sb.disconnect() : sb.connect()}
              disabled={!sb.isConnected && !sb.selectedPort}
              className={[
                'w-full py-1.5 text-[11px] font-semibold rounded-lg transition-all',
                'disabled:opacity-40 disabled:cursor-not-allowed',
                sb.isConnected
                  ? 'bg-danger/10 text-danger hover:bg-danger/20 border border-danger/20'
                  : 'bg-accent/10 text-accent hover:bg-accent/20 border border-accent/20',
              ].join(' ')}
            >
              {sb.isConnected ? 'Disconnect board' : 'Connect board'}
            </button>
            {sb.error && <p className="text-[10px] text-danger px-1 break-words">{sb.error}</p>}
          </div>
        )}

        {/* Legacy mode toggle */}
        <div className="flex items-center justify-between px-1 pt-1 border-t border-sidebar-border">
          <div>
            <span className="text-[11px] font-medium text-text-secondary">{t('connection.legacy_mode')}</span>
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

      </div>

      <QrScannerPanel
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onResult={routeScan}
      />

      {/* ── Language switcher ── */}
      <div className="border-t border-sidebar-border shrink-0 px-3 py-2 flex items-center justify-between">
        <span className="text-[10px] text-text-tertiary">{t('lang.language')}</span>
        <div className="flex rounded-lg overflow-hidden border border-border text-[10px] font-semibold">
          {(['en', 'fr'] as const).map(lng => (
            <button
              key={lng}
              onClick={() => i18n.changeLanguage(lng)}
              className={[
                'px-2.5 py-1 transition-colors',
                i18n.language === lng
                  ? 'bg-accent text-white'
                  : 'text-text-tertiary hover:text-text-primary hover:bg-elevated',
              ].join(' ')}
            >
              {lng.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
