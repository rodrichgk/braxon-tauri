import { useState, useEffect } from 'react';
import { useClientSerialConnection } from '@/hooks/useClientSerialConnection';
import { useTranslation } from 'react-i18next';

export default function ConnectionBar() {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

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

  useEffect(() => {
    if (expanded && !serialConnected) refreshPorts();
  }, [expanded]);

  return (
    <div className="bg-slate-800 dark:bg-slate-950 border-b border-slate-700 text-white text-sm">
      <div className="container mx-auto px-4">
        <div className="flex items-center gap-4 h-9">
          {/* Status dot + label */}
          <div className="flex items-center gap-2 shrink-0">
            <span className={[
              'w-2 h-2 rounded-full',
              serialConnected ? 'bg-green-400 animate-pulse' : 'bg-slate-500'
            ].join(' ')} />
            <span className={serialConnected ? 'text-green-400' : 'text-slate-400'}>
              {serialConnected ? `${selectedPort ?? 'Serial'} Connected` : 'No Device'}
            </span>
          </div>

          <div className="flex-1" />

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
            {serialConnected ? 'Disconnect' : 'Serial'}
          </button>

          <button
            onClick={() => setExpanded(v => !v)}
            className="px-2 py-0.5 text-xs bg-slate-700 hover:bg-slate-600 rounded"
          >
            {expanded ? '▲ Less' : '▼ Details'}
          </button>
        </div>

        {/* Expanded panel */}
        {expanded && (
          <div className="py-3 border-t border-slate-700">
            <p className="text-xs text-slate-400 mb-2 font-semibold uppercase tracking-wide">Serial (USB)</p>

            {!serialConnected && (
              <div className="space-y-2 mb-2">
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
                  <p className="text-xs text-amber-400">Connect Pico 2 via USB, then click ↻</p>
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
        )}
      </div>
    </div>
  );
}
