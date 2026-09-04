import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useScanRouter } from '@/hooks/useScanRouter';
import type { ScanEntity } from '@/lib/braxonScan';

interface ScanEventPayload {
  entity: ScanEntity;
  key: string;
  label?: string;
}

/**
 * Bridges phone scans into the UI. The scan-inbox poller
 * (src-tauri/src/scan_inbox.rs) emits `braxon-scan` when a row addressed
 * to this machine lands in Postgres; this routes it like an in-app scan.
 * Renders nothing — mounted once near the app root.
 */
export default function ScanListener() {
  const route = useScanRouter();
  // Kept in a ref so the listener registers exactly once on mount and a
  // changing `route` identity never tears it down / re-registers it.
  const routeRef = useRef(route);
  routeRef.current = route;

  useEffect(() => {
    console.debug('[scan] ScanListener mounted — registering braxon-scan listener');
    const unlisten = listen<ScanEventPayload>('braxon-scan', e => {
      console.debug('[scan] braxon-scan received', e.payload);
      const { entity, key, label } = e.payload;
      if (entity && key) routeRef.current({ entity, key, label: label ?? undefined });
    });
    unlisten.then(() => console.debug('[scan] braxon-scan listener registered'));
    return () => { unlisten.then(fn => fn()); };
  }, []);

  return null;
}
