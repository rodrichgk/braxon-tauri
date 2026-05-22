import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import SignalTester from '@/components/SignalTester/SignalTesterMain';
import CANSettings from '@/components/CANSettings';
import BenchPower from '@/components/BenchPower';
import PowerIndicators from '@/components/PowerIndicators';
import { useWebSocketContext } from '@/contexts/WebSocketContext';
import { useClientSerialConnection } from '@/hooks/useClientSerialConnection';

interface ABSDataRow {
  id: string;
  reference: string;
  manufacturer: string;
  wssType?: string;
  absAdapter?: string;
  absConnector?: string;
  canSpeed?: string;
  canIdLine?: string;
  canByte?: string;
  canValue?: string;
  comments?: string;
  testValidated?: string;
  otherReferences?: string;
}

export default function SignalPage() {
  const { sendMessage: wsSendMessage, isConnectedToDevice } = useWebSocketContext();
  const { isConnected: serialConnected, sendCommand: serialSendCommand } = useClientSerialConnection();
  const isConnected = isConnectedToDevice || serialConnected;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ABSDataRow[]>([]);
  const [selected, setSelected] = useState<ABSDataRow | null>(null);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canData = {
    canSpeed: selected?.canSpeed || '',
    canByte: selected?.canByte || '',
    canIdLine: selected?.canIdLine || '',
    canValue: selected?.canValue || '',
  };

  const canReceivedData = { idLine: '', byte: '', value: '' };

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await invoke<ABSDataRow[]>('search_abs_data', { query });
        setResults(data);
      } catch (e: any) {
        console.error('Search error:', e);
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const handleSendMessage = async (message: string): Promise<boolean | void> => {
    if (serialConnected) {
      return serialSendCommand(message);
    }
    return wsSendMessage({ type: 1, data: message, timestamp: Date.now() });
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Wheel Speed Sensor — Hardware in the Loop Simulation</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">ABS ECU diagnostics via CAN / K-Line / Wheel speed signals</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column */}
        <div className="space-y-6">
          {/* ABS Database Search */}
          <div className="glass-effect rounded-xl p-5">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-3">ABS Reference Database</h2>
            <div className="relative mb-3">
              <input
                type="text"
                value={query}
                onChange={e => { setQuery(e.target.value); setSelected(null); }}
                placeholder="Part number, manufacturer, type..."
                className="input-field w-full text-sm pr-8"
              />
              {searching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              )}
            </div>

            {results.length > 0 && (
              <div className="max-h-48 overflow-y-auto space-y-1">
                {results.map(row => (
                  <button
                    key={row.id}
                    onClick={() => setSelected(row)}
                    className={[
                      'w-full text-left px-3 py-2 rounded-lg text-sm transition-all',
                      selected?.id === row.id
                        ? 'bg-blue-50 dark:bg-blue-900/30 ring-1 ring-blue-500'
                        : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700'
                    ].join(' ')}
                  >
                    <div className="font-medium text-slate-900 dark:text-white">{row.reference}</div>
                    <div className="text-xs text-slate-500">{row.manufacturer} {row.wssType ? `· ${row.wssType}` : ''}</div>
                  </button>
                ))}
              </div>
            )}

            {selected && (
              <div className="mt-3 p-3 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs space-y-1">
                <div className="font-semibold text-slate-900 dark:text-white text-sm mb-1">{selected.reference}</div>
                {selected.canSpeed   && <div><span className="text-slate-500">CAN Speed:</span> {selected.canSpeed}</div>}
                {selected.canIdLine  && <div><span className="text-slate-500">CAN ID:</span> {selected.canIdLine}</div>}
                {selected.canByte    && <div><span className="text-slate-500">CAN Byte:</span> {selected.canByte}</div>}
                {selected.canValue   && <div><span className="text-slate-500">CAN Value:</span> {selected.canValue}</div>}
                {selected.absAdapter && <div><span className="text-slate-500">Adapter:</span> {selected.absAdapter}</div>}
                {selected.absConnector && <div><span className="text-slate-500">Connector:</span> {selected.absConnector}</div>}
                {selected.comments   && <div><span className="text-slate-500">Notes:</span> {selected.comments}</div>}
                {selected.testValidated && (
                  <div className={`mt-1 font-medium ${selected.testValidated === 'yes' ? 'text-green-600' : 'text-amber-600'}`}>
                    {selected.testValidated === 'yes' ? '✓ Test validated' : '⚠ Not validated'}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* CAN Settings */}
          <CANSettings
            result={canData}
            isConnected={isConnected}
            sendMessage={handleSendMessage}
            canReceivedData={canReceivedData}
          />
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <PowerIndicators sendMessage={handleSendMessage} />
          <BenchPower sendMessage={handleSendMessage} />
          
        </div>
      </div>
      <div className="mt-6">
        <SignalTester sendMessage={handleSendMessage} />
      </div>
    </div>
  );
}
