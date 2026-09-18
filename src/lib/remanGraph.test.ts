import { describe, it, expect } from "vitest";
import {
  buildRemanGraph,
  egoGraph,
  connectedGraph,
  graphNeighbors,
  remanGraphStats,
  forceLayout,
  type RemanGraphJob,
  type RemanGraphKnowledgeEntry,
  type RemanGraph,
} from "@/lib/remanGraph";

/* ── builders ──────────────────────────────────────────────── */

function job(id: string, over: Partial<RemanGraphJob> = {}): RemanGraphJob {
  return {
    id,
    reference: `REF-${id}`,
    clientName: "GARAGE PEREA",
    family: "ABS",
    vehicleModel: "BMW SERIE 3",
    vehiclePlate: `AA-${id}`,
    statut: "Réparation",
    ...over,
  };
}

function entry(
  id: number,
  over: Partial<RemanGraphKnowledgeEntry> = {},
): RemanGraphKnowledgeEntry {
  return {
    id,
    faultCodes: [],
    causeTags: [],
    fixTags: [],
    linkedJobIds: [],
    ...over,
  };
}

const ids = (g: RemanGraph) => g.nodes.map(n => n.id).sort();
const edgeKey = (g: RemanGraph, kind: string) =>
  g.edges.filter(e => e.kind === kind).map(e => `${e.source}->${e.target}`).sort();

/* ── buildRemanGraph ───────────────────────────────────────── */

