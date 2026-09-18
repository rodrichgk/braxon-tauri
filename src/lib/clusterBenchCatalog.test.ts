import { describe, it, expect, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/tauri';
import {
  fetchClusterBenchCatalog,
  upsertClusterBenchSignal,
  indexCatalogByName,
  type ClusterBenchSignalMeta,
} from '@/lib/clusterBenchCatalog';

vi.mock('@tauri-apps/api/tauri', () => ({ invoke: vi.fn() }));

const FUEL: ClusterBenchSignalMeta = {
  name: 'fuel_pct', kind: 'gauge', category: 'gauge', unit: '%', iconKey: null, sortOrder: 0,
};

describe('fetchClusterBenchCatalog', () => {
  it('invokes get_cluster_bench_catalog and returns its rows', async () => {
    vi.mocked(invoke).mockResolvedValue([FUEL]);
    const rows = await fetchClusterBenchCatalog();
    expect(invoke).toHaveBeenCalledWith('get_cluster_bench_catalog');
    expect(rows).toEqual([FUEL]);
  });
});

describe('upsertClusterBenchSignal', () => {
  it('invokes upsert_cluster_bench_signal with the signal payload', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await upsertClusterBenchSignal(FUEL);
    expect(invoke).toHaveBeenCalledWith('upsert_cluster_bench_signal', { signal: FUEL });
  });
});

describe('indexCatalogByName', () => {
  it('builds a by-name lookup', () => {
    const map = indexCatalogByName([FUEL]);
    expect(map.get('fuel_pct')).toEqual(FUEL);
    expect(map.get('missing')).toBeUndefined();
  });

  it('returns an empty map for an empty catalog', () => {
    expect(indexCatalogByName([]).size).toBe(0);
  });
});
