import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { useTranslation } from 'react-i18next';

interface DbConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

export default function HomePage() {
  const { t } = useTranslation();
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
      setTestStatus({ msg: t('home.config_saved'), ok: true });
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
      <h1 className="text-2xl font-semibold text-text-primary mb-1 tracking-tight">{t('home.title')}</h1>
      <p className="text-sm text-text-secondary mb-8">{t('home.subtitle')}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* About */}
        <div className="card">
          <h2 className="text-sm font-semibold text-text-primary mb-4 tracking-tight">{t('home.about')}</h2>
          <div className="space-y-3 text-sm text-text-secondary">
            <div className="flex justify-between items-center">
              <span>Application</span>
              <span className="font-medium text-text-primary">BRAXON</span>
            </div>
            <div className="flex justify-between items-center">
              <span>{t('home.version')}</span>
              <span className="font-medium text-text-primary">1.0.0</span>
            </div>
            <div className="flex justify-between items-center">
              <span>{t('home.platform')}</span>
              <span className="font-medium text-text-primary">Tauri Desktop</span>
            </div>
            <div className="flex justify-between items-center">
              <span>{t('home.ws_server')}</span>
              <span className="font-medium text-success">127.0.0.1:8765</span>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-border">
            <h3 className="text-xs font-semibold text-text-secondary mb-3 tracking-wide uppercase">{t('home.pages')}</h3>
            <div className="space-y-2 text-sm text-text-secondary">
              <div><span className="text-text-primary font-medium">{t('nav.valves')}</span> — {t('home.valve_desc')}</div>
              <div><span className="text-text-primary font-medium">{t('nav.motors')}</span> — {t('home.motor_desc')}</div>
              <div><span className="text-text-primary font-medium">{t('nav.signal')}</span> — {t('home.signal_desc')}</div>
            </div>
          </div>
        </div>

        {/* DB Config */}
        <div className="card">
          <h2 className="text-sm font-semibold text-text-primary mb-1 tracking-tight">
            {t('auth.db_config')}
          </h2>
          <p className="text-xs text-text-tertiary mb-4">
            {t('home.db_subtitle')}
          </p>

          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="input-label">{t('home.host')}</label>
                <input
                  type="text"
                  value={config.host}
                  onChange={e => setConfig(c => ({ ...c, host: e.target.value }))}
                  className="input-field text-sm w-full"
                  placeholder="192.168.77.182"
                />
              </div>
              <div>
                <label className="input-label">{t('home.port')}</label>
                <input
                  type="number"
                  value={config.port}
                  onChange={e => setConfig(c => ({ ...c, port: parseInt(e.target.value) || 5432 }))}
                  className="input-field text-sm w-full"
                />
              </div>
            </div>

            <div>
              <label className="input-label">{t('home.database')}</label>
              <input
                type="text"
                value={config.database}
                onChange={e => setConfig(c => ({ ...c, database: e.target.value }))}
                className="input-field text-sm w-full"
              />
            </div>

            <div>
              <label className="input-label">{t('home.username')}</label>
              <input
                type="text"
                value={config.username}
                onChange={e => setConfig(c => ({ ...c, username: e.target.value }))}
                className="input-field text-sm w-full"
              />
            </div>

            <div>
              <label className="input-label">{t('auth.password')}</label>
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
                {saving ? t('common.loading') : t('common.save')}
              </button>
              <button
                onClick={handleTest}
                disabled={testing}
                className="btn-secondary text-sm flex-1"
              >
                {testing ? t('home.testing') : t('home.test_connection')}
              </button>
            </div>

            {testStatus && (
              <div className={[
                'text-xs p-3 rounded-xl border',
                testStatus.ok
                  ? 'bg-success/10 border-success/20 text-success'
                  : 'bg-danger/10 border-danger/20 text-danger'
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
