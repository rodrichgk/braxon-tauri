// REMAN "visual search" graph — turns the two flat lists the Interventions
// tab already has (job search results + Repair Knowledge Base entries) into a
// node/edge web the user explores the way Obsidian's graph view works:
// a job links to the fault codes it was closed against, each fault code links
// back out to every *other* job that carries it, those reach the proven fixes,
// and so on. Requested directly: "an obsidian view like the links and stuff…
// when i search for a job, [link] it to the fault codes related to that job
// and job linked to a fault code and so on… a more visual search".
//
// Kept pure (no React, no @tauri-apps) — construction, traversal and layout
// are all unit-testable in isolation. src/components/RemanGraphView.tsx is a
// thin renderer over what this returns.
//
// Data sources (see src/pages/Reman.tsx / src/components/RepairKnowledgeBase.tsx):
//  - InterventionSummary  -> job nodes, fanning out to client / vehicle /
//                            family nodes.
//  - KnowledgeEntry       -> repair nodes plus the fault-code / cause / fix /
//                            ECU nodes they cite; `linkedJobIds` are the
//                            job<->repair edges.
// The knowledge base is the ONLY place a fault code is recorded against a job
// (REMAN 4D has no field for it), so every job<->faultCode path runs through
// a repair node — there is no direct job->faultCode edge by design.

export type RemanNodeKind =
  | 'job'
  | 'repair'
  | 'faultCode'
  | 'cause'
  | 'fix'
  | 'client'
  | 'vehicle'
  | 'family'
  | 'ecu';

export type RemanFaultType = 'hydraulic' | 'ecu' | 'both';

export interface RemanGraphNode {
  /** Stable, kind-prefixed key: `job:17517001`, `faultCode:C1391`. */
  id: string;
  kind: RemanNodeKind;
  /** Primary text drawn on / under the node. */
  label: string;
  /** Optional secondary text for the detail panel / tooltip. */
  sub?: string;
  /** Incident-edge count — filled in by {@link buildRemanGraph}. */
  degree: number;
  /** job only: `false` for a current search result, `true` when the job was
   *  pulled in solely because a knowledge entry links out to it. */
  unlisted?: boolean;
  /** job only: hydraulic / ecu / both — drives node colour. */
  faultType?: RemanFaultType;
  /** job only: the raw ligcde id, so the renderer can open the real job. */
  jobId?: string;
  /** repair only: the raw `RemanKnowledgeEntry` id. */
  repairId?: number;
}

export type RemanGraphEdgeKind =
  | 'job-repair'
  | 'repair-faultCode'
  | 'repair-cause'
  | 'repair-fix'
  | 'repair-ecu'
  | 'job-client'
  | 'job-vehicle'
  | 'job-family';

export interface RemanGraphEdge {
  /** `${source}~${target}` — a node pair only ever has one relationship. */
  id: string;
  source: string;
  target: string;
  kind: RemanGraphEdgeKind;
}

export interface RemanGraph {
  nodes: RemanGraphNode[];
  edges: RemanGraphEdge[];
}

/* ── Inputs (structural subsets of the real types) ──────────── */

export interface RemanGraphJob {
  id: string;
  reference?: string | null;
  clientName?: string | null;
  family?: string | null;
  vehicleModel?: string | null;
  vehiclePlate?: string | null;
  statut?: string | null;
  absFaultHint?: 'hydraulic' | 'ecu' | null;
  verifiedFaultType?: { faultType: RemanFaultType } | null;
}

export interface RemanGraphKnowledgeEntry {
  id: number;
  ecuRef?: string | null;
  ecuBrand?: string | null;
  ecuFamily?: string | null;
  faultCodes: string[];
  causeTags: string[];
  fixTags: string[];
  linkedJobIds: string[];
}

export interface BuildRemanGraphOptions {
  includeClient?: boolean;
  includeVehicle?: boolean;
  includeFamily?: boolean;
  includeCause?: boolean;
  includeFix?: boolean;
  includeEcu?: boolean;
  /** Pull in a repair's *other* linked jobs (ones not in the search results)
   *  as faded stub nodes, so a fault-code cluster shows its full reach.
   *  Default `true`. */
  includeUnlistedJobs?: boolean;
  /** Also add repairs that share a fault code with the ones already in the
   *  graph, even when they link to no listed job — this is what turns a
   *  fault code into a hub reaching every other job that hit it. Runs exactly
   *  one ring out (no unbounded recursion). Default `true`. */
  expandFaultCodeSiblings?: boolean;
  /** Safety bound for {@link expandFaultCodeSiblings} on a very common code.
   *  Default `20`. */
  maxSiblingRepairsPerFaultCode?: number;
}

