import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/tauri';
import { useSession } from '@/contexts/SessionContext';
import {
  MagnifyingGlassIcon, PlusIcon, XMarkIcon, TrashIcon, PencilIcon,
  ChevronDownIcon, ChevronUpIcon, LinkIcon, ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

// Repair Knowledge Base — requested directly: "i want a repair section,
// that's gonna be better to search in that just comments, where i give
// the fault code or description but codify so it's easier to search
// from," with a worked example (ECU ref, fault code 5DF5, a cause that's
// usually-but-not-always right, and the fix that actually worked). Lives
// in BRAXON's own Postgres (src-tauri/src/reman.rs's "RemanKnowledgeEntry"
// doc comment), not 4D — proprietary tribal knowledge REMAN's schema has
// no home for. Tags are freeform with autocomplete rather than a fixed
// taxonomy — confirmed directly ("yes exactly") after presenting that as
// the main tradeoff: nothing to define/maintain up front, tighten later
// only if real usage shows it's needed.

export interface KnowledgeEntry {
  id: number;
  ecuRef?: string;
  ecuBrand?: string;
  ecuFamily?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: string;
  faultCodes: string[];
  causeTags: string[];
  fixTags: string[];
  linkedJobIds: string[];
  notes?: string;
  createdByTechId?: string;
  createdByTechName?: string;
  createdAt: string;
  updatedAt: string;
  linkedToThisJob?: boolean;
  faultCodeDetected?: boolean;
}

// Minimal shape pulled from InterventionSummary (Reman.tsx) — just enough
// to show a picked job's context in the link-search dropdown.
interface JobSearchResult {
  id: string;
  reference?: string;
  clientName?: string;
  vehiclePlate?: string;
  vehicleModel?: string;
  family?: string;
}

interface KnowledgeTagSuggestions {
  ecuFamilies: string[];
  ecuBrands: string[];
  causeTags: string[];
  fixTags: string[];
}

const EMPTY_SUGGESTIONS: KnowledgeTagSuggestions = { ecuFamilies: [], ecuBrands: [], causeTags: [], fixTags: [] };

interface EntryFormState {
  ecuRef: string;
  ecuBrand: string;
  ecuFamily: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: string;
  faultCodes: string[];
  causeTags: string[];
  fixTags: string[];
  notes: string;
}

const EMPTY_FORM: EntryFormState = {
  ecuRef: '', ecuBrand: '', ecuFamily: '', vehicleMake: '', vehicleModel: '', vehicleYear: '',
  faultCodes: [], causeTags: [], fixTags: [], notes: '',
};

function entryToForm(e: KnowledgeEntry): EntryFormState {
  return {
    ecuRef: e.ecuRef || '', ecuBrand: e.ecuBrand || '', ecuFamily: e.ecuFamily || '',
    vehicleMake: e.vehicleMake || '', vehicleModel: e.vehicleModel || '', vehicleYear: e.vehicleYear || '',
    faultCodes: e.faultCodes, causeTags: e.causeTags, fixTags: e.fixTags, notes: e.notes || '',
  };
}

/* ── Small building blocks ─────────────────────────────────── */

function TagListInput({
  label, values, onChange, suggestions, placeholder, listId,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  listId: string;
}) {
  const [draft, setDraft] = useState('');
  const commit = () => {
    const v = draft.trim();
    if (v && !values.some(existing => existing.toLowerCase() === v.toLowerCase())) {
      onChange([...values, v]);
    }
    setDraft('');
  };
  return (
    <div>
      <span className="text-text-tertiary text-[11px]">{label}</span>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {values.map(v => (
            <span key={v} className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md bg-accent/10 text-accent border border-accent/20">
              {v}
              <button type="button" onClick={() => onChange(values.filter(x => x !== v))} className="hover:text-danger transition-colors">
                <XMarkIcon className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        list={listId}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); } }}
        onBlur={commit}
        placeholder={placeholder}
        className="w-full mt-1 bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent/40 focus:border-accent/40 transition-all"
      />
      {suggestions && suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.map(s => <option key={s} value={s} />)}
        </datalist>
      )}
    </div>
  );
}

