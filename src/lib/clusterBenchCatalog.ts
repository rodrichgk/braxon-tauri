/* ── Cluster Bench signal catalog (Postgres-backed) ──────────────────────
   Fetches the shared "every possible dashboard light/sensor" catalog from
   BRAXON's Postgres (`ClusterBenchSignal`, see src-tauri/src/cluster_bench.rs)
   — self-seeding on first call, growable by any tech without a code change.

   This is display metadata only (kind/category/unit/icon) — it does NOT
   carry CAN wiring (frame id, bit position, scale). The demo profile's
   wiring stays in `builtinClusterCanProfiles.ts` for now (see
   docs/DASHBOARD-BENCH.md §8's still-open "profile storage" decision), so a
   signal added to the DB catalog beyond the demo's 48 has display metadata
   but nothing to transmit yet. `ClusterBenchDashboard` merges this over its
   own hardcoded icon/unit maps, falling back to those when the DB is
   unreachable or hasn't answered yet. */

import { invoke } from '@tauri-apps/api/tauri';

export interface ClusterBenchSignalMeta {
  name: string;
  kind: 'gauge' | 'telltale';
  category: string;
  unit: string | null;
  iconKey: string | null;
  sortOrder: number;
}

export async function fetchClusterBenchCatalog(): Promise<ClusterBenchSignalMeta[]> {
  return invoke<ClusterBenchSignalMeta[]>('get_cluster_bench_catalog');
}

export async function upsertClusterBenchSignal(signal: ClusterBenchSignalMeta): Promise<void> {
  await invoke('upsert_cluster_bench_signal', { signal });
}

/** By-name lookup, the shape every caller actually wants. */
export function indexCatalogByName(rows: readonly ClusterBenchSignalMeta[]): Map<string, ClusterBenchSignalMeta> {
  return new Map(rows.map(r => [r.name, r]));
}
