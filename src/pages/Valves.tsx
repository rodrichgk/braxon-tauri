import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { ABSTester } from '@/components/ABSTester';
import { ABSModule, ABSProfile } from '@/types/abs';
import { PlusIcon } from '@heroicons/react/24/outline';
import { motion, AnimatePresence } from 'framer-motion';

export default function ValvesPage() {
  const [modules, setModules] = useState<ABSModule[]>([]);
  const [selectedModule, setSelectedModule] = useState<ABSModule | null>(null);
  const [profile, setProfile] = useState<ABSProfile | null>(null);
  const [isAddingModule, setIsAddingModule] = useState(false);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [dbError, setDbError] = useState<string | null>(null);
  const [newModule, setNewModule] = useState({ name: '', valveCount: 8, description: '' });

  useEffect(() => {
    fetchModules();
  }, []);

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
      if (data.length > 0 && !selectedModule) {
        handleModuleSelect(data[0]);
      }
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
        id: i + 1,
        name: `Valve ${i + 1}`,
        health: 100,
        status: 'inactive' as const,
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Valve Testing</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Hydraulic modulator solenoid valves</p>
        </div>
        <div className="flex items-center gap-3">
          {isAdminMode && (
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200">
              ⚡ Admin Mode
            </span>
          )}
          <button
            onClick={() => setIsAddingModule(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm
              bg-gradient-to-br from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700
              text-white shadow-lg shadow-primary-500/20 active:scale-95 transition-all"
          >
            <PlusIcon className="h-4 w-4" />
            Add Module
          </button>
        </div>
      </div>

      {message.text && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${
          message.type === 'success' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
          : 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
        }`}>
          {message.text}
        </div>
      )}

      {dbError && (
        <div className="mb-4 p-4 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 text-sm">
          <strong>Database error:</strong> {dbError}
          <br />
          <span className="text-xs">Go to Home tab to configure your database connection.</span>
          <button onClick={fetchModules} className="ml-4 underline text-xs">Retry</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Module List */}
        <div className="glass-effect rounded-xl p-5 h-fit lg:sticky lg:top-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-3">ABS Modules</h2>
          {modules.length === 0 && !dbError && (
            <p className="text-sm text-slate-500">No modules found. Add one or check DB connection.</p>
          )}
          <div className="space-y-2">
            {modules.map(module => (
              <button
                key={module.id}
                onClick={() => handleModuleSelect(module)}
                className={[
                  'w-full px-3 py-2.5 rounded-lg text-left transition-all',
                  selectedModule?.id === module.id
                    ? 'bg-blue-50 dark:bg-blue-900/30 ring-2 ring-blue-500'
                    : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700'
                ].join(' ')}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm text-slate-900 dark:text-white">{module.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{module.valveCount} valves</p>
                  </div>
                  {isAdminMode && (
                    <button
                      onClick={e => { e.stopPropagation(); handleDeleteModule(module.id); }}
                      className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </button>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ABSTester */}
        <div className="lg:col-span-3">
          {profile ? (
            <ABSTester profile={profile} />
          ) : (
            <div className="glass-effect rounded-xl p-12 text-center">
              <p className="text-slate-500 dark:text-slate-400">
                {dbError ? 'Configure database connection in Home tab.' : 'Select a module to begin valve testing.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Add Module Modal */}
      <AnimatePresence>
        {isAddingModule && (
          <>
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={() => setIsAddingModule(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 flex items-center justify-center z-50"
            >
              <div className="glass-effect rounded-xl p-6 max-w-md w-full mx-4">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Add ABS Module</h2>
                <form onSubmit={handleAddModule} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Module Name</label>
                    <input
                      type="text"
                      value={newModule.name}
                      onChange={e => setNewModule(p => ({ ...p, name: e.target.value }))}
                      className="input-field w-full"
                      placeholder="e.g., MK60, Bosch 8.0"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Valve Count</label>
                    <select
                      value={newModule.valveCount}
                      onChange={e => setNewModule(p => ({ ...p, valveCount: parseInt(e.target.value) }))}
                      className="input-field w-full"
                    >
                      <option value={8}>8 Valves</option>
                      <option value={12}>12 Valves</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
                    <textarea
                      value={newModule.description}
                      onChange={e => setNewModule(p => ({ ...p, description: e.target.value }))}
                      className="input-field w-full"
                      rows={2}
                      required
                    />
                  </div>
                  <div className="flex gap-3 justify-end">
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