function TextField({
  label, value, onChange, suggestions, listId, placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suggestions?: string[];
  listId?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <span className="text-text-tertiary text-[11px]">{label}</span>
      <input
        list={listId}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full mt-1 bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent/40 focus:border-accent/40 transition-all"
      />
      {suggestions && suggestions.length > 0 && listId && (
        <datalist id={listId}>
          {suggestions.map(s => <option key={s} value={s} />)}
        </datalist>
      )}
    </div>
  );
}

/* ── Entry create/edit form ────────────────────────────────── */

function EntryForm({
  initial, suggestions, linkedJobHint, onCancel, onSave, saving, error,
}: {
  initial: EntryFormState;
  suggestions: KnowledgeTagSuggestions;
  linkedJobHint?: string;
  onCancel: () => void;
  onSave: (form: EntryFormState) => void;
  saving: boolean;
  error: string;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<EntryFormState>(initial);
  const set = <K extends keyof EntryFormState>(key: K, value: EntryFormState[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  return (
    <div className="rounded-xl border border-accent/30 bg-accent/5 p-3 space-y-3">
      {linkedJobHint && (
        <p className="flex items-center gap-1.5 text-[11px] text-accent font-medium">
          <LinkIcon className="w-3.5 h-3.5" />
          {linkedJobHint}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2.5">
        <TextField label={t('reman.knowledge_field_ecu_ref')} value={form.ecuRef} onChange={v => set('ecuRef', v)} placeholder="10.0925-0851.3" />
        <TextField label={t('reman.knowledge_field_ecu_brand')} value={form.ecuBrand} onChange={v => set('ecuBrand', v)} suggestions={suggestions.ecuBrands} listId="kb-ecu-brands" placeholder="ATE" />
        <TextField label={t('reman.knowledge_field_ecu_family')} value={form.ecuFamily} onChange={v => set('ecuFamily', v)} suggestions={suggestions.ecuFamilies} listId="kb-ecu-families" placeholder="ATE CONTROLLER" />
        <TextField label={t('reman.knowledge_field_vehicle_make')} value={form.vehicleMake} onChange={v => set('vehicleMake', v)} placeholder="Land Rover" />
        <TextField label={t('reman.knowledge_field_vehicle_model')} value={form.vehicleModel} onChange={v => set('vehicleModel', v)} placeholder="Freelander I" />
        <TextField label={t('reman.knowledge_field_vehicle_year')} value={form.vehicleYear} onChange={v => set('vehicleYear', v)} placeholder="08/2002" />
      </div>
      <TagListInput
        label={t('reman.knowledge_field_fault_codes')}
        values={form.faultCodes}
        onChange={v => set('faultCodes', v)}
        placeholder={t('reman.knowledge_fault_codes_ph')}
        listId="kb-fault-codes"
      />
      <TagListInput
        label={t('reman.knowledge_field_cause_tags')}
        values={form.causeTags}
        onChange={v => set('causeTags', v)}
        suggestions={suggestions.causeTags}
        placeholder={t('reman.knowledge_cause_tags_ph')}
        listId="kb-cause-tags"
      />
      <TagListInput
        label={t('reman.knowledge_field_fix_tags')}
        values={form.fixTags}
        onChange={v => set('fixTags', v)}
        suggestions={suggestions.fixTags}
        placeholder={t('reman.knowledge_fix_tags_ph')}
        listId="kb-fix-tags"
      />
      <div>
        <span className="text-text-tertiary text-[11px]">{t('reman.knowledge_field_notes')}</span>
        <textarea
          value={form.notes}
          onChange={e => set('notes', e.target.value)}
          rows={3}
          placeholder={t('reman.knowledge_notes_ph')}
          className="w-full mt-1 bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent/40 focus:border-accent/40 transition-all resize-none"
        />
      </div>
      {error && <p className="text-[11px] text-danger bg-danger/10 border border-danger/20 rounded-lg px-2.5 py-1.5">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => onSave(form)}
          className="text-[11px] font-semibold px-3 py-1.5 rounded-md bg-accent text-white hover:bg-accent/90 transition-all disabled:opacity-50"
        >
          {saving ? t('common.saving') : t('common.save')}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={onCancel}
          className="text-[11px] font-medium px-3 py-1.5 rounded-md bg-card border border-border text-text-secondary hover:text-text-primary transition-all disabled:opacity-50"
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
}

/* ── Job search picker, for linking an existing entry to a job ─ */

// Requested directly: "let me link jobs existing repair knowledge,
// because it's linked when i create it from the job itself but i can't
// link one i created in the repair knowledge section to a job in suivi
// d'intervention" — the original "type a job id" input required knowing
// the internal ligcde_id, which never appears anywhere in the UI (jobs
// are shown/searched by reference, client, or vehicle). This searches the
// same way the Interventions tab does, across both the Open queue ("Suivi
// d'interventions") and Closed, merged and de-duplicated — a fix is
// usually logged after a job closes, but might also be linked while it's
// still on the bench.
function JobLinkPicker({ onPick, disabled }: { onPick: (job: JobSearchResult) => void; disabled?: boolean }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<JobSearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [openList, setOpenList] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const [openJobs, closedJobs] = await Promise.all([
          invoke<JobSearchResult[]>('reman_search_interventions', {
            query: q, queue: 'open', techId: null, family: null, faultType: null, dateFrom: null, dateTo: null,
          }),
          invoke<JobSearchResult[]>('reman_search_interventions', {
            query: q, queue: 'closed', techId: null, family: null, faultType: null, dateFrom: null, dateTo: null,
          }),
        ]);
        if (cancelled) return;
        const seen = new Set<string>();
        const merged = [...openJobs, ...closedJobs].filter(j => {
          if (seen.has(j.id)) return false;
          seen.add(j.id);
          return true;
        }).slice(0, 12);
        setResults(merged);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);

  return (
    <div className="relative">
      <input
        value={query}
        onChange={e => { setQuery(e.target.value); setOpenList(true); }}
        onFocus={() => setOpenList(true)}
        onBlur={() => setTimeout(() => setOpenList(false), 150)}
        disabled={disabled}
        placeholder={t('reman.knowledge_link_job_ph')}
        className="w-full bg-elevated border border-border rounded-md px-2 py-1 text-[11px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent/40 disabled:opacity-50"
      />
      {openList && query.trim().length >= 2 && (
        <div className="absolute z-10 mt-1 w-full max-h-52 overflow-y-auto bg-card border border-border rounded-lg shadow-lg">
          {loading && <p className="text-[11px] text-text-tertiary px-2 py-1.5">{t('reman.searching')}</p>}
          {!loading && results && results.length === 0 && (
            <p className="text-[11px] text-text-tertiary px-2 py-1.5">{t('reman.no_results')}</p>
          )}
          {!loading && results && results.map(job => (
            <button
              key={job.id}
              type="button"
              onMouseDown={e => { e.preventDefault(); onPick(job); setQuery(''); setResults(null); setOpenList(false); }}
              className="w-full text-left px-2 py-1.5 hover:bg-elevated transition-colors border-b border-border last:border-b-0"
            >
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-semibold text-text-primary">{job.reference || `#${job.id}`}</span>
                {job.family && <span className="text-[10px] text-text-tertiary">{job.family}</span>}
              </div>
              <p className="text-[10px] text-text-tertiary truncate">
                {[job.clientName, job.vehiclePlate, job.vehicleModel].filter(Boolean).join(' · ')}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── One entry card ────────────────────────────────────────── */

function EntryCard({
  entry, suggestions, onUpdated, onDeleted,
}: {
  entry: KnowledgeEntry;
  suggestions: KnowledgeTagSuggestions;
  onUpdated: (e: KnowledgeEntry) => void;
  onDeleted: (id: number) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  const title = [entry.ecuFamily || entry.ecuRef, entry.ecuBrand].filter(Boolean).join(' · ') || t('reman.knowledge_untitled');

  const save = async (form: EntryFormState) => {
    setSaving(true);
    setError('');
    try {
      const updated = await invoke<KnowledgeEntry>('reman_update_knowledge_entry', {
        id: entry.id,
        ecuRef: form.ecuRef, ecuBrand: form.ecuBrand, ecuFamily: form.ecuFamily,
        vehicleMake: form.vehicleMake, vehicleModel: form.vehicleModel, vehicleYear: form.vehicleYear,
        faultCodes: form.faultCodes, causeTags: form.causeTags, fixTags: form.fixTags, notes: form.notes,
      });
      onUpdated(updated);
      setEditing(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await invoke('reman_delete_knowledge_entry', { id: entry.id });
      onDeleted(entry.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setDeleting(false);
    }
  };

  const unlinkJob = async (jobId: string) => {
    setUnlinkingId(jobId);
    try {
      const updated = await invoke<KnowledgeEntry>('reman_unlink_job_from_knowledge_entry', { id: entry.id, ligcdeId: jobId });
      onUpdated(updated);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUnlinkingId(null);
    }
  };

  const linkJob = async (job: JobSearchResult) => {
    setLinking(true);
    try {
      const updated = await invoke<KnowledgeEntry>('reman_link_job_to_knowledge_entry', { id: entry.id, ligcdeId: job.id });
      onUpdated(updated);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLinking(false);
    }
  };

  if (editing) {
    return (
      <EntryForm
        initial={entryToForm(entry)}
        suggestions={suggestions}
        onCancel={() => { setEditing(false); setError(''); }}
        onSave={save}
        saving={saving}
        error={error}
      />
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-start gap-2 px-3.5 py-3 cursor-pointer hover:bg-elevated/50 transition-colors" onClick={() => setExpanded(v => !v)}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-text-primary">{title}</span>
            {entry.linkedToThisJob && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-success/10 text-success border border-success/20">
                {t('reman.knowledge_linked_to_this_job')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap mt-1">
            {entry.faultCodes.map(c => (
              <span key={c} className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded-md bg-danger/10 text-danger border border-danger/20">{c}</span>
            ))}
            {[entry.vehicleMake, entry.vehicleModel].filter(Boolean).length > 0 && (
              <span className="text-[11px] text-text-tertiary">{[entry.vehicleMake, entry.vehicleModel, entry.vehicleYear].filter(Boolean).join(' · ')}</span>
            )}
          </div>
          {!expanded && entry.fixTags.length > 0 && (
            <p className="text-[11px] text-text-secondary mt-1 truncate">{t('reman.knowledge_fix_prefix')} {entry.fixTags.join(', ')}</p>
          )}
        </div>
        <span className="text-text-tertiary shrink-0 mt-0.5">
          {expanded ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
        </span>
      </div>

      {expanded && (
        <div className="px-3.5 pb-3.5 pt-0.5 border-t border-border space-y-2.5 text-xs">
          {entry.ecuRef && (
            <div>
              <span className="text-text-tertiary text-[11px]">{t('reman.knowledge_field_ecu_ref')}</span>
              <p className="text-text-secondary mt-0.5 font-mono">{entry.ecuRef}</p>
            </div>
          )}
          {entry.causeTags.length > 0 && (
            <div>
              <span className="text-text-tertiary text-[11px]">{t('reman.knowledge_field_cause_tags')}</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {entry.causeTags.map(c => (
                  <span key={c} className="text-[11px] px-1.5 py-0.5 rounded-md bg-elevated text-text-secondary border border-border">{c}</span>
                ))}
              </div>
            </div>
          )}
          {entry.fixTags.length > 0 && (
            <div>
              <span className="text-text-tertiary text-[11px]">{t('reman.knowledge_field_fix_tags')}</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {entry.fixTags.map(f => (
                  <span key={f} className="text-[11px] px-1.5 py-0.5 rounded-md bg-success/10 text-success border border-success/20">{f}</span>
                ))}
              </div>
            </div>
          )}
          {entry.notes && (
            <div>
              <span className="text-text-tertiary text-[11px]">{t('reman.knowledge_field_notes')}</span>
              <p className="text-text-secondary mt-0.5 whitespace-pre-line">{entry.notes}</p>
            </div>
          )}
          <div>
            <span className="text-text-tertiary text-[11px]">{t('reman.knowledge_linked_jobs')}</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {entry.linkedJobIds.length === 0 && <span className="text-[11px] text-text-tertiary italic">{t('reman.knowledge_no_linked_jobs')}</span>}
              {entry.linkedJobIds.map(jobId => (
                <span key={jobId} className="flex items-center gap-1 text-[11px] font-mono px-1.5 py-0.5 rounded-md bg-elevated text-text-secondary border border-border">
                  #{jobId}
                  <button type="button" disabled={unlinkingId === jobId} onClick={() => unlinkJob(jobId)} className="hover:text-danger transition-colors disabled:opacity-50">
                    <XMarkIcon className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-1.5">
              <JobLinkPicker disabled={linking} onPick={linkJob} />
            </div>
          </div>
          {(entry.createdByTechName || entry.createdAt) && (
            <p className="text-[10px] text-text-tertiary">
              {t('reman.knowledge_logged_by', { name: entry.createdByTechName || '?', date: new Date(entry.createdAt).toLocaleDateString() })}
            </p>
          )}
          {error && <p className="text-[11px] text-danger bg-danger/10 border border-danger/20 rounded-lg px-2.5 py-1.5">{error}</p>}
          <div className="flex items-center gap-2 pt-0.5">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setEditing(true); }}
              className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md bg-elevated border border-border text-text-secondary hover:text-text-primary transition-all"
            >
              <PencilIcon className="w-3 h-3" />
              {t('common.edit')}
            </button>
            {confirmDelete ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-[11px] px-2 py-1 bg-danger/10 text-danger border border-danger/20 rounded-md hover:bg-danger/20 transition-all font-medium disabled:opacity-50"
                >
                  {deleting ? '…' : t('common.delete')}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-[11px] px-2 py-1 bg-elevated border border-border text-text-secondary rounded-md hover:text-text-primary transition-all"
                >
                  {t('common.cancel')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md text-text-tertiary hover:text-danger hover:bg-danger/10 transition-all"
              >
                <TrashIcon className="w-3 h-3" />
                {t('common.delete')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Top-level tab ──────────────────────────────────────────── */

export default function RepairKnowledgeBase() {
  const { t } = useTranslation();
  const { currentUser } = useSession();
  const [rawQuery, setRawQuery] = useState('');
  const [family, setFamily] = useState('');
  const [entries, setEntries] = useState<KnowledgeEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [suggestions, setSuggestions] = useState<KnowledgeTagSuggestions>(EMPTY_SUGGESTIONS);
  const [showNewForm, setShowNewForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const canWrite = Boolean(currentUser?.remanTechId && currentUser?.remanTechName);

  const runSearch = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await invoke<KnowledgeEntry[]>('reman_search_knowledge_entries', {
        query: rawQuery.trim() || null,
        family: family.trim() || null,
      });
      setEntries(rows);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [rawQuery, family]);

  useEffect(() => {
    const timer = setTimeout(runSearch, 250);
    return () => clearTimeout(timer);
  }, [runSearch]);

  useEffect(() => {
    invoke<KnowledgeTagSuggestions>('reman_list_knowledge_tag_suggestions').then(setSuggestions).catch(() => {});
  }, []);

  const createEntry = async (form: EntryFormState) => {
    if (!currentUser?.remanTechId || !currentUser?.remanTechName) return;
    setCreating(true);
    setCreateError('');
    try {
      const created = await invoke<KnowledgeEntry>('reman_create_knowledge_entry', {
        ecuRef: form.ecuRef, ecuBrand: form.ecuBrand, ecuFamily: form.ecuFamily,
        vehicleMake: form.vehicleMake, vehicleModel: form.vehicleModel, vehicleYear: form.vehicleYear,
        faultCodes: form.faultCodes, causeTags: form.causeTags, fixTags: form.fixTags, notes: form.notes,
        linkedJobIds: [],
        techId: currentUser.remanTechId, techName: currentUser.remanTechName,
      });
      setEntries(prev => [created, ...(prev || [])]);
      setShowNewForm(false);
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-text-primary">{t('reman.tab_knowledge')}</h2>
        <p className="text-[11px] text-text-tertiary mt-0.5">{t('reman.knowledge_subtitle')}</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <MagnifyingGlassIcon className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            value={rawQuery}
            onChange={e => setRawQuery(e.target.value)}
            placeholder={t('reman.knowledge_search_ph')}
            className="w-full bg-card border border-border rounded-lg pl-8 pr-3 py-2 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent/40 focus:border-accent/40 transition-all"
          />
        </div>
        <input
          type="text"
          value={family}
          onChange={e => setFamily(e.target.value)}
          list="kb-ecu-families-filter"
          placeholder={t('reman.knowledge_filter_family_ph')}
          className="w-40 bg-card border border-border rounded-lg px-2.5 py-2 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent/40 focus:border-accent/40 transition-all"
        />
        <datalist id="kb-ecu-families-filter">
          {suggestions.ecuFamilies.map(f => <option key={f} value={f} />)}
        </datalist>
        {canWrite ? (
          <button
            type="button"
            onClick={() => setShowNewForm(v => !v)}
            className="flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-lg bg-accent text-white hover:bg-accent/90 transition-all shrink-0"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            {t('reman.knowledge_new_entry')}
          </button>
        ) : (
          <span className="flex items-center gap-1 text-[11px] text-text-tertiary italic">
            <ExclamationTriangleIcon className="w-3.5 h-3.5" />
            {t('reman.set_fault_type_claim_hint')}
          </span>
        )}
      </div>

      {showNewForm && canWrite && (
        <EntryForm
          initial={EMPTY_FORM}
          suggestions={suggestions}
          onCancel={() => { setShowNewForm(false); setCreateError(''); }}
          onSave={createEntry}
          saving={creating}
          error={createError}
        />
      )}

      {loading && <div className="text-center py-10 text-text-tertiary text-xs">{t('reman.searching')}</div>}
      {error && (
        <div className="bg-danger/10 border border-danger/20 rounded-xl px-4 py-3">
          <p className="text-xs text-danger">{error}</p>
        </div>
      )}
      {!loading && !error && entries && entries.length === 0 && (
        <div className="text-center py-10">
          <p className="text-sm text-text-tertiary">{t('reman.no_results')}</p>
        </div>
      )}
      {!loading && !error && entries && entries.length > 0 && (
        <div className="space-y-2">
          {entries.map(entry => (
            <EntryCard
              key={entry.id}
              entry={entry}
              suggestions={suggestions}
              onUpdated={updated => setEntries(prev => (prev || []).map(e => (e.id === updated.id ? updated : e)))}
              onDeleted={id => setEntries(prev => (prev || []).filter(e => e.id !== id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export { EntryForm, entryToForm, EMPTY_FORM };
export type { EntryFormState, KnowledgeTagSuggestions };
