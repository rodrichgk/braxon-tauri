import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession, RepairJob } from '@/contexts/SessionContext';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  BriefcaseIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  PencilSquareIcon,
  ArchiveBoxIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckSolid } from '@heroicons/react/24/solid';

type JobStatus = 'in_progress' | 'completed' | 'failed' | 'closed';
type StatusFilter = 'all' | JobStatus;

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function formatDuration(start: string, end?: string) {
  try {
    const ms = (end ? new Date(end) : new Date()).getTime() - new Date(start).getTime();
    if (ms < 0) return '—';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  } catch { return '—'; }
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    in_progress: { label: 'Active',     cls: 'bg-accent/10 text-accent border-accent/20' },
    completed:   { label: 'Completed',  cls: 'bg-success/10 text-success border-success/20' },
    failed:      { label: 'Failed',     cls: 'bg-danger/10 text-danger border-danger/20' },
    closed:      { label: 'Closed',     cls: 'bg-text-tertiary/10 text-text-tertiary border-text-tertiary/20' },
  };
  const { label, cls } = cfg[status] ?? { label: status, cls: 'bg-elevated text-text-secondary border-border' };
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md border ${cls}`}>
      {status === 'in_progress' && <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-slow" />}
      {status === 'completed' && <CheckSolid className="w-3 h-3" />}
      {status === 'failed' && <span className="text-[8px]">✕</span>}
      {status === 'closed' && <ArchiveBoxIcon className="w-3 h-3" />}
      {label}
    </span>
  );
}

interface NewJobFormProps {
  onCreated: () => void;
  onCancel: () => void;
}

function NewJobForm({ onCreated, onCancel }: NewJobFormProps) {
  const { currentUser, startJob } = useSession();
  const [jobNumber, setJobNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobNumber.trim()) { setError('Job number is required'); return; }
    setLoading(true);
    setError('');
    try {
      await startJob(jobNumber.trim());
      onCreated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-card border border-accent/30 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <BriefcaseIcon className="w-4 h-4 text-accent" />
        <span className="text-sm font-semibold text-text-primary">New Repair Job</span>
      </div>
      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1">Job / Work Order Number</label>
        <input
          autoFocus
          type="text"
          value={jobNumber}
          onChange={e => setJobNumber(e.target.value)}
          placeholder="e.g. WO-2024-0123"
          className="w-full bg-elevated border border-border rounded-lg px-3 py-2
            text-sm text-text-primary placeholder:text-text-tertiary
            focus:outline-none focus:ring-1 focus:ring-accent/50 focus:border-accent/50 transition-all"
        />
      </div>
      <div className="flex items-center gap-2 text-xs text-text-tertiary px-0.5">
        <span>Operator:</span>
        <span className="text-text-secondary font-medium">{currentUser?.name}</span>
      </div>
      {error && (
        <p className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">{error}</p>
      )}
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 py-2 bg-accent text-white text-xs font-semibold rounded-lg
            hover:bg-accent/90 transition-all disabled:opacity-50"
        >
          {loading ? 'Creating…' : 'Start Job'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-xs font-medium text-text-secondary bg-elevated border border-border
            rounded-lg hover:text-text-primary transition-all"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

interface JobRowProps {
  job: RepairJob;
  isCurrentJob: boolean;
  onRefresh: () => void;
  onSetCurrent: (job: RepairJob) => void;
  onDelete: (id: string) => void;
}

function JobRow({ job, isCurrentJob, onRefresh, onSetCurrent, onDelete }: JobRowProps) {
  const { currentJob: activeJob, setCurrentJob } = useSession();

  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(job.notes ?? '');
  const [editingNotes, setEditingNotes] = useState(false);
  const [editingRef, setEditingRef] = useState(false);
  const [refValue, setRefValue] = useState(job.absRef ?? '');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Keep local state in sync when job prop changes (after refresh)
  useEffect(() => {
    setNotes(job.notes ?? '');
    setRefValue(job.absRef ?? '');
  }, [job.notes, job.absRef]);

  const setStatus = async (status: JobStatus) => {
    try {
      await invoke('update_repair_job', {
        id: job.id,
        status,
        notes: job.notes ?? null,
        absRef: job.absRef ?? null,
        absRefId: job.absRefId ?? null,
      });
      // Clear the session's active job when it's moved out of in_progress
      if (activeJob?.id === job.id && status !== 'in_progress') {
        setCurrentJob(null);
      }
      onRefresh();
    } catch {}
  };

  const saveNotes = async () => {
    setSaving(true);
    try {
      await invoke('update_repair_job', {
        id: job.id,
        status: job.status,
        notes: notes || null,
        absRef: job.absRef ?? null,
        absRefId: job.absRefId ?? null,
      });
      setEditingNotes(false);
      onRefresh();
    } finally {
      setSaving(false);
    }
  };

  const saveRef = async () => {
    setSaving(true);
    try {
      await invoke('update_repair_job', {
        id: job.id,
        status: job.status,
        notes: job.notes ?? null,
        absRef: refValue.trim() || null,
        absRefId: job.absRefId ?? null,
      });
      setEditingRef(false);
      onRefresh();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await invoke('delete_repair_job', { id: job.id });
      if (activeJob?.id === job.id) setCurrentJob(null);
      onDelete(job.id);
    } finally {
      setDeleting(false);
    }
  };

  // Only show ACTIVE badge if this is the current session job AND it's still in_progress
  const showActiveBadge = isCurrentJob && job.status === 'in_progress';

  return (
    <motion.div
      layout
      className={[
        'bg-card border rounded-xl overflow-hidden transition-colors duration-150',
        showActiveBadge ? 'border-accent/40 shadow-sm shadow-accent/10' : 'border-border',
      ].join(' ')}
    >
      {/* Row header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-elevated/50 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-text-primary">{job.jobNumber}</span>
            {showActiveBadge && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-accent/15 text-accent border border-accent/25">
                ACTIVE
              </span>
            )}
            <StatusBadge status={job.status} />
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <span className="text-xs text-text-tertiary">{job.userName}</span>
            {job.absRef && (
              <span className="text-xs text-text-secondary truncate max-w-[200px]">{job.absRef}</span>
            )}
          </div>
        </div>

        <div className="shrink-0 text-right hidden sm:block">
          <p className="text-xs text-text-secondary">{formatDate(job.startedAt)}</p>
          <p className="text-[10px] text-text-tertiary mt-0.5">
            <ClockIcon className="w-3 h-3 inline mr-0.5" />
            {formatDuration(job.startedAt, job.completedAt)}
          </p>
        </div>

        <span className="text-text-tertiary shrink-0">
          {expanded ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
        </span>
      </div>

      {/* Expanded details */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1 border-t border-border space-y-3">
              {/* Details grid */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs mt-1">
                <div>
                  <span className="text-text-tertiary">Operator</span>
                  <p className="text-text-secondary font-medium mt-0.5">{job.userName}</p>
                </div>
                <div>
                  <span className="text-text-tertiary">Started</span>
                  <p className="text-text-secondary mt-0.5">{formatDate(job.startedAt)}</p>
                </div>
                {job.completedAt && (
                  <div>
                    <span className="text-text-tertiary">Closed</span>
                    <p className="text-text-secondary mt-0.5">{formatDate(job.completedAt)}</p>
                  </div>
                )}
                <div>
                  <span className="text-text-tertiary">Duration</span>
                  <p className="text-text-secondary mt-0.5">{formatDuration(job.startedAt, job.completedAt)}</p>
                </div>
              </div>

              {/* ABS Reference — editable */}
              <div className="text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-text-tertiary font-medium">ABS Reference</span>
                  {!editingRef && (
                    <button
                      onClick={e => { e.stopPropagation(); setEditingRef(true); }}
                      className="text-[10px] text-accent hover:underline flex items-center gap-1"
                    >
                      <PencilSquareIcon className="w-3 h-3" />
                      {job.absRef ? 'Edit' : 'Set reference'}
                    </button>
                  )}
                </div>
                {editingRef ? (
                  <div className="flex gap-2 mt-1">
                    <input
                      autoFocus
                      type="text"
                      value={refValue}
                      onChange={e => setRefValue(e.target.value)}
                      placeholder="e.g. Bosch 8.0 VW Golf IV"
                      className="flex-1 bg-elevated border border-border rounded-lg px-2.5 py-1.5 text-xs
                        text-text-primary placeholder:text-text-tertiary
                        focus:outline-none focus:ring-1 focus:ring-accent/50 focus:border-accent/50"
                    />
                    <button
                      onClick={saveRef}
                      disabled={saving}
                      className="text-xs px-3 py-1.5 bg-accent text-white font-medium rounded-lg hover:bg-accent/90 disabled:opacity-50 transition-all"
                    >
                      {saving ? '…' : 'Save'}
                    </button>
                    <button
                      onClick={() => { setEditingRef(false); setRefValue(job.absRef ?? ''); }}
                      className="text-xs px-2.5 py-1.5 bg-elevated border border-border text-text-secondary rounded-lg hover:text-text-primary transition-all"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <p className="text-text-secondary">
                    {job.absRef || <span className="text-text-tertiary italic">Not set — link from Signal page or set manually</span>}
                  </p>
                )}
              </div>

              {/* Notes — editable */}
              <div className="text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-text-tertiary font-medium">Notes</span>
                  {!editingNotes && (
                    <button
                      onClick={e => { e.stopPropagation(); setEditingNotes(true); }}
                      className="text-[10px] text-accent hover:underline flex items-center gap-1"
                    >
                      <PencilSquareIcon className="w-3 h-3" /> Edit
                    </button>
                  )}
                </div>
                {editingNotes ? (
                  <div className="space-y-2">
                    <textarea
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      rows={3}
                      placeholder="Add notes about this repair job…"
                      className="w-full bg-elevated border border-border rounded-lg px-3 py-2
                        text-xs text-text-primary placeholder:text-text-tertiary resize-none
                        focus:outline-none focus:ring-1 focus:ring-accent/50 focus:border-accent/50"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={saveNotes}
                        disabled={saving}
                        className="text-xs px-3 py-1.5 bg-accent text-white font-medium rounded-lg hover:bg-accent/90 transition-all disabled:opacity-50"
                      >
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        onClick={() => { setEditingNotes(false); setNotes(job.notes ?? ''); }}
                        className="text-xs px-3 py-1.5 bg-elevated border border-border text-text-secondary rounded-lg hover:text-text-primary transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-text-secondary min-h-[20px]">
                    {job.notes || <span className="text-text-tertiary italic">No notes</span>}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1 flex-wrap border-t border-border items-center">
                {job.status === 'in_progress' && (
                  <>
                    <button
                      onClick={() => setStatus('completed')}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-success/10 text-success
                        border border-success/20 rounded-lg hover:bg-success/20 transition-all font-medium"
                    >
                      <CheckCircleIcon className="w-3.5 h-3.5" /> Completed
                    </button>
                    <button
                      onClick={() => setStatus('failed')}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-danger/10 text-danger
                        border border-danger/20 rounded-lg hover:bg-danger/20 transition-all font-medium"
                    >
                      <XCircleIcon className="w-3.5 h-3.5" /> Failed
                    </button>
                    <button
                      onClick={() => setStatus('closed')}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-elevated text-text-secondary
                        border border-border rounded-lg hover:text-text-primary hover:bg-text-tertiary/10 transition-all font-medium"
                    >
                      <ArchiveBoxIcon className="w-3.5 h-3.5" /> Close
                    </button>
                    {!isCurrentJob && (
                      <button
                        onClick={() => onSetCurrent(job)}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-accent/10 text-accent
                          border border-accent/20 rounded-lg hover:bg-accent/20 transition-all font-medium"
                      >
                        Set as Active
                      </button>
                    )}
                  </>
                )}
                {job.status !== 'in_progress' && (
                  <button
                    onClick={() => setStatus('in_progress')}
                    className="text-xs px-3 py-1.5 bg-elevated border border-border text-text-secondary
                      rounded-lg hover:text-text-primary transition-all"
                  >
                    Reopen
                  </button>
                )}

                {/* Delete — inline confirm */}
                <div className="ml-auto flex items-center gap-1.5">
                  {confirmDelete ? (
                    <>
                      <span className="text-[10px] text-danger font-medium">Delete this job?</span>
                      <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className="text-xs px-2.5 py-1.5 bg-danger/10 text-danger border border-danger/20
                          rounded-lg hover:bg-danger/20 transition-all font-medium disabled:opacity-50"
                      >
                        {deleting ? '…' : 'Yes, delete'}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(false)}
                        className="text-xs px-2.5 py-1.5 bg-elevated border border-border text-text-secondary
                          rounded-lg hover:text-text-primary transition-all"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(true)}
                      className="flex items-center gap-1 text-xs px-2.5 py-1.5 text-text-tertiary
                        hover:text-danger hover:bg-danger/10 border border-transparent hover:border-danger/20
                        rounded-lg transition-all"
                    >
                      <TrashIcon className="w-3.5 h-3.5" /> Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function JobsPage() {
  const { currentUser, currentJob, isGuest, setCurrentJob } = useSession();

  if (isGuest) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6">
        <BriefcaseIcon className="w-12 h-12 text-text-tertiary opacity-40" />
        <p className="text-sm font-medium text-text-primary">Sign in to manage repair jobs</p>
        <p className="text-xs text-text-tertiary max-w-xs">
          Guest mode gives you read-only access to the diagnostics UI. Create an account or log in to track repair jobs and save results.
        </p>
      </div>
    );
  }
  const [jobs, setJobs] = useState<RepairJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [error, setError] = useState('');

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await invoke<RepairJob[]>('get_repair_jobs');
      setJobs(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  const filtered = jobs.filter(j => {
    if (statusFilter !== 'all' && j.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        j.jobNumber.toLowerCase().includes(q) ||
        j.userName.toLowerCase().includes(q) ||
        (j.absRef ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const stats = {
    total:     jobs.length,
    active:    jobs.filter(j => j.status === 'in_progress').length,
    completed: jobs.filter(j => j.status === 'completed').length,
    failed:    jobs.filter(j => j.status === 'failed').length,
  };

  return (
    <div className="p-6 space-y-5 max-w-3xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Repair Jobs</h1>
          <p className="text-xs text-text-tertiary mt-0.5">
            Logged in as <span className="text-text-secondary font-medium">{currentUser?.name}</span>
          </p>
        </div>
        {!showNewForm && (
          <button
            onClick={() => setShowNewForm(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-accent text-white text-xs font-semibold
              rounded-lg hover:bg-accent/90 active:scale-95 transition-all"
          >
            <PlusIcon className="w-4 h-4" /> New Job
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total',     value: stats.total,     cls: 'text-text-primary' },
          { label: 'Active',    value: stats.active,    cls: 'text-accent' },
          { label: 'Completed', value: stats.completed, cls: 'text-success' },
          { label: 'Failed',    value: stats.failed,    cls: 'text-danger' },
        ].map(({ label, value, cls }) => (
          <div key={label} className="bg-card border border-border rounded-xl px-3 py-2.5 text-center">
            <p className={`text-xl font-bold ${cls}`}>{value}</p>
            <p className="text-[10px] text-text-tertiary mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Current job indicator */}
      {currentJob && (
        <div className="flex items-center gap-3 bg-accent/5 border border-accent/20 rounded-xl px-4 py-3">
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse-slow shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-text-primary">
              Active: <span className="text-accent">{currentJob.jobNumber}</span>
            </p>
            {currentJob.absRef && (
              <p className="text-[10px] text-text-tertiary mt-0.5 truncate">{currentJob.absRef}</p>
            )}
          </div>
        </div>
      )}

      {/* New job form */}
      <AnimatePresence>
        {showNewForm && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
          >
            <NewJobForm
              onCreated={() => { setShowNewForm(false); loadJobs(); }}
              onCancel={() => setShowNewForm(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filters */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <MagnifyingGlassIcon className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by job number, operator, ABS ref…"
            className="w-full bg-card border border-border rounded-lg pl-8 pr-3 py-2
              text-xs text-text-primary placeholder:text-text-tertiary
              focus:outline-none focus:ring-1 focus:ring-accent/40 focus:border-accent/40 transition-all"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as StatusFilter)}
          className="bg-card border border-border rounded-lg px-3 py-2 text-xs text-text-primary
            focus:outline-none focus:ring-1 focus:ring-accent/40 focus:border-accent/40 transition-all"
        >
          <option value="all">All Status</option>
          <option value="in_progress">Active</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-danger/10 border border-danger/20 rounded-xl px-4 py-3">
          <p className="text-xs text-danger">{error}</p>
        </div>
      )}

      {/* Job list */}
      {loading ? (
        <div className="text-center py-12 text-text-tertiary text-sm">Loading jobs…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <BriefcaseIcon className="w-10 h-10 text-text-tertiary mx-auto mb-3 opacity-40" />
          <p className="text-sm text-text-tertiary">
            {jobs.length === 0 ? 'No jobs yet — start one above.' : 'No jobs match the current filters.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(job => (
            <JobRow
              key={job.id}
              job={job}
              isCurrentJob={currentJob?.id === job.id}
              onRefresh={loadJobs}
              onSetCurrent={setCurrentJob}
              onDelete={id => setJobs(prev => prev.filter(j => j.id !== id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
