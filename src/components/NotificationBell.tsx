import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/tauri';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/api/notification';
import { useSession } from '@/contexts/SessionContext';
import { BellIcon } from '@heroicons/react/24/outline';
import { BellIcon as BellSolid } from '@heroicons/react/24/solid';

// Requested directly: "if I mark a job attente de nettoyage, I want to
// know when it is cleaned, same for service commercial, because
// technicians only put units on the shelves, if they don't go check all
// the time, they'll miss some stuff and it's the same reason we have
// some units late." Mounted once in Sidebar.tsx, visible from every page
// — not buried inside the Reman tab, since the whole point is not
// needing to go check. Polls reman_list_notifications for whichever
// REMAN identity is currently claimed; renders nothing for a guest/
// unclaimed session, since there's nothing to notify them about.

interface NotificationRecord {
  id: number;
  kind: string;
  ligcdeId: string;
  reference?: string;
  message: string;
  createdAt: string;
  read: boolean;
}

// Was 15s, matching INTERVENTIONS_REFRESH_MS/SHOP_STATUS_REFRESH_MS — but
// that 15s exists to protect 4D/a shared Postgres cache from load across
// up to 15 concurrent clients, a constraint that doesn't apply here at
// all (RemanNotification is read directly, not through cached_or_refresh,
// and it's a small, per-recipient table). Reported directly as feeling
// slow for something "supposed to be on my postgres database" — lowered
// to make the badge itself feel snappy, decoupled from the 4D-driven
// views' cadence.
const NOTIFICATIONS_POLL_MS = 5 * 1000;

export default function NotificationBell() {
  const { t } = useTranslation();
  const { currentUser } = useSession();
  const techId = currentUser?.remanTechId;

  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [open, setOpen] = useState(false);
  // null until the first poll completes — guards the native-toast logic
  // below so opening the app (or claiming a technician identity) never
  // replays a whole backlog of toasts for notifications that arrived
  // while nobody was watching; only ones that show up *after* that first
  // load get a toast.
  const seenIdsRef = useRef<Set<number> | null>(null);

  const unreadCount = notifications.filter(n => !n.read).length;

  const fetchNotifications = useCallback(async () => {
    if (!techId) return;
    try {
      const rows = await invoke<NotificationRecord[]>('reman_list_notifications', { techId });
      if (seenIdsRef.current) {
        const newOnes = rows.filter(n => !n.read && !seenIdsRef.current!.has(n.id));
        if (newOnes.length > 0) {
          try {
            let granted = await isPermissionGranted();
            if (!granted) {
              const permission = await requestPermission();
              granted = permission === 'granted';
            }
            if (granted) {
              for (const n of newOnes) {
                sendNotification({ title: t('reman.notifications.toast_title'), body: n.message });
              }
            }
          } catch {
            // Native notification plumbing failing (permission dialog
            // dismissed, platform quirk, etc.) shouldn't block the
            // in-app list from updating — that's the fallback either way.
          }
        }
      }
      seenIdsRef.current = new Set(rows.map(n => n.id));
      setNotifications(rows);
    } catch {
      // A failed poll shouldn't interrupt whatever the user's doing —
      // the next poll retries on its own.
    }
  }, [techId, t]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, NOTIFICATIONS_POLL_MS);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const markRead = async (id: number) => {
    if (!techId) return;
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)));
    try {
      await invoke('reman_mark_notification_read', { id, techId });
    } catch {
      fetchNotifications(); // revert to server truth if the write failed
    }
  };

  const markAllRead = async () => {
    if (!techId || unreadCount === 0) return;
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    try {
      await invoke('reman_mark_all_notifications_read', { techId });
    } catch {
      fetchNotifications();
    }
  };

  if (!techId) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="relative p-1 text-text-tertiary hover:text-text-primary transition-colors shrink-0"
        title={t('reman.notifications.title')}
      >
        {unreadCount > 0 ? <BellSolid className="w-4 h-4 text-accent" /> : <BellIcon className="w-4 h-4" />}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-danger text-white text-[9px] font-bold flex items-center justify-center leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-full bottom-0 ml-2 z-50 w-72 max-h-96 overflow-y-auto bg-card border border-border rounded-xl shadow-2xl">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border sticky top-0 bg-card">
              <span className="text-xs font-semibold text-text-primary">{t('reman.notifications.title')}</span>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="text-[10px] font-medium text-accent hover:opacity-70 transition-opacity"
                >
                  {t('reman.notifications.mark_all_read')}
                </button>
              )}
            </div>
            {notifications.length === 0 ? (
              <p className="text-[11px] text-text-tertiary text-center py-6">{t('reman.notifications.empty')}</p>
            ) : (
              <div className="divide-y divide-border">
                {notifications.map(n => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => !n.read && markRead(n.id)}
                    className={[
                      'w-full text-left px-3 py-2 transition-colors',
                      n.read ? 'opacity-60' : 'bg-accent/5 hover:bg-accent/10',
                    ].join(' ')}
                  >
                    <div className="flex items-start gap-2">
                      {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0 mt-1" />}
                      <div className="min-w-0">
                        <p className="text-[11px] text-text-primary leading-snug">{n.message}</p>
                        <p className="text-[9px] text-text-tertiary mt-0.5">{new Date(n.createdAt).toLocaleString()}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
