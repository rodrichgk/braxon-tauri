import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { getVersion } from '@tauri-apps/api/app';
import { useTranslation } from 'react-i18next';
import { useSession, UserRole } from '@/contexts/SessionContext';

import type { DbConfig } from '@/lib/types';

function ProfileCard() {
  const { t } = useTranslation();
  const { currentUser, isGuest, updateRole } = useSession();
  const [saving, setSaving] = useState(false);

  if (!currentUser || isGuest) return null;

  const roles: { id: UserRole; labelKey: string; descKey: string }[] = [
    { id: 'technicien', labelKey: 'profile.technicien', descKey: 'profile.technicien_desc' },
    { id: 'commercial', labelKey: 'profile.commercial', descKey: 'profile.commercial_desc' },
  ];

  const handlePick = async (role: UserRole) => {
    if (role === currentUser.role || saving) return;
    setSaving(true);
    try {
      await updateRole(role);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <h2 className="text-sm font-semibold text-text-primary mb-1 tracking-tight">{t('profile.title')}</h2>
      <p className="text-xs text-text-tertiary mb-4">{t('profile.subtitle')}</p>
      <div className="space-y-2">
        {roles.map(r => {
          const active = currentUser.role === r.id;
          return (
            <button
              key={r.id}
              onClick={() => handlePick(r.id)}
              disabled={saving}
              className={[
                'w-full text-left px-3 py-2.5 rounded-xl border transition-all disabled:opacity-60',
                active
                  ? 'bg-accent/10 border-accent/30 text-accent'
                  : 'bg-elevated border-border text-text-secondary hover:text-text-primary hover:border-accent/20',
              ].join(' ')}
            >
              <span className="text-sm font-medium block">{t(r.labelKey)}</span>
              <span className="text-xs text-text-tertiary block mt-0.5">{t(r.descKey)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface HydraulicImportStats {
  absModels: number;
  canali: number;
  cicli: number;
  ordineTest: number;
  ripetizioni: number;
  test: number;
  testValvole: number;
  valvoleCicli: number;
  valvoleTest: number;
}

export default function HomePage() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<DbConfig>({
    host: '',
    port: 5432,
    database: '',
    username: '',
    password: '',
  });
  const [testStatus, setTestStatus] = useState<{ msg: string; ok: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [appVersion, setAppVersion] = useState('');

  const [hydraulicFolder, setHydraulicFolder] = useState('');
  const [hydraulicImporting, setHydraulicImporting] = useState(false);
  const [hydraulicResult, setHydraulicResult] = useState<{ stats?: HydraulicImportStats; error?: string } | null>(null);

  useEffect(() => {
    invoke<DbConfig>('get_db_config')
      .then(setConfig)
      .catch(console.error);
    getVersion().then(setAppVersion).catch(() => {});
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

  const handleBrowseHydraulicFolder = async () => {
    const { open } = await import('@tauri-apps/api/dialog');
    const selected = await open({ directory: true, title: t('home.hydraulic_pick_folder') });
    if (typeof selected === 'string') setHydraulicFolder(selected);
  };

  const handleImportHydraulic = async () => {
    if (!hydraulicFolder) return;
    setHydraulicImporting(true);
    setHydraulicResult(null);
    try {
      const stats = await invoke<HydraulicImportStats>('import_hydraulic_cycles', { folderPath: hydraulicFolder });
      setHydraulicResult({ stats });
    } catch (e: any) {
      setHydraulicResult({ error: String(e) });
    } finally {
      setHydraulicImporting(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-2xl font-semibold text-text-primary mb-1 tracking-tight">{t('home.title')}</h1>
      <p className="text-sm text-text-secondary mb-8">{t('home.subtitle')}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Profile */}
        <ProfileCard />

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
              <span className="font-medium text-text-primary">{appVersion || '…'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span>{t('home.platform')}</span>
              <span className="font-medium text-text-primary">Tauri Desktop</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Connection</span>
              <span className="font-medium text-text-primary">USB Serial</span>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-border">
            <h3 className="text-xs font-semibold text-text-secondary mb-3 tracking-wide uppercase">{t('home.pages')}</h3>
            {/* Bench Report finding: this list hadn't been updated since
                before the REMAN integration — Jobs, Reman Data, and the
                whole F2-EVO bench (now the majority of the sidebar) went
                unmentioned in a new user's very first orientation. */}
            <div className="space-y-2 text-sm text-text-secondary">
              <div><span className="text-text-primary font-medium">{t('nav.valves')}</span> — {t('home.valve_desc')}</div>
              <div><span className="text-text-primary font-medium">{t('nav.motors')}</span> — {t('home.motor_desc')}</div>
              <div><span className="text-text-primary font-medium">{t('nav.signal')}</span> — {t('home.signal_desc')}</div>
              <div><span className="text-text-primary font-medium">{t('nav.jobs')}</span> — {t('home.jobs_desc')}</div>
              <div><span className="text-text-primary font-medium">{t('nav.reman')}</span> — {t('home.reman_desc')}</div>
              <div><span className="text-text-primary font-medium">{t('nav.f2evo')}</span> — {t('home.f2evo_desc')}</div>
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

        {/* Hydraulic cycles import */}
        <div className="card">
          <h2 className="text-sm font-semibold text-text-primary mb-1 tracking-tight">
            {t('home.hydraulic_import')}
          </h2>
          <p className="text-xs text-text-tertiary mb-4">
            {t('home.hydraulic_import_subtitle')}
          </p>

          <div className="space-y-3">
            <div>
              <label className="input-label">{t('home.hydraulic_folder')}</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={hydraulicFolder}
                  onChange={e => setHydraulicFolder(e.target.value)}
                  className="input-field text-sm flex-1"
                  placeholder="reference-data\hydraulic-cycles"
                />
                <button onClick={handleBrowseHydraulicFolder} className="btn-secondary text-sm px-3 shrink-0">
                  {t('common.browse')}
                </button>
              </div>
            </div>

            <button
              onClick={handleImportHydraulic}
              disabled={hydraulicImporting || !hydraulicFolder}
              className="btn-primary text-sm w-full disabled:opacity-50"
            >
              {hydraulicImporting ? t('common.loading') : t('home.hydraulic_import_btn')}
            </button>

            {hydraulicResult?.stats && (
              <div className="text-xs p-3 rounded-xl border bg-success/10 border-success/20 text-success space-y-0.5">
                <div>✓ {t('home.hydraulic_import_done')}</div>
                <div className="text-text-secondary grid grid-cols-2 gap-x-3">
                  <span>{t('home.hydraulic_abs_models')}: {hydraulicResult.stats.absModels}</span>
                  <span>{t('home.hydraulic_cicli')}: {hydraulicResult.stats.cicli}</span>
                  <span>{t('home.hydraulic_test')}: {hydraulicResult.stats.test}</span>
                  <span>{t('home.hydraulic_ordine_test')}: {hydraulicResult.stats.ordineTest}</span>
                  <span>{t('home.hydraulic_ripetizioni')}: {hydraulicResult.stats.ripetizioni}</span>
                  <span>{t('home.hydraulic_canali')}: {hydraulicResult.stats.canali}</span>
                  <span>{t('home.hydraulic_valvole_cicli')}: {hydraulicResult.stats.valvoleCicli}</span>
                  <span>{t('home.hydraulic_valvole_test')}: {hydraulicResult.stats.valvoleTest}</span>
                  <span>{t('home.hydraulic_test_valvole')}: {hydraulicResult.stats.testValvole}</span>
                </div>
              </div>
            )}
            {hydraulicResult?.error && (
              <div className="text-xs p-3 rounded-xl border bg-danger/10 border-danger/20 text-danger">
                ✗ {hydraulicResult.error}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
