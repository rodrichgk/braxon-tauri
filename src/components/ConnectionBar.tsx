import { useState, useEffect } from 'react';
import { useWebSocketContext } from '@/contexts/WebSocketContext';
import { useClientSerialConnection } from '@/hooks/useClientSerialConnection';
import { useTranslation } from 'react-i18next';

export default function ConnectionBar() {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const {
    devices,
    selectedDeviceId,
    selectDevice,
    isConnectedToDevice,
  } = useWebSocketContext();

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
  } = useClientSerialConnection();

  // Refresh port list each time the details panel opens
  useEffect(() => {
    if (expanded && !serialConnected) refreshPorts();
  }, [expanded]);

  const esp32Devices = devices.filter(d => d.device_type === 'esp32');
  const overallConnected = isConnectedToDevice || serialConnected;

  return (
    <div className="bg-slate-800 dark:bg-slate-950 border-b border-slate-700 text-white text-sm">
      <div className="container mx-auto px-4">
        <div className="flex items-center gap-4 h-9">
          {/* Status dot + label */}
          <div className="flex items-center gap-2 shrink-0">
            <span className={[
              'w-2 h-2 rounded-full',
              overallConnected ? 'bg-green-400 animate-pulse' : 'bg-slate-500'
            ].join(' ')} />
            <span className={overallConnected ? 'text-green-400' : 'text-slate-400'}>
              {overallConnected
                ? isConnectedToDevice
                  ? `ESP32 Connected`
                  : 'Serial Connected'
                : 'No Device'}
            </span>
          </div>

          {/* Selected device ID */}
          {selectedDeviceId && (
            <span className="text-slate-400 text-xs hidden sm:block">
              ID: {selectedDeviceId}
            </span>
          )}

          <div className="flex-1" />

          {/* ESP32 quick-select */}
          {esp32Devices.length > 0 && !isConnectedToDevice && (
            <select
              onChange={e => selectDevice(e.target.value || null)}
              value={selectedDeviceId || ''}
              className="bg-slate-700 border border-slate-600 rounded px-2 py-0.5 text-xs text-white"
            >
              <option value="">Select ESP32...</option>
              {esp32Devices.map(d => (
                <option key={d.id} value={d.id} disabled={!!d.paired_with_client}>
                  {d.id}{d.paired_with_client ? ' (in use)' : ''}
                </option>
              ))}
            </select>
          )}

          {/* Disconnect ESP32 */}
          {isConnectedToDevice && (
            <button
              onClick={() => selectDevice(null)}
              className="px-2 py-0.5 text-xs bg-red-700 hover:bg-red-600 rounded"
            >
              Disconnect ESP32
            </button>
          )}

          {/* Serial connect/disconnect */}
          <button
            onClick={() => serialConnected ? serialDisconnect() : serialConnect()}
            className={[
              'px-2 py-0.5 text-xs rounded',
              serialConnected
                ? 'bg-red-700 hover:bg-red-600'
                : 'bg-slate-600 hover:bg-slate-500'
            ].join(' ')}
          >
            {serialConnected ? 'Disconnect Serial' : 'Serial'}
          </button>

          {/* Expand/collapse details */}
          <button
            onClick={() => setExpanded(v => !v)}
            className="px-2 py-0.5 text-xs bg-slate-700 hover:bg-slate-600 rounded"
          >
            {expanded ? '▲ Less' : '▼ Details'}
          </button>
        </div>

        {/* Expanded panel */}
        {expanded && (
          <div className="py-3 border-t border-slate-700 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* ESP32 devices */}
            <div>
              <p className="text-xs text-slate-400 mb-2 font-semibold uppercase tracking-wide">
                ESP32 Devices ({esp32Devices.length})
              </p>
              {esp32Devices.length === 0 ? (
                <p className="text-xs text-slate-500">{t('conn_bar.no_devices')}</p>
              ) : (
                <div className="space-y-1">
                  {esp32Devices.map(d => {
                    const isSelected = d.id === selectedDeviceId;
                    const inUse = !!d.paired_with_client && !isSelected;
                    return (
                      <div key={d.id} className="flex items-center justify-between bg-slate-700 rounded px-3 py-1.5">
                        <div>
                          <span className="text-white text-xs">{d.id}</span>
                          {isSelected && <span className="ml-2 text-xs text-green-400">● {t('conn_bar.active')}</span>}
                          {inUse && <span className="ml-2 text-xs text-yellow-400">● {t('conn_bar.in_use')}</span>}
                        </div>
                        <button
                          onClick={() => selectDevice(isSelected ? null : d.id)}
                          disabled={inUse}
                          className={[
                            'px-2 py-0.5 text-xs rounded',
                            isSelected ? 'bg-red-600 hover:bg-red-500' :
                            inUse ? 'bg-slate-600 opacity-50 cursor-not-allowed' :
                            'bg-green-700 hover:bg-green-600'
                          ].join(' ')}
                        >
                          {isSelected ? t('connection.disconnect') : inUse ? t('conn_bar.busy') : t('connection.connect')}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Serial connection */}
            <div>
              <p className="text-xs text-slate-400 mb-2 font-semibold uppercase tracking-wide">Serial (USB)</p>

              {!serialConnected && (
                <div className="space-y-2 mb-2">
                  {/* Port picker + refresh */}
                  <div className="flex items-center gap-1">
                    <select
                      value={selectedPort ?? ''}
                      onChange={e => setSelectedPort(e.target.value || null)}
                      className="flex-1 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white
                        focus:outline-none focus:border-blue-500"
                    >
                      <option value="">
                        {ports.length === 0 ? '— no ports found —' : '— select port —'}
                      </option>
                      {ports.map(p => (
                        <option key={p.port_name} value={p.port_name}>
                          {p.port_name}  [{p.port_type}]
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={refreshPorts}
                      title="Refresh port list"
                      className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded"
                    >
                      ↻
                    </button>
                  </div>

                  {/* Baud rate */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 w-14 shrink-0">{t('conn_bar.baud_rate')}</span>
                    <select
                      value={baudRate}
                      onChange={e => setBaudRate(e.target.value)}
                      className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white
                        focus:outline-none focus:border-blue-500"
                    >
                      {['9600','19200','38400','57600','115200','230400','460800','921600'].map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>

                  {ports.length === 0 && (
                    <p className="text-xs text-amber-400">
                      Connect Pico 2 via USB, then click ↻
                    </p>
                  )}
                  {serialError && <p className="text-xs text-red-400">{serialError}</p>}
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={() => serialConnected ? serialDisconnect() : serialConnect()}
                  disabled={!serialConnected && !selectedPort}
                  className={[
                    'px-3 py-1 text-xs rounded disabled:opacity-40 disabled:cursor-not-allowed',
                    serialConnected ? 'bg-red-600 hover:bg-red-500' : 'bg-green-700 hover:bg-green-600'
                  ].join(' ')}
                >
                  {serialConnected ? 'Disconnect' : 'Connect'}
                </button>
                {serialConnected && (
                  <span className="text-xs text-green-400">
                    ● {selectedPort} @ {baudRate}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
