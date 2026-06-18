import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/tauri';
import { useSession, AppUser } from '@/contexts/SessionContext';
import { LogoSymbol, LogoName } from '@/components/Logo';
import { ChevronDownIcon, CircleStackIcon } from '@heroicons/react/24/outline';

type Tab = 'login' | 'register';

interface DbConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

/* ── DB Config Panel ───────────────────────────────────────── */
function DbConfigPanel({ onConnected }: { onConnected: () => void }) {
  const [cfg, setCfg] = useState<DbConfig>({
    host: '192.168.77.182', port: 5432, database: 'abs_tester', username: 'abs_user', password: '',
  });
  const [status, setStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    invoke<DbConfig>('get_db_config').then(c => setCfg(c)).catch(() => {});
  }, []);

  const testAndSave = async () => {
    setStatus('testing');
    setErrMsg('');
    try {
      await invoke('save_db_config', { config: cfg });
      await invoke<string>('test_db_connection');
      setStatus('ok');
      onConnected();
    } catch (e: unknown) {
      setStatus('error');
      setErrMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const field = (
    label: string,
    value: string | number,
    key: keyof DbConfig,
    opts?: { type?: string; placeholder?: string }
  ) => (
    <div>
      <label className="block text-[10px] font-medium text-text-tertiary mb-1">{label}</label>
      <input
        type={opts?.type ?? 'text'}
        value={value}
        onChange={e => setCfg(prev => ({ ...prev, [key]: key === 'port' ? Number(e.target.value) : e.target.value }))}
        placeholder={opts?.placeholder}
        className="w-full bg-app border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary
          placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent/50
          focus:border-accent/50 transition-all"
      />
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {field('Host', cfg.host, 'host', { placeholder: '192.168.1.100' })}
        {field('Port', cfg.port, 'port', { type: 'number', placeholder: '5432' })}
      </div>
      {field('Database', cfg.database, 'database', { placeholder: 'abs_tester' })}
      {field('Username', cfg.username, 'username', { placeholder: 'abs_user' })}
      {field('Password', cfg.password, 'password', { type: 'password', placeholder: '••••••••' })}

      <button
        onClick={testAndSave}
        disabled={status === 'testing'}
        className="w-full py-2 bg-elevated border border-border text-xs font-semibold text-text-primary
          rounded-lg hover:bg-text-tertiary/10 active:scale-[0.98] transition-all disabled:opacity-50 mt-1"
      >
        {status === 'testing' ? 'Connecting…' : 'Test & Save Connection'}
      </button>

      {status === 'ok' && (
        <p className="text-xs text-success bg-success/10 border border-success/20 rounded-lg px-3 py-2 text-center">
          ✓ Connected — you can now create an account
        </p>
      )}
      {status === 'error' && (
        <p className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2 break-words">
          {errMsg || 'Connection failed'}
        </p>
      )}
    </div>
  );
}

/* ── Login Modal ───────────────────────────────────────────── */
export default function LoginModal() {
  const { login, loginAsGuest, register, isLoggedIn } = useSession();
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('login');
  const [users, setUsers] = useState<AppUser[]>([]);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [newUserId, setNewUserId] = useState('');
  const [dbOpen, setDbOpen] = useState(false);
  const [dbReady, setDbReady] = useState(true);

  const loadUsers = () => {
    invoke<AppUser[]>('list_users')
      .then(u => { setUsers(u); setDbReady(true); })
      .catch(() => {
        // DB unreachable — open config panel automatically
        setDbReady(false);
        setDbOpen(true);
      });
  };

  useEffect(() => { loadUsers(); }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !password) { setError('Please fill in all fields'); return; }
    setLoading(true); setError('');
    try {
      await login(name.trim(), password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !password) { setError('Please fill in all fields'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    if (password.length < 4) { setError('Password must be at least 4 characters'); return; }
    setLoading(true); setError('');
    try {
      const user = await register(name.trim(), password);
      setNewUserId(user.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const switchTab = (t: Tab) => {
    setTab(t); setError(''); setName('');
    setPassword(''); setConfirmPassword(''); setNewUserId('');
  };

  if (isLoggedIn) return null;

  return (
    <motion.div
      className="fixed inset-x-0 bottom-0 top-[52px] z-50 overflow-hidden bg-app"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* inner scroll container — allows card to scroll on small viewports */}
      <div className="h-full overflow-y-auto flex items-center justify-center py-6">
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.34, 1.2, 0.64, 1] }}
        className="w-full max-w-sm mx-4"
      >
        {/* Logo */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <LogoSymbol className="h-12 w-auto text-text-primary" />
          <LogoName className="h-5 w-auto text-text-primary" />
          <p className="text-xs text-text-tertiary">ABS Hydraulic Diagnostics Platform</p>
        </div>

        {/* DB not reachable banner */}
        {!dbReady && (
          <div className="mb-3 bg-warning/10 border border-warning/25 rounded-xl px-4 py-2.5 text-xs text-warning">
            Database not reachable — configure the connection below before creating an account.
          </div>
        )}

        {/* Main card */}
        <div className="bg-card border border-border rounded-2xl shadow-xl shadow-black/30 overflow-hidden">

          {/* Auth section */}
          <div className="p-6">
            {/* Tabs */}
            <div className="flex bg-elevated rounded-xl p-1 mb-6">
              {(['login', 'register'] as Tab[]).map(tabId => (
                <button
                  key={tabId}
                  onClick={() => switchTab(tabId)}
                  disabled={!dbReady}
                  className={[
                    'flex-1 py-1.5 text-[13px] font-medium rounded-lg transition-all duration-150',
                    tab === tabId ? 'bg-card text-text-primary shadow-sm' : 'text-text-tertiary hover:text-text-secondary',
                    !dbReady ? 'opacity-40 cursor-not-allowed' : '',
                  ].join(' ')}
                >
                  {tabId === 'login' ? t('auth.sign_in_tab') : t('auth.register_tab')}
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                initial={{ opacity: 0, x: tab === 'login' ? -10 : 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: tab === 'login' ? 10 : -10 }}
                transition={{ duration: 0.15 }}
              >
                {tab === 'login' ? (
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-text-secondary mb-1.5">Name</label>
                      {users.length > 0 ? (
                        <select
                          value={name}
                          onChange={e => setName(e.target.value)}
                          className="w-full bg-elevated border border-border rounded-xl px-3 py-2.5
                            text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/50
                            focus:border-accent/50 transition-all"
                        >
                          <option value="">— Select your name —</option>
                          {users.map(u => (
                            <option key={u.id} value={u.name}>{u.name}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={name}
                          onChange={e => setName(e.target.value)}
                          placeholder="Your name"
                          className="w-full bg-elevated border border-border rounded-xl px-3 py-2.5
                            text-sm text-text-primary placeholder:text-text-tertiary
                            focus:outline-none focus:ring-1 focus:ring-accent/50 focus:border-accent/50 transition-all"
                        />
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-text-secondary mb-1.5">{t('auth.password')}</label>
                      <input
                        type="password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-elevated border border-border rounded-xl px-3 py-2.5
                          text-sm text-text-primary placeholder:text-text-tertiary
                          focus:outline-none focus:ring-1 focus:ring-accent/50 focus:border-accent/50 transition-all"
                      />
                    </div>
                    {error && (
                      <p className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">{error}</p>
                    )}
                    <button
                      type="submit"
                      disabled={loading || !dbReady}
                      className="w-full py-2.5 bg-accent text-white text-sm font-semibold rounded-xl
                        hover:bg-accent/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                    >
                      {loading ? t('auth.signing_in') : t('auth.sign_in_btn')}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleRegister} className="space-y-4">
                    {newUserId ? (
                      <div className="text-center space-y-3 py-2">
                        <div className="text-2xl">✓</div>
                        <p className="text-sm font-medium text-success">Account created!</p>
                        <div className="bg-elevated border border-border rounded-xl px-3 py-2.5 text-left">
                          <p className="text-[10px] text-text-tertiary mb-0.5">Your Operator ID</p>
                          <p className="text-xs font-mono text-text-primary break-all">{newUserId}</p>
                        </div>
                        <p className="text-xs text-text-tertiary">
                          Logged in as <span className="text-text-primary font-medium">{name}</span>.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div>
                          <label className="block text-xs font-medium text-text-secondary mb-1.5">Name</label>
                          <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="e.g. Jean-Pierre"
                            className="w-full bg-elevated border border-border rounded-xl px-3 py-2.5
                              text-sm text-text-primary placeholder:text-text-tertiary
                              focus:outline-none focus:ring-1 focus:ring-accent/50 focus:border-accent/50 transition-all"
                          />
                          <p className="text-[10px] text-text-tertiary mt-1 px-1">An ID will be generated automatically.</p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-text-secondary mb-1.5">{t('auth.password')}</label>
                          <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="••••••••"
                            className="w-full bg-elevated border border-border rounded-xl px-3 py-2.5
                              text-sm text-text-primary placeholder:text-text-tertiary
                              focus:outline-none focus:ring-1 focus:ring-accent/50 focus:border-accent/50 transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-text-secondary mb-1.5">Confirm</label>
                          <input
                            type="password"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            placeholder="••••••••"
                            className="w-full bg-elevated border border-border rounded-xl px-3 py-2.5
                              text-sm text-text-primary placeholder:text-text-tertiary
                              focus:outline-none focus:ring-1 focus:ring-accent/50 focus:border-accent/50 transition-all"
                          />
                        </div>
                        {error && (
                          <p className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">{error}</p>
                        )}
                        <button
                          type="submit"
                          disabled={loading || !dbReady}
                          className="w-full py-2.5 bg-accent text-white text-sm font-semibold rounded-xl
                            hover:bg-accent/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                        >
                          {loading ? t('auth.registering') : t('auth.register_btn')}
                        </button>
                      </>
                    )}
                  </form>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Database config — collapsible section at the bottom of the card */}
          <div className="border-t border-border">
            <button
              onClick={() => setDbOpen(v => !v)}
              className="w-full flex items-center justify-between px-5 py-3 text-xs text-text-tertiary
                hover:text-text-secondary hover:bg-elevated/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <CircleStackIcon className="w-3.5 h-3.5" />
                <span className="font-medium">{t('auth.db_config')}</span>
                {dbReady
                  ? <span className="text-[10px] text-success">● {t('common.connected')}</span>
                  : <span className="text-[10px] text-danger">● {t('common.not_connected')}</span>
                }
              </div>
              <motion.span animate={{ rotate: dbOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                <ChevronDownIcon className="w-3.5 h-3.5" />
              </motion.span>
            </button>

            <AnimatePresence initial={false}>
              {dbOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-5 pb-5">
                    <DbConfigPanel onConnected={() => { setDbReady(true); loadUsers(); }} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Guest access */}
        <div className="mt-5 text-center">
          <button
            onClick={loginAsGuest}
            className="text-xs text-text-tertiary hover:text-text-secondary transition-colors"
          >
            {t('auth.continue_guest')}
            <span className="ml-1 opacity-50">— {t('auth.guest_hint')}</span>
          </button>
        </div>
      </motion.div>
      </div>{/* end inner scroll container */}
    </motion.div>
  );
}