const DEFAULTS: Required<BuildRemanGraphOptions> = {
  includeClient: true,
  includeVehicle: true,
  includeFamily: true,
  includeCause: true,
  includeFix: true,
  includeEcu: true,
  includeUnlistedJobs: true,
  expandFaultCodeSiblings: true,
  maxSiblingRepairsPerFaultCode: 20,
};

/** Rank for a stable, readable node ordering (hubs first). */
const KIND_RANK: Record<RemanNodeKind, number> = {
  job: 0,
  faultCode: 1,
  repair: 2,
  cause: 3,
  fix: 4,
  ecu: 5,
  client: 6,
  vehicle: 7,
  family: 8,
};

function norm(value: string | null | undefined): string {
  return (value ?? '').trim();
}

function jobFaultType(job: RemanGraphJob): RemanFaultType | undefined {
  // A technician's confirmed read always wins over the intake-text hint —
  // same precedence FaultTypeBadge applies in Reman.tsx.
  return job.verifiedFaultType?.faultType ?? job.absFaultHint ?? undefined;
}

function ecuKeyLabel(entry: RemanGraphKnowledgeEntry): { key: string; label: string; sub?: string } | null {
  const primary = norm(entry.ecuRef) || norm(entry.ecuFamily) || norm(entry.ecuBrand);
  if (!primary) return null;
  const subParts = [norm(entry.ecuBrand), norm(entry.ecuFamily)].filter(p => p && p !== primary);
  return {
    key: `ecu:${primary.toLowerCase()}`,
    label: primary,
    sub: subParts.length ? subParts.join(' · ') : undefined,
  };
}

/**
 * Build the job/fault-code/repair graph from the current search results and
 * the full Repair Knowledge Base.
 *
 * Two bounded passes:
 *  A. every repair linked to at least one *listed* job — plus that repair's
 *     cited fault codes / causes / fixes / ECU, and its other linked jobs as
 *     `unlisted` stubs.
 *  B. (when `expandFaultCodeSiblings`) every *other* repair that shares one of
 *     the fault codes surfaced in pass A, plus its linked jobs — one ring
 *     only, so a shared fault code becomes a hub without dragging in the
 *     whole knowledge base.
 */