describe("buildRemanGraph", () => {
  it("returns an empty graph for empty input", () => {
    expect(buildRemanGraph([], [])).toEqual({ nodes: [], edges: [] });
  });

  it("keeps a listed job with no knowledge, fanning out to client / vehicle / family", () => {
    const g = buildRemanGraph([job("17517001")], []);
    const jobNode = g.nodes.find(n => n.id === "job:17517001");
    expect(jobNode).toMatchObject({ kind: "job", unlisted: false, jobId: "17517001", label: "REF-17517001" });
    expect(ids(g)).toEqual([
      "client:garage perea",
      "family:abs",
      "job:17517001",
      "vehicle:bmw serie 3",
    ]);
    expect(edgeKey(g, "job-client")).toEqual(["job:17517001->client:garage perea"]);
    expect(edgeKey(g, "job-vehicle")).toEqual(["job:17517001->vehicle:bmw serie 3"]);
    expect(edgeKey(g, "job-family")).toEqual(["job:17517001->family:abs"]);
    expect(jobNode?.degree).toBe(3);
  });

  it("honours the fan-out toggles", () => {
    const g = buildRemanGraph([job("1")], [], {
      includeClient: false,
      includeVehicle: false,
      includeFamily: false,
    });
    expect(ids(g)).toEqual(["job:1"]);
    expect(g.edges).toHaveLength(0);
  });

  it("carries the job fault type (verified wins over the hint)", () => {
    const g = buildRemanGraph(
      [
        job("a", { absFaultHint: "hydraulic", verifiedFaultType: null }),
        job("b", { absFaultHint: "hydraulic", verifiedFaultType: { faultType: "ecu" } }),
        job("c", { absFaultHint: null, verifiedFaultType: null }),
      ],
      [],
    );
    expect(g.nodes.find(n => n.id === "job:a")?.faultType).toBe("hydraulic");
    expect(g.nodes.find(n => n.id === "job:b")?.faultType).toBe("ecu");
    expect(g.nodes.find(n => n.id === "job:c")?.faultType).toBeUndefined();
  });

  it("wires a repair linked to a listed job to its fault codes, cause, fix and ECU", () => {
    const g = buildRemanGraph(
      [job("100", { clientName: null, vehicleModel: null, family: null })],
      [
        entry(7, {
          ecuRef: "10.0925-0851.3",
          ecuBrand: "ATE",
          faultCodes: ["C1391", "5DF0"],
          causeTags: ["cracked solder joint"],
          fixTags: ["reflow pump driver"],
          linkedJobIds: ["100"],
        }),
      ],
    );
    expect(ids(g)).toEqual([
      "cause:cracked solder joint",
      "ecu:10.0925-0851.3",
      "faultCode:5DF0",
      "faultCode:C1391",
      "fix:reflow pump driver",
      "job:100",
      "repair:7",
    ]);
    expect(edgeKey(g, "job-repair")).toEqual(["job:100->repair:7"]);
    expect(edgeKey(g, "repair-faultCode")).toEqual(["repair:7->faultCode:5DF0", "repair:7->faultCode:C1391"]);
    expect(edgeKey(g, "repair-cause")).toEqual(["repair:7->cause:cracked solder joint"]);
    expect(edgeKey(g, "repair-fix")).toEqual(["repair:7->fix:reflow pump driver"]);
    expect(edgeKey(g, "repair-ecu")).toEqual(["repair:7->ecu:10.0925-0851.3"]);
  });

  it("connects two listed jobs through a fault code they share (one entry, both linked)", () => {
    const g = buildRemanGraph(
      [job("j1"), job("j2")],
      [entry(1, { faultCodes: ["C1391"], linkedJobIds: ["j1", "j2"] })],
    );
    const fault = "faultCode:C1391";
    // Both jobs reach the shared fault code within two hops.
    const ego = egoGraph(g, fault, 2);
    expect(ids(ego)).toEqual(expect.arrayContaining(["job:j1", "job:j2", "repair:1", fault]));
  });

  it("expands one ring: a sibling repair sharing a fault code drags in its unlisted jobs", () => {
    const g = buildRemanGraph(
      [job("j1")],
      [
        entry(1, { faultCodes: ["C1391"], linkedJobIds: ["j1"] }),
        entry(2, { faultCodes: ["c1391"], linkedJobIds: ["j9", "j10"] }), // no listed job, shared code
        entry(3, { faultCodes: ["B1000"], linkedJobIds: ["j20"] }),       // unrelated, excluded
      ],
    );
    expect(g.nodes.find(n => n.id === "repair:2")).toBeDefined();
    expect(g.nodes.find(n => n.id === "job:j9")).toMatchObject({ unlisted: true, label: "#j9" });
    expect(g.nodes.find(n => n.id === "job:j10")).toMatchObject({ unlisted: true });
    expect(g.nodes.find(n => n.id === "repair:3")).toBeUndefined();
    expect(g.nodes.find(n => n.id === "faultCode:B1000")).toBeUndefined();
  });

  it("drops sibling expansion when expandFaultCodeSiblings is off", () => {
    const g = buildRemanGraph(
      [job("j1")],
      [
        entry(1, { faultCodes: ["C1391"], linkedJobIds: ["j1"] }),
        entry(2, { faultCodes: ["C1391"], linkedJobIds: ["j9"] }),
      ],
      { expandFaultCodeSiblings: false },
    );
    expect(g.nodes.find(n => n.id === "repair:2")).toBeUndefined();
    expect(g.nodes.find(n => n.id === "job:j9")).toBeUndefined();
  });

  it("caps sibling repairs per fault code", () => {
    const g = buildRemanGraph(
      [job("j1")],
      [
        entry(1, { faultCodes: ["C1391"], linkedJobIds: ["j1"] }),
        entry(2, { faultCodes: ["C1391"], linkedJobIds: ["j2"] }),
        entry(3, { faultCodes: ["C1391"], linkedJobIds: ["j3"] }),
        entry(4, { faultCodes: ["C1391"], linkedJobIds: ["j4"] }),
      ],
      { maxSiblingRepairsPerFaultCode: 1 },
    );
    const repairs = g.nodes.filter(n => n.kind === "repair").map(n => n.id);
    expect(repairs).toHaveLength(2); // the anchored repair:1 + exactly one sibling
  });

  it("a sibling repair citing a capped code is rejected even if its other code has room", () => {
    const g = buildRemanGraph(
      [job("j1")],
      [
        entry(1, { faultCodes: ["A"], linkedJobIds: ["j1"] }), // anchors A
        entry(2, { faultCodes: ["B"], linkedJobIds: ["j1"] }), // anchors B
        entry(3, { faultCodes: ["A"], linkedJobIds: ["j2"] }), // sibling, fills A's cap
        entry(4, { faultCodes: ["A", "B"], linkedJobIds: ["j3"] }), // A now full -> rejected
        entry(5, { faultCodes: ["B"], linkedJobIds: ["j4"] }), // B still has room -> admitted
      ],
      { maxSiblingRepairsPerFaultCode: 1 },
    );
    const repairs = g.nodes.filter(n => n.kind === "repair").map(n => n.id).sort();
    expect(repairs).toEqual(["repair:1", "repair:2", "repair:3", "repair:5"]);
  });

  it("honours the cause / fix / ecu fan-out toggles", () => {
    const kb = [entry(1, { faultCodes: ["F"], causeTags: ["c"], fixTags: ["x"], ecuRef: "E", linkedJobIds: ["j1"] })];
    const base = buildRemanGraph([job("j1")], kb);
    expect(base.nodes.some(n => n.kind === "cause")).toBe(true);
    expect(base.nodes.some(n => n.kind === "fix")).toBe(true);
    expect(base.nodes.some(n => n.kind === "ecu")).toBe(true);

    expect(buildRemanGraph([job("j1")], kb, { includeCause: false }).nodes.some(n => n.kind === "cause")).toBe(false);
    expect(buildRemanGraph([job("j1")], kb, { includeFix: false }).nodes.some(n => n.kind === "fix")).toBe(false);
    expect(buildRemanGraph([job("j1")], kb, { includeEcu: false }).nodes.some(n => n.kind === "ecu")).toBe(false);
  });

  it("adds an unlisted stub for a repair's other linked job, or nothing when includeUnlistedJobs is off", () => {
    const withStub = buildRemanGraph(
      [job("j1")],
      [entry(1, { faultCodes: ["X"], linkedJobIds: ["j1", "j5"] })],
    );
    expect(withStub.nodes.find(n => n.id === "job:j5")).toMatchObject({ unlisted: true, label: "#j5" });

    const noStub = buildRemanGraph(
      [job("j1")],
      [entry(1, { faultCodes: ["X"], linkedJobIds: ["j1", "j5"] })],
      { includeUnlistedJobs: false },
    );
    expect(noStub.nodes.find(n => n.id === "job:j5")).toBeUndefined();
    expect(edgeKey(noStub, "job-repair")).toEqual(["job:j1->repair:1"]);
  });

  it("excludes a knowledge entry that touches neither a listed job nor a surfaced fault code", () => {
    const g = buildRemanGraph(
      [job("j1", { family: null, clientName: null, vehicleModel: null })],
      [entry(9, { faultCodes: ["ZZZ"], linkedJobIds: ["someone-else"] })],
    );
    expect(ids(g)).toEqual(["job:j1"]);
  });

  it("normalises and de-dupes fault codes across entries (case + whitespace), first label wins", () => {
    const g = buildRemanGraph(
      [job("j1"), job("j2")],
      [
        entry(1, { faultCodes: [" c1391 "], linkedJobIds: ["j1"] }),
        entry(2, { faultCodes: ["C1391"], linkedJobIds: ["j2"] }),
      ],
    );
    const faults = g.nodes.filter(n => n.kind === "faultCode");
    expect(faults).toHaveLength(1);
    expect(faults[0]).toMatchObject({ id: "faultCode:C1391", label: "c1391", degree: 2 });
  });

  it("orders nodes hub-first and is deterministic", () => {
    const jobs = [job("b"), job("a")];
    const kb = [entry(1, { faultCodes: ["F"], causeTags: ["c"], linkedJobIds: ["a"] })];
    const first = buildRemanGraph(jobs, kb);
    const second = buildRemanGraph(jobs, kb);
    expect(first).toEqual(second);
    const kinds = first.nodes.map(n => n.kind);
    expect(kinds.indexOf("job")).toBeLessThan(kinds.indexOf("faultCode"));
    expect(kinds.indexOf("faultCode")).toBeLessThan(kinds.indexOf("repair"));
    expect(kinds.indexOf("repair")).toBeLessThan(kinds.indexOf("cause"));
  });
});

