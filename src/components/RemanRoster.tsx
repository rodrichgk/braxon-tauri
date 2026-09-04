import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/tauri';
import { useSession } from '@/contexts/SessionContext';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { LoadingRow } from './Spinner';

// Admin-only roster page — requested directly: assign roles (technicien,
// commercial, responsable technique, responsable de site — someone can
// hold more than one at once) to each real REMAN technician id, and mark
// people who've left so they stop showing up in current-facing views
// (My Jobs picker, analytics leaderboard) without touching their
// historical closed jobs. "hidden for everyone else but me" — gated in
// Reman.tsx on `currentUser.remanTechId`, and enforced again server-side
// in reman_list_roster/reman_update_roster_entry since a client-side hide
// alone isn't a real boundary.

interface RosterEntry {
  techId: string;
  techName: string;
  isTechnicien: boolean;
  isCommercial: boolean;
  // Drives the notification system's "job marked awaiting cleaning"
  // recipient list — requested directly alongside is_commercial (already
  // used for that purpose): "if I mark a job attente de nettoyage, i want
  // to know when it is cleaned, same for service commercial."
  isCleaning: boolean;
  isResponsableTechnique: boolean;
  isResponsableDeSite: boolean;
  isActive: boolean;
  salaryMonthly: number | null;
}

export default function RemanRoster() {
  const { t } = useTranslation();
  const { currentUser } = useSession();
  const requestingTechId = currentUser?.remanTechId ?? '';

  const [entries, setEntries] = useState<RosterEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    if (!requestingTechId) return;
    setLoading(true);
    setError('');
    invoke<RosterEntry[]>('reman_list_roster', { requestingTechId })
      .then(setEntries)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [requestingTechId]);

  useEffect(() => { load(); }, [load]);

  const update = async (entry: RosterEntry, patch: Partial<RosterEntry>) => {
    const next = { ...entry, ...patch };
    setEntries(prev => prev.map(e => (e.techId === entry.techId ? next : e)));
    setSavingIds(prev => new Set(prev).add(entry.techId));
    try {
      await invoke('reman_update_roster_entry', {
        requestingTechId,
        techId: entry.techId,
        isTechnicien: next.isTechnicien,
        isCommercial: next.isCommercial,
        isCleaning: next.isCleaning,
        isResponsableTechnique: next.isResponsableTechnique,
        isResponsableDeSite: next.isResponsableDeSite,
        isActive: next.isActive,
        salaryMonthly: next.salaryMonthly,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      load(); // revert to server truth if the write failed
    } finally {
      setSavingIds(prev => {
        const n = new Set(prev);
        n.delete(entry.techId);
        return n;
      });
    }
  };

  if (!requestingTechId) {
    return <p className="text-sm text-text-tertiary py-8 text-center">{t('reman.roster.claim_first')}</p>;
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 flex items-start gap-2">
          <ExclamationTriangleIcon className="w-4 h-4 text-danger shrink-0 mt-0.5" />
          <p className="text-xs text-danger">{error}</p>
        </div>
      )}
      {loading && entries.length === 0 && (
        <LoadingRow label={t('common.loading')} className="flex items-center justify-center gap-2 py-16 text-text-tertiary text-sm" spinnerClassName="w-4 h-4" />
      )}
      {entries.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-elevated/50">
                  <th className="text-left px-3 py-2 font-semibold text-text-secondary">{t('reman.roster.name')}</th>
                  <th className="px-2 py-2 font-semibold text-text-secondary whitespace-nowrap">{t('reman.roster.role_technicien')}</th>
                  <th className="px-2 py-2 font-semibold text-text-secondary whitespace-nowrap">{t('reman.roster.role_commercial')}</th>
                  <th className="px-2 py-2 font-semibold text-text-secondary whitespace-nowrap">{t('reman.roster.role_cleaning')}</th>
                  <th className="px-2 py-2 font-semibold text-text-secondary whitespace-nowrap">{t('reman.roster.role_resp_technique')}</th>
                  <th className="px-2 py-2 font-semibold text-text-secondary whitespace-nowrap">{t('reman.roster.role_resp_site')}</th>
                  <th className="px-2 py-2 font-semibold text-text-secondary whitespace-nowrap">{t('reman.roster.active')}</th>
                  <th className="px-2 py-2 font-semibold text-text-secondary whitespace-nowrap">{t('reman.roster.salary_monthly')}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(entry => (
                  <tr key={entry.techId} className={`border-b border-border last:border-0 transition-opacity ${!entry.isActive ? 'opacity-50' : ''}`}>
                    <td className="px-3 py-2 text-text-primary font-medium">
                      <div className="flex items-center gap-1.5">
                        {entry.techName}
                        {savingIds.has(entry.techId) && (
                          <span className="text-[10px] text-text-tertiary">{t('reman.roster.saving')}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={entry.isTechnicien}
                        onChange={e => update(entry, { isTechnicien: e.target.checked })}
                        className="w-3.5 h-3.5 accent-accent cursor-pointer"
                      />
                    </td>
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={entry.isCommercial}
                        onChange={e => update(entry, { isCommercial: e.target.checked })}
                        className="w-3.5 h-3.5 accent-accent cursor-pointer"
                      />
                    </td>
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={entry.isCleaning}
                        onChange={e => update(entry, { isCleaning: e.target.checked })}
                        className="w-3.5 h-3.5 accent-accent cursor-pointer"
                      />
                    </td>
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={entry.isResponsableTechnique}
                        onChange={e => update(entry, { isResponsableTechnique: e.target.checked })}
                        className="w-3.5 h-3.5 accent-accent cursor-pointer"
                      />
                    </td>
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={entry.isResponsableDeSite}
                        onChange={e => update(entry, { isResponsableDeSite: e.target.checked })}
                        className="w-3.5 h-3.5 accent-accent cursor-pointer"
                      />
                    </td>
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={entry.isActive}
                        onChange={e => update(entry, { isActive: e.target.checked })}
                        className="w-3.5 h-3.5 accent-success cursor-pointer"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        // Keyed on the value itself (not just techId) so an
                        // error-triggered revert (`load()` re-fetching
                        // server truth) actually remounts this uncontrolled
                        // input with the reverted value, instead of leaving
                        // whatever the user was mid-typing on screen.
                        key={`${entry.techId}-${entry.salaryMonthly}`}
                        type="number"
                        min="0"
                        step="1"
                        defaultValue={entry.salaryMonthly ?? ''}
                        placeholder="—"
                        // onBlur, not onChange — a salary shouldn't fire a
                        // save on every keystroke the way the role
                        // checkboxes do.
                        onBlur={e => {
                          const raw = e.target.value.trim();
                          const parsed = raw === '' ? null : Number(raw);
                          if (parsed === entry.salaryMonthly || Number.isNaN(parsed as number)) return;
                          update(entry, { salaryMonthly: parsed });
                        }}
                        className="w-24 text-xs bg-elevated border border-border rounded-lg px-2 py-1 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[11px] text-text-tertiary">{t('reman.roster.hint')}</p>
    </div>
  );
}