export function buildRemanGraph(
  jobs: readonly RemanGraphJob[],
  knowledge: readonly RemanGraphKnowledgeEntry[],
  options: BuildRemanGraphOptions = {},
): RemanGraph {
  const opts = { ...DEFAULTS, ...options };
  const nodes = new Map<string, RemanGraphNode>();
  const edges = new Map<string, RemanGraphEdge>();

  const addNode = (node: RemanGraphNode): RemanGraphNode => {
    const existing = nodes.get(node.id);
    if (existing) return existing;
    nodes.set(node.id, node);
    return node;
  };
  const addEdge = (source: string, target: string, kind: RemanGraphEdgeKind) => {
    if (source === target) return;
    const id = `${source}~${target}`;
    if (!edges.has(id)) edges.set(id, { id, source, target, kind });
  };

  const listedIds = new Set(jobs.map(j => j.id));

  const addJobStub = (jobId: string): RemanGraphNode =>
    addNode({
      id: `job:${jobId}`,
      kind: 'job',
      label: `#${jobId}`,
      sub: undefined,
      degree: 0,
      unlisted: true,
      jobId,
    });

  // Pass 0 — the search results themselves, always visible even with no links.
  for (const job of jobs) {
    const nodeId = `job:${job.id}`;
    addNode({
      id: nodeId,
      kind: 'job',
      label: norm(job.reference) || `#${job.id}`,
      sub: [norm(job.vehicleModel), norm(job.statut)].filter(Boolean).join(' · ') || undefined,
      degree: 0,
      unlisted: false,
      faultType: jobFaultType(job),
      jobId: job.id,
    });

    const client = norm(job.clientName);
    if (opts.includeClient && client) {
      addNode({ id: `client:${client.toLowerCase()}`, kind: 'client', label: client, degree: 0 });
      addEdge(nodeId, `client:${client.toLowerCase()}`, 'job-client');
    }
    const vehicle = norm(job.vehicleModel);
    if (opts.includeVehicle && vehicle) {
      addNode({ id: `vehicle:${vehicle.toLowerCase()}`, kind: 'vehicle', label: vehicle, degree: 0 });
      addEdge(nodeId, `vehicle:${vehicle.toLowerCase()}`, 'job-vehicle');
    }
    const family = norm(job.family);
    if (opts.includeFamily && family) {
      addNode({ id: `family:${family.toLowerCase()}`, kind: 'family', label: family, degree: 0 });
      addEdge(nodeId, `family:${family.toLowerCase()}`, 'job-family');
    }
  }

  // Adds one repair node and everything it cites, wiring it to `jobIds`
  // (a listed job, or an unlisted stub when allowed). Returns the set of
  // normalised fault-code keys it touched.
  const addRepair = (entry: RemanGraphKnowledgeEntry, jobIds: readonly string[]): Set<string> => {
    const repairId = `repair:${entry.id}`;
    const faultLabels = entry.faultCodes.map(norm).filter(Boolean);
    const fixLabels = entry.fixTags.map(norm).filter(Boolean);
    addNode({
      id: repairId,
      // No literal English here — this is a pure module. The renderer draws
      // repair nodes in their own colour/shape and names the kind via t();
      // the label is just the most recognisable identifier (a fix tag, or
      // the fault code it addresses, or the raw entry id).
      kind: 'repair',
      label: fixLabels[0] ?? faultLabels[0] ?? `#${entry.id}`,
      sub: fixLabels.join(', ') || undefined,
      degree: 0,
      repairId: entry.id,
    });

    for (const jobId of jobIds) {
      if (!listedIds.has(jobId)) {
        if (!opts.includeUnlistedJobs) continue;
        addJobStub(jobId);
      }
      addEdge(`job:${jobId}`, repairId, 'job-repair');
    }

    const touched = new Set<string>();
    for (const code of faultLabels) {
      const key = `faultCode:${code.toUpperCase()}`;
      addNode({ id: key, kind: 'faultCode', label: code, degree: 0 });
      addEdge(repairId, key, 'repair-faultCode');
      touched.add(key);
    }
    if (opts.includeCause) {
      for (const tag of entry.causeTags.map(norm).filter(Boolean)) {
        const key = `cause:${tag.toLowerCase()}`;
        addNode({ id: key, kind: 'cause', label: tag, degree: 0 });
        addEdge(repairId, key, 'repair-cause');
      }
    }
    if (opts.includeFix) {
      for (const tag of entry.fixTags.map(norm).filter(Boolean)) {
        const key = `fix:${tag.toLowerCase()}`;
        addNode({ id: key, kind: 'fix', label: tag, degree: 0 });
        addEdge(repairId, key, 'repair-fix');
      }
    }
    if (opts.includeEcu) {
      const ecu = ecuKeyLabel(entry);
      if (ecu) {
        addNode({ id: ecu.key, kind: 'ecu', label: ecu.label, sub: ecu.sub, degree: 0 });
        addEdge(repairId, ecu.key, 'repair-ecu');
      }
    }
    return touched;
  };

  // Pass A — repairs anchored to a listed job.
  const addedEntryIds = new Set<number>();
  const activeFaultCodes = new Set<string>();
  for (const entry of knowledge) {
    const listedLinked = entry.linkedJobIds.filter(id => listedIds.has(id));
    if (listedLinked.length === 0) continue;
    addedEntryIds.add(entry.id);
    for (const key of addRepair(entry, entry.linkedJobIds)) activeFaultCodes.add(key);
  }

  // Pass B — one ring out: repairs that share a surfaced fault code.
  if (opts.expandFaultCodeSiblings && activeFaultCodes.size > 0 && opts.includeUnlistedJobs) {
    const siblingCount = new Map<string, number>();
    for (const entry of knowledge) {
      if (addedEntryIds.has(entry.id)) continue;
      const shared = entry.faultCodes
        .map(c => `faultCode:${norm(c).toUpperCase()}`)
        .filter(key => key !== 'faultCode:' && activeFaultCodes.has(key));
      if (shared.length === 0) continue;
      // Admit only if EVERY surfaced code this repair also cites is still
      // under the cap — otherwise adding it would push a code's visible
      // cluster past the bound no matter which code "sponsored" it. This
      // keeps `maxSiblingRepairsPerFaultCode` a hard ceiling per code.
      const withinCap = shared.every(key => (siblingCount.get(key) ?? 0) < opts.maxSiblingRepairsPerFaultCode);
      if (!withinCap) continue;
      addedEntryIds.add(entry.id);
      addRepair(entry, entry.linkedJobIds);
      for (const key of shared) siblingCount.set(key, (siblingCount.get(key) ?? 0) + 1);
    }
  }

  // Degrees.
  const degree = new Map<string, number>();
  for (const edge of edges.values()) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }

  const finalNodes: RemanGraphNode[] = [];
  for (const node of nodes.values()) {
    const deg = degree.get(node.id) ?? 0;
    // A listed job with no links is still a meaningful search hit — keep it.
    // Everything else only earns its place by being connected.
    if (deg === 0 && !(node.kind === 'job' && node.unlisted === false)) continue;
    finalNodes.push({ ...node, degree: deg });
  }

  finalNodes.sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const keptIds = new Set(finalNodes.map(n => n.id));
  const finalEdges = [...edges.values()]
    .filter(e => keptIds.has(e.source) && keptIds.has(e.target))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return { nodes: finalNodes, edges: finalEdges };
}

