import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ValveIndicator } from './ValveIndicator';
import { ABSProfile, Valve, ValveStatus } from '@/types/abs';
import { ChartBarIcon, ClipboardDocumentListIcon, PlayIcon, InformationCircleIcon, StopIcon } from '@heroicons/react/24/outline';
import { useClientSerialConnection } from '@/hooks/useClientSerialConnection';
import clsx from 'clsx';

interface ABSTesterProps {
  profile: ABSProfile;
}

// Commands for the ABS tester — placeholder: actual valve protocol TBD
const ABSCommands = {
  START_TEST: 'START',
  STOP_TEST: 'STOP',
  TEST_VALVE: (valveId: number) => `TEST ${valveId}`,
  TEST_VALVES: (valveIds: number[]) => `TEST ${valveIds.join(',')}`
} as const;

interface RawMessage {
  msg: string;
  time: string;
}

export function ABSTester({ profile }: ABSTesterProps) {
  const [selectedValves, setSelectedValves] = useState<number[]>([]);
  const [activeTab, setActiveTab] = useState<'test' | 'sequence' | 'report'>('test');
  const [testingAll, setTestingAll] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const {
    isConnected,
    sendCommand,
    errorMessage,
  } = useClientSerialConnection({
    onDataReceived: (data) => {
      if (typeof data === 'string') {
        const time = new Date().toTimeString().split(' ')[0];
        setRawMessages(prev => [...prev, { msg: data, time }].slice(-100));
      }
    },
  });

  const [valveStates, setValveStates] = useState<Array<Valve>>(() => {
    const count = profile.module.valveCount;
    return Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      name: `Valve ${i + 1}`,
      health: 100,
      status: 'inactive' as ValveStatus,
    }));
  });
  const [rawMessages, setRawMessages] = useState<RawMessage[]>([]);
  const [showDebugConsole, setShowDebugConsole] = useState(false);
  const [errorState, setErrorState] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [rawMessages]);

  useEffect(() => {
    const count = profile.module.valveCount;
    setValveStates(
      Array.from({ length: count }, (_, i) => ({
        id: i + 1,
        name: `Valve ${i + 1}`,
        health: 100,
        status: 'inactive' as ValveStatus,
      }))
    );
    setSelectedValves([]);
    setTestingAll(false);
    setIsTesting(false);
  }, [profile.module.valveCount]);

  const handleValveClick = (valve: Valve) => {
    if (isTesting || testingAll) return;

    setSelectedValves(prev => {
      const isSelected = prev.includes(valve.id);
      return isSelected
        ? prev.filter(id => id !== valve.id)
        : [...prev, valve.id];
    });
  };

  const handleTestSelected = async () => {
    if (!isConnected) {
      setErrorState('Not connected to ABS tester board. Please check the USB connection.');
      return;
    }

    if (isTesting) {
      const success = await sendCommand(ABSCommands.STOP_TEST);
      if (success) {
        setIsTesting(false);
        setValveStates(prev => prev.map(v =>
          selectedValves.includes(v.id)
            ? { ...v, status: 'inactive' as ValveStatus }
            : v
        ));
      }
    } else {
      if (selectedValves.length === 0) return;

      const startSuccess = await sendCommand(ABSCommands.START_TEST);
      if (startSuccess) {
        const success = await sendCommand(ABSCommands.TEST_VALVES(selectedValves));
        if (success) {
          setIsTesting(true);
          setValveStates(prev => prev.map(v =>
            selectedValves.includes(v.id)
              ? { ...v, status: 'testing' as ValveStatus }
              : v
          ));
        }
      }
    }
  };

  const handleTestAll = async () => {
    if (!isConnected) {
      setErrorState('Not connected to ABS tester board. Please check the USB connection.');
      return;
    }

    if (testingAll) {
      const success = await sendCommand(ABSCommands.STOP_TEST);
      if (success) {
        setTestingAll(false);
        setValveStates(prev => prev.map(v => ({
          ...v,
          status: 'inactive' as ValveStatus
        })));
      }
    } else {
      const success = await sendCommand(ABSCommands.START_TEST);
      if (success) {
        setTestingAll(true);
        setSelectedValves([]);
        setValveStates(prev => prev.map(v => ({
          ...v,
          status: 'testing' as ValveStatus
        })));
      }
    }
  };

  const tabs = [
    {
      id: 'test',
      name: 'Test Valves',
      icon: PlayIcon,
    },
    {
      id: 'sequence',
      name: 'Test Sequence',
      icon: ClipboardDocumentListIcon,
    },
    {
      id: 'report',
      name: 'Test Report',
      icon: ChartBarIcon,
    }
  ] as const;

  const getGridCols = () => {
    const count = profile.module.valveCount;
    if (count <= 4) return 'grid-cols-2 sm:grid-cols-4';
    if (count <= 6) return 'grid-cols-2 sm:grid-cols-3';
    if (count <= 8) return 'grid-cols-2 sm:grid-cols-4';
    return 'grid-cols-2 sm:grid-cols-4 md:grid-cols-6';
  };

  const getABSModuleImage = (moduleName: string): string => {
    if (moduleName.includes('MK60')) return '/images/MK60.png';
    if (moduleName.includes('MK61')) return '/images/MK61.png';
    if (moduleName.includes('MK70')) return '/images/MK70.png';
    if (moduleName.includes('MK100')) return '/images/MK100.png';
    if (moduleName.includes('Bosch 8.0') || moduleName.includes('Bosch8.0')) return '/images/Bosch80.png';
    if (moduleName.includes('Bosch 9.0') || moduleName.includes('Bosch9.0')) return '/images/Bosch90.png';
    const normalized = moduleName.replace(/[\s.-]/g, '');
    return normalized ? `/images/${normalized}.png` : '';
  };

  return (
    <div className="space-y-6">
      {(errorState || errorMessage) && (
        <div className="alert alert-error" role="alert">
        <strong className="font-bold">Error!</strong>
        <span className="block sm:inline"> {errorState || errorMessage}</span>
        <span className="absolute top-0 bottom-0 right-0 px-4 py-3">
          <svg onClick={() => setErrorState(null)} className="fill-current h-6 w-6 text-red-600 hover:text-red-700 cursor-pointer" role="button" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><title>Close</title><path fillRule="evenodd" d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z" clipRule="evenodd"/></svg>
        </span>
      </div>
      )}

      {/* Module Info */}
      <div className="glass-effect rounded-xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="card-header">
              {profile.module.name} Configuration
            </h2>
            <p className="mt-1 text-gray-600 dark:text-gray-400">
              {profile.module.description}
            </p>
            <p className="mt-2 text-sm status-info">
              Module has {profile.module.valveCount} valves for testing
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="glass-effect rounded-full px-3 py-1.5 flex items-center gap-2">
              <InformationCircleIcon className="h-4 w-4 text-accent" />
              <span className="text-sm font-medium text-text-primary">
                {profile.module.valveCount} valves
              </span>
            </div>
          </div>
        </div>
        <div className="mt-4">
          <div className={`inline-flex items-center gap-2 text-sm ${isConnected ? 'status-success' : 'status-error'}`}>
            <div className={`connection-dot ${isConnected ? 'connection-connected' : 'connection-disconnected'}`} />
            <span>{isConnected ? 'Connected' : 'Disconnected — use the bar above to connect'}</span>
          </div>
        </div>
      </div>

      {/* Debug Console Toggle Button */}
      <div className="flex justify-end mb-2">
        <button
          onClick={() => setShowDebugConsole(prev => !prev)}
          className={clsx(
            showDebugConsole ? "btn-primary" : "btn-secondary"
          )}
        >
          {showDebugConsole ? "Hide Debug Console" : "Show Debug Console"}
        </button>
      </div>

      {/* Debug Console */}
      {showDebugConsole && (
        <div className="glass-effect rounded-xl p-4 mb-6">
          <h3 className="text-lg font-medium mb-2">Raw Messages from Board</h3>
          <div className="bg-black text-green-400 font-mono p-2 rounded-md h-64 overflow-y-auto">
            {rawMessages.length === 0 ? (
              <p className="text-gray-500">No messages received yet...</p>
            ) : (
              rawMessages.map((entry, idx) => (
                <div key={idx} className="mb-1">
                  <span className="text-gray-500 text-xs mr-2">{entry.time}</span>
                  <span>{entry.msg}</span>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="glass-effect rounded-xl overflow-hidden">
        {/* Tabs */}
        <div className="border-b border-border px-6">
          <nav className="-mb-px flex space-x-6" aria-label="Tabs">
            {tabs.map(({ id, name, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={clsx(
                  'py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap',
                  'flex items-center gap-2 transition-all duration-200',
                  activeTab === id
                    ? 'border-accent text-accent'
                    : 'border-transparent text-text-tertiary hover:text-text-primary hover:border-border'
                )}
              >
                <Icon className="h-5 w-5" />
                {name}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'test' && (
                <div className="flex flex-col md:flex-row gap-6">
                  <div className="flex-1">
                    <div className="flex justify-end gap-3 mb-6">
                      {/* Bench Report finding: the icon/label were forced
                          text-white unconditionally, while the button
                          itself correctly fell back to btn-secondary
                          (a light background in light mode) when
                          disconnected — white-on-light-grey, a near-
                          invisible disabled state. Label color now
                          follows the same connected/disconnected branch
                          the button's own variant class already does. */}
                      <button
                        onClick={handleTestSelected}
                        disabled={
                          selectedValves.length === 0 ||
                          testingAll ||
                          !isConnected
                        }
                        className={clsx(
                          'flex items-center gap-2',
                          !isConnected && 'btn-secondary opacity-50 cursor-not-allowed',
                          isConnected && !isTesting && selectedValves.length > 0 && 'btn-primary',
                          isConnected && isTesting && 'btn-danger'
                        )}
                      >
                        {isTesting ? (
                          <StopIcon className={clsx('h-5 w-5', isConnected ? 'text-white' : 'text-text-secondary')} />
                        ) : (
                          <PlayIcon className={clsx('h-5 w-5', isConnected ? 'text-white' : 'text-text-secondary')} />
                        )}
                        <span className={isConnected ? 'text-white' : 'text-text-secondary'}>
                          {isTesting
                            ? 'Stop Test'
                            : `Test Selected (${selectedValves.length})`}
                        </span>
                      </button>
                      <button
                        onClick={handleTestAll}
                        disabled={!isConnected}
                        className={clsx(
                          'flex items-center gap-2',
                          !isConnected && 'btn-secondary opacity-50 cursor-not-allowed',
                          isConnected && !testingAll && 'btn-primary',
                          isConnected && testingAll && 'btn-danger'
                        )}
                      >
                        {testingAll ? (
                          <StopIcon className={clsx('h-5 w-5', isConnected ? 'text-white' : 'text-text-secondary')} />
                        ) : (
                          <PlayIcon className={clsx('h-5 w-5', isConnected ? 'text-white' : 'text-text-secondary')} />
                        )}
                        <span className={isConnected ? 'text-white' : 'text-text-secondary'}>
                          {testingAll ? 'Stop All Tests' : 'Test All Valves'}
                        </span>
                      </button>
                    </div>

                    <div className={`grid ${getGridCols()} gap-4`}>
                      {valveStates.map((valve) => (
                        <ValveIndicator
                          key={valve.id}
                          valve={valve}
                          selected={selectedValves.includes(valve.id)}
                          onClick={() => handleValveClick(valve)}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex-1 hidden md:block" key={profile.module.name}>
                    <img
                      src={getABSModuleImage(profile.module.name)}
                      alt={profile.module.name}
                      className="w-full h-full object-contain max-h-96"
                      onLoad={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'block';
                        (target.parentNode as HTMLElement).style.display = 'block';
                      }}
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        (target.parentNode as HTMLElement).style.display = 'none';
                      }}
                    />
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Testing Progress — indeterminate, shown while test is running */}
      {(selectedValves.length > 0 && isTesting && activeTab === 'test') && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-effect rounded-xl p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-text-primary">
              Testing Valves {selectedValves.join(', ')} - {profile.module.name}
            </h2>
            <span className="text-sm font-medium text-accent">
              Running diagnostics...
            </span>
          </div>
          <div className="space-y-4">
            <div className="h-2 bg-elevated rounded-full overflow-hidden">
              <motion.div
                className="h-full w-1/3 bg-accent rounded-full"
                animate={{ x: ['-100%', '300%'] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              />
            </div>
          </div>
        </motion.div>
      )}

      {testingAll && activeTab === 'test' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-effect rounded-xl p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-text-primary">
              Testing All Valves - {profile.module.name}
            </h2>
            <span className="text-sm font-medium text-accent">
              Running diagnostics...
            </span>
          </div>
          <div className="space-y-4">
            <div className="h-2 bg-elevated rounded-full overflow-hidden">
              <motion.div
                className="h-full w-1/3 bg-accent rounded-full"
                animate={{ x: ['-100%', '300%'] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              />
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
