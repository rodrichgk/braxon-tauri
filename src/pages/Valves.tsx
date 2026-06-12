import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { motion, AnimatePresence } from 'framer-motion';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { ABSTester } from '@/components/ABSTester';
import { ABSModule, ABSProfile } from '@/types/abs';

const moduleItemVariants = {
  hidden:  { opacity: 0, x: -8 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { duration: 0.18, ease: 'easeOut', delay: i * 0.05 },
  }),
  exit: { opacity: 0, x: -8, transition: { duration: 0.12 } },
};

export default function ValvesPage() {
  const [modules, setModules]           = useState<ABSModule[]>([]);
  const [selectedModule, setSelectedModule] = useState<ABSModule | null>(null);
  const [profile, setProfile]           = useState<ABSProfile | null>(null);
  const [isAddingModule, setIsAddingModule] = useState(false);
  const [isAdminMode, setIsAdminMode]   = useState(false);
  const [message, setMessage]           = useState({ text: '', type: '' });
  const [dbError, setDbError]           = useState<string | null>(null);
  const [newModule, setNewModule]       = useState({ name: '', valveCount: 8, description: '' });

  useEffect(() => { fetchModules(); }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        setIsAdminMode(prev => {
          const next = !prev;
          setMessage({ text: next ? 'Admin mode activated' : 'Admin mode deactivated', type: next ? 'warning' : 'success' });
          setTimeout(() => setMessage({ text: '', type: '' }), 3000);
          return next;
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const fetchModules = async () => {
    try {
      setDbError(null);
      const data = await invoke<ABSModule[]>('get_modules');
      setModules(data);
      if (data.length > 0 && !selectedModule) handleModuleSelect(data[0]);
    } catch (e: any) {
      setDbError(String(e));
    }
  };

  const handleModuleSelect = (module: ABSModule) => {
    setSelectedModule(module);
    const count = typeof module.valveCount === 'number'
      ? module.valveCount
      : parseInt(String(module.valveCount), 10);
    setProfile({
      module,
      valves: Array.from({ length: count }, (_, i) => ({
        id: i + 1, name: `Valve ${i + 1}`, health: 100, status: 'inactive' as const,
      })),
    });
  };

  const handleAddModule = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const module = await invoke<ABSModule>('create_module', {
        name: newModule.name,
        valveCount: newModule.valveCount,
        description: newModule.description,
      });
      setModules(prev => [...prev, module]);
      setIsAddingModule(false);
      setNewModule({ name: '', valveCount: 8, description: '' });
      handleModuleSelect(module);
    } catch (e: any) {
      console.error('Error adding module:', e);
    }
  };

  const handleDeleteModule = async (id: string) => {
    if (!confirm('Delete this module?')) return;
    try {
      await invoke('delete_module', { id });
      const remaining = modules.filter(m => m.id !== id);
      setModules(remaining);
      if (selectedModule?.id === id) {
        if (remaining.length > 0) handleModuleSelect(remaining[0]);
        else { setSelectedModule(null); setProfile(null); }
      }
    } catch (e: any) {
      console.error('Error deleting module:', e);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">

      {/* Header */}
      <motion.div
        className="flex items-center justify-between mb-6"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <div>
          <h1 className="text-xl font-semibold text-text-primary tracking-tight">Valve Testing</h1>
          <p className="text-sm text-text-secondary mt-0.5">Hydraulic modulator solenoid valves</p>
        </div>
        <div className="flex items-center gap-3">
          <AnimatePresence>
            {isAdminMode && (
              <motion.span
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                className="badge badge-yellow"
              >
                ⚡ Admin
              </motion.span>
            )}
          </AnimatePresence>
          <button
            onClick={() => setIsAddingModule(true)}
            className="btn-primary"
          >
            <PlusIcon className="h-4 w-4" />
            Add Module
          </button>
        </div>
      </motion.div>

      {/* Toast messages */}
      <AnimatePresence>
        {message.text && (
          <motion.div
            key="msg"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className={`mb-4 p-3 rounded-xl border text-sm ${
              message.type === 'success'
                ? 'bg-success/10 border-success/20 text-success'
                : 'bg-warning/10 border-warning/20 text-warning'
            }`}
          >
            {message.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* DB error */}
      <AnimatePresence>
        {dbError && (
          <motion.div
            key="dberr"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mb-4 p-4 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm"
          >
            <strong>Database error:</strong> {dbError}
            <br />
            <span className="text-xs opacity-80">Go to Dashboard to configure your database connection.</span>
            <button onClick={fetchModules} className="ml-4 underline text-xs opacity-80 hover:opacity-100">Retry</button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">

        {/* Module list */}
        <motion.div
          className="card h-fit lg:sticky lg:top-4"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.22, delay: 0.05 }}
        >
          <h2 className="card-header">ABS Modules</h2>

          {modules.length === 0 && !dbError && (
            <p className="text-sm text-text-tertiary text-center py-4">
              No modules found.<br />
              <span className="text-xs">Add one or check DB connection.</span>
            </p>
          )}

          <div className="space-y-1.5">
            <AnimatePresence>
              {modules.map((module, i) => (
                <motion.button
                  key={module.id}
                  custom={i}
                  variants={moduleItemVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  layout
                  onClick={() => handleModuleSelect(module)}
                  className={[
                    'w-full px-3 py-2.5 rounded-lg text-left transition-all duration-150',
                    selectedModule?.id === module.id
                      ? 'bg-accent/10 ring-1 ring-accent/30'
                      : 'bg-elevated hover:bg-text-tertiary/10',
                  ].join(' ')}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={[
                        'font-medium text-sm',
                        selectedModule?.id === module.id ? 'text-accent' : 'text-text-primary',
                      ].join(' ')}>
                        {module.name}
                      </p>
                      <p className="text-xs text-text-tertiary mt-0.5">{module.valveCount} valves</p>
                    </div>
                    {isAdminMode && (
                      <button
                        onClick={e => { e.stopPropagation(); handleDeleteModule(module.id); }}
                        className="p-1 text-text-tertiary hover:text-danger transition-colors rounded"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* ABSTester */}
        <motion.div
          className="lg:col-span-3"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, delay: 0.1 }}
        >
          <AnimatePresence mode="wait">
            {profile ? (
              <motion.div
                key={profile.module.id}
                initial={{ opacity: 0, scale: 0.99 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.99 }}
                transition={{ duration: 0.18 }}
              >
                <ABSTester profile={profile} />
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="card flex items-center justify-center min-h-[200px]"
              >
                <p className="text-text-tertiary text-sm">
                  {dbError ? 'Configure database connection in Dashboard.' : 'Select a module to begin valve testing.'}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Add Module Modal */}
      <AnimatePresence>
        {isAddingModule && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-40"
              onClick={() => setIsAddingModule(false)}
            />
            <motion.div
              key="modal"
              initial={{ opacity: 0, scale: 0.93, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.93, y: 8 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none"
            >
              <div className="card max-w-md w-full mx-4 pointer-events-auto shadow-2xl">
                <h2 className="card-header text-base">Add ABS Module</h2>
                <form onSubmit={handleAddModule} className="space-y-4">
                  <div>
                    <label className="input-label">Module Name</label>
                    <input
                      type="text"
                      value={newModule.name}
                      onChange={e => setNewModule(p => ({ ...p, name: e.target.value }))}
                      className="input-field"
                      placeholder="e.g., MK60, Bosch 8.0"
                      required
                    />
                  </div>
                  <div>
                    <label className="input-label">Valve Count</label>
                    <select
                      value={newModule.valveCount}
                      onChange={e => setNewModule(p => ({ ...p, valveCount: parseInt(e.target.value) }))}
                      className="input-field"
                    >
                      <option value={8}>8 Valves</option>
                      <option value={12}>12 Valves</option>
                    </select>
                  </div>
                  <div>
                    <label className="input-label">Description</label>
                    <textarea
                      value={newModule.description}
                      onChange={e => setNewModule(p => ({ ...p, description: e.target.value }))}
                      className="input-field"
                      rows={2}
                      required
                    />
                  </div>
                  <div className="flex gap-3 justify-end pt-1">
                    <button type="button" onClick={() => setIsAddingModule(false)} className="btn-secondary">Cancel</button>
                    <button type="submit" className="btn-primary">Add Module</button>
                  </div>
                </form>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