/* ── Traversal ─────────────────────────────────────────────── */

function buildAdjacency(graph: RemanGraph): Map<string, RemanGraphEdge[]> {
  const adj = new Map<string, RemanGraphEdge[]>();
  const push = (id: string, edge: RemanGraphEdge) => {
    const list = adj.get(id);
    if (list) list.push(edge);
    else adj.set(id, [edge]);
  };
  for (const edge of graph.edges) {
    push(edge.source, edge);
    push(edge.target, edge);
  }
  return adj;
}

/** Distinct nodes one hop from `nodeId` (empty if it isn't in the graph). */
export function graphNeighbors(graph: RemanGraph, nodeId: string): RemanGraphNode[] {
  const adj = buildAdjacency(graph);
  const byId = new Map(graph.nodes.map(n => [n.id, n]));
  const out: RemanGraphNode[] = [];
  const seen = new Set<string>();
  for (const edge of adj.get(nodeId) ?? []) {
    const otherId = edge.source === nodeId ? edge.target : edge.source;
    if (seen.has(otherId)) continue;
    seen.add(otherId);
    const node = byId.get(otherId);
    if (node) out.push(node);
  }
  return out;
}

/** Sub-graph within `depth` hops of `nodeId` (BFS). `depth <= 0` or an
 *  unknown id yields an empty graph. */
export function egoGraph(graph: RemanGraph, nodeId: string, depth = 1): RemanGraph {
  const byId = new Map(graph.nodes.map(n => [n.id, n]));
  if (!byId.has(nodeId) || depth <= 0) return { nodes: [], edges: [] };
  const adj = buildAdjacency(graph);
  const keep = new Set<string>([nodeId]);
  let frontier = [nodeId];
  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const edge of adj.get(id) ?? []) {
        const otherId = edge.source === id ? edge.target : edge.source;
        if (!keep.has(otherId)) {
          keep.add(otherId);
          next.push(otherId);
        }
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }
  return {
    nodes: graph.nodes.filter(n => keep.has(n.id)),
    edges: graph.edges.filter(e => keep.has(e.source) && keep.has(e.target)),
  };
}

/** The whole connected component containing `nodeId`. */
export function connectedGraph(graph: RemanGraph, nodeId: string): RemanGraph {
  return egoGraph(graph, nodeId, graph.nodes.length + 1);
}

/** Node / edge counts and a per-kind tally — feeds the legend and tests. */
export function remanGraphStats(graph: RemanGraph): {
  nodeCount: number;
  edgeCount: number;
  byKind: Record<RemanNodeKind, number>;
} {
  const byKind = {
    job: 0, repair: 0, faultCode: 0, cause: 0, fix: 0, client: 0, vehicle: 0, family: 0, ecu: 0,
  } as Record<RemanNodeKind, number>;
  for (const node of graph.nodes) byKind[node.kind]++;
  return { nodeCount: graph.nodes.length, edgeCount: graph.edges.length, byKind };
}

/* ── Deterministic force-directed layout ───────────────────── */

export interface ForceLayoutOptions {
  width: number;
  height: number;
  /** Default scales down for big graphs (260 nodes+). */
  iterations?: number;
  /** PRNG seed for the (only) random step, initial placement. Default `1`. */
  seed?: number;
  /** Ideal edge length in px. Default derived from area / node count. */
  linkDistance?: number;
  /** Pull toward the centre each step. Default `0.06`. */
  gravity?: number;
  /** Reserved margin used only when deriving the ideal edge length from
   *  `width`/`height` — there is no bounding-box clamp. Default `28`. */
  padding?: number;
}

export interface PositionedNode extends RemanGraphNode {
  x: number;
  y: number;
}

export interface PositionedGraph {
  nodes: PositionedNode[];
  edges: RemanGraphEdge[];
  width: number;
  height: number;
}

