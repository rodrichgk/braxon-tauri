import { useCallback } from 'react';
import { useTestSession } from '@/contexts/TestSessionContext';
import { SCAN_ROUTES, type ScanEntity } from '@/lib/braxonScan';

export interface ScanInput {
  entity: ScanEntity;
  key: string;
  label?: string;
}

/**
 * Single entry point for a decoded scan, whichever way it arrived (phone
 * push via the `braxon-scan` Tauri event, or the in-app camera). Stashes
 * it as the pending scan and navigates to the entity's page; RemanPage /
 * SignalPage pick it up from there.
 */
export function useScanRouter() {
  const { navigateTo, setPendingScan } = useTestSession();
  return useCallback(
    ({ entity, key, label }: ScanInput) => {
      setPendingScan({ entity, key, label, ts: Date.now() });
      navigateTo(SCAN_ROUTES[entity]);
    },
    [navigateTo, setPendingScan],
  );
}