/* ── traversal ─────────────────────────────────────────────── */

describe("traversal helpers", () => {
  const g = buildRemanGraph(
    [job("j1", { clientName: null, vehicleModel: null, family: null }), job("j2", { clientName: null, vehicleModel: null, family: null })],
    [
      entry(1, { faultCodes: ["SHARED"], linkedJobIds: ["j1"] }),
      entry(2, { faultCodes: ["SHARED"], linkedJobIds: ["j2", "j3"] }),
      entry(5, { faultCodes: ["LONE"], linkedJobIds: ["only-unlisted"] }), // excluded entirely
    ],
  );

  it("graphNeighbors returns distinct one-hop nodes, [] for an unknown id", () => {
    const neigh = graphNeighbors(g, "faultCode:SHARED").map(n => n.id).sort();
    expect(neigh).toEqual(["repair:1", "repair:2"]);
    expect(graphNeighbors(g, "faultCode:NOPE")).toEqual([]);
  });

  it("egoGraph grows by hop count; depth<=0 or unknown id is empty", () => {
    expect(egoGraph(g, "job:j1", 0)).toEqual({ nodes: [], edges: [] });
    expect(egoGraph(g, "job:does-not-exist", 3)).toEqual({ nodes: [], edges: [] });
    const d1 = egoGraph(g, "job:j1", 1);
    expect(ids(d1)).toEqual(["job:j1", "repair:1"]);
    const d2 = egoGraph(g, "job:j1", 2);
    expect(ids(d2)).toEqual(["faultCode:SHARED", "job:j1", "repair:1"]);
    // job:j1 -> repair:1 -> faultCode:SHARED -> repair:2 (3 hops) -> job:j2/j3 (4).
    const d3 = egoGraph(g, "job:j1", 3);
    expect(ids(d3)).toEqual(["faultCode:SHARED", "job:j1", "repair:1", "repair:2"]);
    const d4 = egoGraph(g, "job:j1", 4);
    expect(ids(d4)).toEqual(expect.arrayContaining(["job:j2", "job:j3", "repair:2"]));
  });

  it("connectedGraph pulls the whole chain reachable across the shared fault code", () => {
    const comp = connectedGraph(g, "job:j1");
    expect(ids(comp)).toEqual(expect.arrayContaining(["job:j1", "job:j2", "job:j3", "faultCode:SHARED", "repair:1", "repair:2"]));
    expect(comp.nodes.find(n => n.id === "faultCode:LONE")).toBeUndefined();
  });
});

