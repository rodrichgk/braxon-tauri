/* ── Dev gate ─────────────────────────────────────────────────
   Lets the developer (see lib/devAccess.ts) hide sidebar pages that are
   still being built, so other technicians don't open them mid-work. The
   hidden list lives in the shared "AppSetting" table, so hiding a page
   applies to every machine; the dev still sees hidden pages (dimmed, with
   an un-hide toggle) and can always navigate to them.

   Non-dev clients poll the setting so a change reaches them without a
   relaunch. ──────────────────────────────────────────────────── */

import {
  createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, type ReactNode,
} from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { useSession } from '@/contexts/SessionContext';
import { isDevUser, parseHiddenPages, HIDDEN_PAGES_KEY, HIDEABLE_PAGES } from '@/lib/devAccess';
import type { Page } from '@/lib/pages';

const POLL_MS = 45_000;

interface DevGateContextType {
  isDev: boolean;
  /** Loaded from the shared setting; empty until the first fetch resolves. */
  hiddenPages: Page[];
  isHidden: (page: Page) => boolean;
  /** Dev-only. Optimistic; rejects (and rolls back) if the DB write fails. */
  setHidden: (page: Page, hidden: boolean) => Promise<void>;
  loading: boolean;
}

const DevGateContext = createContext<DevGateContextType>({
  isDev: false,
  hiddenPages: [],
  isHidden: () => false,
  setHidden: async () => {},
  loading: true,
});

export function DevGateProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useSession();
  const isDev = isDevUser(currentUser);

  const [hiddenPages, setHiddenPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const hiddenRef = useRef<Page[]>([]);
  hiddenRef.current = hiddenPages;

  const refresh = useCallback(async () => {
    try {
      const raw = await invoke<string | null>('get_app_setting', { key: HIDDEN_PAGES_KEY });
      const next = parseHiddenPages(raw);
      // Only re-render when it actually changed.
      const cur = hiddenRef.current;
      if (next.length !== cur.length || next.some(p => !cur.includes(p))) {
        setHiddenPages(next);
      }
    } catch {
      /* DB unreachable — keep whatever we last had */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus); };
    // Re-read on login/logout too — DB config may only become usable then.
  }, [refresh, currentUser?.id]);

  const setHidden = useCallback(async (page: Page, hidden: boolean) => {
    if (!isDev) return;
    if (!(HIDEABLE_PAGES as readonly string[]).includes(page)) return;
    const prev = hiddenRef.current;
    const next = hidden ? [...prev.filter(p => p !== page), page] : prev.filter(p => p !== page);
    setHiddenPages(next);
    try {
      await invoke('set_app_setting', { key: HIDDEN_PAGES_KEY, value: JSON.stringify(next) });
    } catch (e) {
      setHiddenPages(prev); // roll back
      throw e;
    }
  }, [isDev]);

  const isHidden = useCallback((page: Page) => hiddenPages.includes(page), [hiddenPages]);

  const value = useMemo<DevGateContextType>(() => ({
    isDev, hiddenPages, isHidden, setHidden, loading,
  }), [isDev, hiddenPages, isHidden, setHidden, loading]);

  return <DevGateContext.Provider value={value}>{children}</DevGateContext.Provider>;
}

export function useDevGate() {
  return useContext(DevGateContext);
}