/** Small, fast, seedable PRNG (mulberry32) — keeps the layout reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fruchterman–Reingold layout. Deterministic for a given `(graph, seed,
 * options)` — same inputs always produce the same coordinates.
 *
 * There is deliberately **no bounding-box clamp**: nodes near the edge used to
 * line up dead straight against it (reported directly). Cooling plus a weak
 * pull toward the centre keep the result compact and organic, and the canvas
 * behaves as if it were infinite — the caller frames whatever comes out.
 * `width`/`height` only set the ideal edge length and the centre point.
 */
export function forceLayout(graph: RemanGraph, options: ForceLayoutOptions): PositionedGraph {
  const { width, height } = options;
  const n = graph.nodes.length;
  if (n === 0) return { nodes: [], edges: graph.edges, width, height };

  const seed = options.seed ?? 1;
  const padding = options.padding ?? 28;
  const gravity = options.gravity ?? 0.06;
  const iterations = options.iterations ?? (n > 260 ? 160 : 300);
  const area = Math.max(1, (width - padding * 2) * (height - padding * 2));
  const k = options.linkDistance ?? Math.max(22, Math.sqrt(area / n) * 0.82);
  const cx = width / 2;
  const cy = height / 2;
  const rng = mulberry32(seed);

  const index = new Map(graph.nodes.map((node, i) => [node.id, i]));
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  // Phyllotaxis spiral + seeded jitter: deterministic, evenly spread, and
  // never starts every node on top of the centre (which would make the first
  // repulsion step explode).
  const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const r = k * 0.55 * Math.sqrt(i + 0.5);
    const angle = i * GOLDEN_ANGLE;
    xs[i] = cx + Math.cos(angle) * r + (rng() - 0.5) * k * 0.1;
    ys[i] = cy + Math.sin(angle) * r + (rng() - 0.5) * k * 0.1;
  }

  const dispX = new Float64Array(n);
  const dispY = new Float64Array(n);
  const temp0 = Math.min(width, height) * 0.32;

  for (let iter = 0; iter < iterations; iter++) {
    const temp = temp0 * (1 - iter / iterations) + 0.4;
    dispX.fill(0);
    dispY.fill(0);

    // Repulsion between every pair — O(n^2), fine for the few-hundred-node
    // graphs this view ever shows.
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = xs[i] - xs[j];
        let dy = ys[i] - ys[j];
        let dist2 = dx * dx + dy * dy;
        if (dist2 < 1e-6) {
          // Exactly coincident — nudge deterministically so the direction is
          // defined without introducing run-to-run variance.
          dx = (rng() - 0.5) * 0.1;
          dy = (rng() - 0.5) * 0.1;
          dist2 = dx * dx + dy * dy + 1e-6;
        }
        const dist = Math.sqrt(dist2);
        const force = (k * k) / dist;
        const ux = dx / dist;
        const uy = dy / dist;
        dispX[i] += ux * force;
        dispY[i] += uy * force;
        dispX[j] -= ux * force;
        dispY[j] -= uy * force;
      }
    }

    // Attraction along edges.
    for (const edge of graph.edges) {
      const si = index.get(edge.source);
      const ti = index.get(edge.target);
      if (si === undefined || ti === undefined) continue;
      const dx = xs[si] - xs[ti];
      const dy = ys[si] - ys[ti];
      const dist = Math.sqrt(dx * dx + dy * dy) || 1e-3;
      const force = (dist * dist) / k;
      const ux = dx / dist;
      const uy = dy / dist;
      dispX[si] -= ux * force;
      dispY[si] -= uy * force;
      dispX[ti] += ux * force;
      dispY[ti] += uy * force;
    }

    // Centre gravity + apply, capped by the cooling temperature.
    for (let i = 0; i < n; i++) {
      dispX[i] += (cx - xs[i]) * gravity;
      dispY[i] += (cy - ys[i]) * gravity;
      const d = Math.hypot(dispX[i], dispY[i]);
      if (d > 1e-9) {
        const capped = Math.min(d, temp);
        xs[i] += (dispX[i] / d) * capped;
        ys[i] += (dispY[i] / d) * capped;
      }
    }
  }

  const positioned: PositionedNode[] = graph.nodes.map((node, i) => {
    const x = Number.isFinite(xs[i]) ? xs[i] : cx + ((i % 7) - 3) * 4;
    const y = Number.isFinite(ys[i]) ? ys[i] : cy + ((i % 5) - 2) * 4;
    return { ...node, x, y };
  });

  return { nodes: positioned, edges: graph.edges, width, height };
}