/* ── stats ─────────────────────────────────────────────────── */

describe("remanGraphStats", () => {
  it("tallies nodes per kind", () => {
    const g = buildRemanGraph(
      [job("j1")],
      [entry(1, { faultCodes: ["A", "B"], causeTags: ["c"], fixTags: ["f"], ecuRef: "E", linkedJobIds: ["j1"] })],
    );
    const s = remanGraphStats(g);
    expect(s.byKind.job).toBe(1);
    expect(s.byKind.faultCode).toBe(2);
    expect(s.byKind.repair).toBe(1);
    expect(s.byKind.cause).toBe(1);
    expect(s.byKind.fix).toBe(1);
    expect(s.byKind.ecu).toBe(1);
    expect(s.nodeCount).toBe(g.nodes.length);
    expect(s.edgeCount).toBe(g.edges.length);
  });
});

/* ── forceLayout ───────────────────────────────────────────── */

describe("forceLayout", () => {
  const W = 900;
  const H = 640;

  function grid(nodeCount: number, edgePairs: Array<[number, number]>): RemanGraph {
    return {
      nodes: Array.from({ length: nodeCount }, (_, i) => ({
        id: `n${i}`,
        kind: "job" as const,
        label: `n${i}`,
        degree: 0,
      })),
      edges: edgePairs.map(([a, b]) => ({
        id: `n${a}~n${b}`,
        source: `n${a}`,
        target: `n${b}`,
        kind: "job-repair" as const,
      })),
    };
  }

  it("echoes size and returns nothing for an empty graph", () => {
    expect(forceLayout({ nodes: [], edges: [] }, { width: W, height: H })).toEqual({
      nodes: [],
      edges: [],
      width: W,
      height: H,
    });
  });

  it("places a lone node near the centre, within bounds", () => {
    const { nodes } = forceLayout(grid(1, []), { width: W, height: H });
    expect(nodes[0].x).toBeGreaterThan(W / 2 - 40);
    expect(nodes[0].x).toBeLessThan(W / 2 + 40);
    expect(nodes[0].y).toBeGreaterThan(H / 2 - 40);
    expect(nodes[0].y).toBeLessThan(H / 2 + 40);
  });

  it("keeps every coordinate finite and the layout roughly centred (no clamp)", () => {
    const g = grid(24, Array.from({ length: 23 }, (_, i) => [i, i + 1] as [number, number]));
    const { nodes } = forceLayout(g, { width: W, height: H });
    for (const n of nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
    }
    // The centre pull keeps the centroid near (W/2, H/2) without a bounding box…
    const cx = nodes.reduce((s, n) => s + n.x, 0) / nodes.length;
    const cy = nodes.reduce((s, n) => s + n.y, 0) / nodes.length;
    expect(Math.hypot(cx - W / 2, cy - H / 2)).toBeLessThan(Math.min(W, H) / 2);
    // …and it doesn't run away.
    const maxR = Math.max(...nodes.map(n => Math.hypot(n.x - W / 2, n.y - H / 2)));
    expect(maxR).toBeLessThan(6 * Math.max(W, H));
  });

  it("is deterministic for a seed and varies when the seed changes", () => {
    const g = grid(12, [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7]]);
    const a1 = forceLayout(g, { width: W, height: H, seed: 42 }).nodes.map(n => [n.id, n.x, n.y]);
    const a2 = forceLayout(g, { width: W, height: H, seed: 42 }).nodes.map(n => [n.id, n.x, n.y]);
    const b = forceLayout(g, { width: W, height: H, seed: 7 }).nodes.map(n => [n.id, n.x, n.y]);
    expect(a1).toEqual(a2);
    expect(a1).not.toEqual(b);
  });

  it("preserves node identity and passes edges through untouched", () => {
    const g = grid(6, [[0, 1], [2, 3]]);
    const out = forceLayout(g, { width: W, height: H });
    expect(out.nodes.map(n => n.id)).toEqual(g.nodes.map(n => n.id));
    expect(out.edges).toEqual(g.edges);
  });

  it("an edge pulls two nodes closer than they settle with no edge", () => {
    const linked = forceLayout(grid(2, [[0, 1]]), { width: W, height: H, seed: 3 }).nodes;
    const free = forceLayout(grid(2, []), { width: W, height: H, seed: 3 }).nodes;
    const dist = (ns: typeof linked) => Math.hypot(ns[0].x - ns[1].x, ns[0].y - ns[1].y);
    expect(dist(linked)).toBeLessThan(dist(free));
  });

  it("spreads a path across the canvas instead of collapsing it", () => {
    const g = grid(9, Array.from({ length: 8 }, (_, i) => [i, i + 1] as [number, number]));
    const { nodes } = forceLayout(g, { width: W, height: H });
    const spanX = Math.max(...nodes.map(n => n.x)) - Math.min(...nodes.map(n => n.x));
    const spanY = Math.max(...nodes.map(n => n.y)) - Math.min(...nodes.map(n => n.y));
    expect(spanX > W * 0.2 || spanY > H * 0.2).toBe(true);
  });

  it("stays deterministic and finite on a big graph (iteration count scales down)", () => {
    const W2 = 1200;
    const H2 = 800;
    const n = 320;
    const g = grid(n, Array.from({ length: n - 1 }, (_, i) => [i, i + 1] as [number, number]));
    const a = forceLayout(g, { width: W2, height: H2 });
    const b = forceLayout(g, { width: W2, height: H2 });
    expect(a.nodes.map(m => [m.x, m.y])).toEqual(b.nodes.map(m => [m.x, m.y]));
    for (const m of a.nodes) {
      expect(Number.isFinite(m.x) && Number.isFinite(m.y)).toBe(true);
      expect(Math.hypot(m.x - W2 / 2, m.y - H2 / 2)).toBeLessThan(20 * Math.max(W2, H2));
    }
  });
});
