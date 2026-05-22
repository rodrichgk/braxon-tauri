import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';

interface DbConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

export default function HomePage() {
  const [config, setConfig] = useState<DbConfig>({
    host: '192.168.77.182',
    port: 5432,
    database: 'abs_tester',
    username: 'abs_user',
    password: '',
  });
  const [testStatus, setTestStatus] = useState<{ msg: string; ok: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    invoke<DbConfig>('get_db_config')
      .then(setConfig)
      .catch(console.error);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await invoke('save_db_config', { config });
      setTestStatus({ msg: 'Configuration saved.', ok: true });
    } catch (e: any) {
      setTestStatus({ msg: String(e), ok: false });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestStatus(null);
    try {
      // Save first so backend uses latest values
      await invoke('save_db_config', { config });
      const msg = await invoke<string>('test_db_connection');
      setTestStatus({ msg, ok: true });
    } catch (e: any) {
      setTestStatus({ msg: String(e), ok: false });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Dashboard</h1>
      <p className="text-slate-500 dark:text-slate-400 mb-8">Application info and configuration</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* About */}
        <div className="glass-effect rounded-xl p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">About</h2>
          <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
            <div className="flex justify-between">
              <span>Application</span>
              <span className="font-medium text-slate-900 dark:text-white">PIC ABS Tester</span>
            </div>
            <div className="flex justify-between">
              <span>Version</span>
              <span className="font-medium text-slate-900 dark:text-white">1.0.0</span>
            </div>
            <div className="flex justify-between">
              <span>Platform</span>
              <span className="font-medium text-slate-900 dark:text-white">Tauri Desktop</span>
            </div>
            <div className="flex justify-between">
              <span>WebSocket Server</span>
              <span className="font-medium text-green-600">127.0.0.1:8765</span>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Tabs</h3>
            <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
              <div>⚙️ <strong>Valve Testing</strong> — Test solenoid valves on the hydraulic modulator block</div>
              <div>🔧 <strong>Motor Testing</strong> — Test the pump motor on the ABS block</div>
              <div>📡 <strong>WSS HIL Simulation</strong> — Wheel Speed Sensor Hardware in the Loop simulation</div>
            </div>
          </div>
        </div>

        {/* DB Config */}
        <div className="glass-effect rounded-xl p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
            Database Connection
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Direct connection to PostgreSQL — no web server needed.
          </p>

          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Host</label>
                <input
                  type="text"
                  value={config.host}
                  onChange={e => setConfig(c => ({ ...c, host: e.target.value }))}
                  className="input-field text-sm w-full"
                  placeholder="192.168.77.182"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Port</label>
                <input
                  type="number"
                  value={config.port}
                  onChange={e => setConfig(c => ({ ...c, port: parseInt(e.target.value) || 5432 }))}
                  className="input-field text-sm w-full"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Database</label>
              <input
                type="text"
                value={config.database}
                onChange={e => setConfig(c => ({ ...c, database: e.target.value }))}
                className="input-field text-sm w-full"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Username</label>
              <input
                type="text"
                value={config.username}
                onChange={e => setConfig(c => ({ ...c, username: e.target.value }))}
                className="input-field text-sm w-full"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Password</label>
              <input
                type="password"
                value={config.password}
                onChange={e => setConfig(c => ({ ...c, password: e.target.value }))}
                className="input-field text-sm w-full"
                placeholder="••••••••"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn-primary text-sm flex-1"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={handleTest}
                disabled={testing}
                className="btn-secondary text-sm flex-1"
              >
                {testing ? 'Testing…' : 'Test Connection'}
              </button>
            </div>

            {testStatus && (
              <div className={[
                'text-xs p-3 rounded-lg',
                testStatus.ok
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                  : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
              ].join(' ')}>
                {testStatus.ok ? '✓ ' : '✗ '}{testStatus.msg}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
