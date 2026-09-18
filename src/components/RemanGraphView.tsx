import { useState, useMemo, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MagnifyingGlassPlusIcon, MagnifyingGlassMinusIcon, ArrowsPointingOutIcon,
  ArrowPathIcon, XMarkIcon, ArrowTopRightOnSquareIcon, ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import {
  buildRemanGraph, forceLayout, egoGraph, graphNeighbors, remanGraphStats,
  type RemanGraphJob, type RemanGraphKnowledgeEntry, type BuildRemanGraphOptions,
  type RemanNodeKind, type RemanGraphNode, type RemanGraphEdgeKind,
} from '@/lib/remanGraph';
import { RemanForceSim } from '@/lib/remanForceSim';

// "Visual search" for the Interventions tab — an Obsidian-style graph of the
// current job search results wired to the Repair Knowledge Base: each job
// links to the fault codes it was closed against, every fault code fans back
// out to the other jobs that hit it, and on to the proven fixes.
//
//  - Layout: `forceLayout` (deterministic Fruchterman–Reingold, no clamp — the
//    canvas is effectively infinite; nodes near the edge are no longer flattened
//    into straight rows).
//  - Life: a `RemanForceSim` springs each node to its layout home. The pointer
//    shoves nearby nodes out of the way and they bounce back; dragging a node
//    makes it follow; a click kicks it so its neighbourhood jiggles. A rAF loop
//    reads sim positions each frame and writes them straight to the DOM (no
//    per-frame React render); it stops when everything comes to rest.
//  - Pan / zoom is a separate `{x,y,k}` transform on the root <g>.

const LAYOUT_W = 1500;
const LAYOUT_H = 980;
const MIN_K = 0.15;
const MAX_K = 2.75;
const FIT_PADDING = 64;
const CLICK_SLOP = 4;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const CTRL_BTN =
  'p-1.5 rounded-md bg-elevated border border-border text-text-secondary hover:text-text-primary transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50';
const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50';

type ToggleableKind = 'cause' | 'fix' | 'ecu' | 'client' | 'vehicle' | 'family';
type BooleanBuildOption =
  | 'includeCause' | 'includeFix' | 'includeEcu'
  | 'includeClient' | 'includeVehicle' | 'includeFamily';

const TOGGLEABLE_KINDS: readonly ToggleableKind[] = ['cause', 'fix', 'ecu', 'client', 'vehicle', 'family'];

const KIND_TO_OPTION: Record<ToggleableKind, BooleanBuildOption> = {
  cause: 'includeCause', fix: 'includeFix', ecu: 'includeEcu',
  client: 'includeClient', vehicle: 'includeVehicle', family: 'includeFamily',
};

const isToggleableKind = (kind: RemanNodeKind): kind is ToggleableKind =>
  (TOGGLEABLE_KINDS as readonly string[]).includes(kind);

// One theme token per kind — literal class strings so Tailwind's JIT keeps them.
// The bench-report "fault codes aren't errors, no red" rule is about the
// faultCode kind specifically; `cause` is the failure itself, so `danger` fits.
interface KindStyle { fill: string; dot: string; edge: string; r: number; pale?: boolean }
// Base radii bumped up (reported directly: "the balls are too small"). The
// largest possible radius here (job, 16 + the degree bonus below, capped at
// 8 = 24) stays under RemanForceSim's default `pointerDeadzone` (26) so the
// "no push right under the cursor" zone always covers the whole visible node.
const KIND_STYLE: Record<RemanNodeKind, KindStyle> = {
  job:       { fill: 'fill-accent',        dot: 'bg-accent',        edge: 'stroke-accent',        r: 16 },
  faultCode: { fill: 'fill-warning',       dot: 'bg-warning',       edge: 'stroke-warning',       r: 15 },
  repair:    { fill: 'fill-success',       dot: 'bg-success',       edge: 'stroke-success',       r: 13 },
  cause:     { fill: 'fill-danger',        dot: 'bg-danger',        edge: 'stroke-danger',        r: 10 },
  fix:       { fill: 'fill-success',       dot: 'bg-success',       edge: 'stroke-success',       r: 9, pale: true },
  ecu:       { fill: 'fill-subcontractor', dot: 'bg-subcontractor', edge: 'stroke-subcontractor', r: 10 },
  client:    { fill: 'fill-sold',          dot: 'bg-sold',          edge: 'stroke-sold',          r: 10 },
  vehicle:   { fill: 'fill-accent',        dot: 'bg-accent',        edge: 'stroke-accent',        r: 10, pale: true },
  family:    { fill: 'fill-warning',       dot: 'bg-warning',       edge: 'stroke-warning',       r: 10, pale: true },
};

const EDGE_STYLE: Record<RemanGraphEdgeKind, string> = {
  'job-repair': 'stroke-accent',
  'repair-faultCode': 'stroke-warning',
  'repair-cause': 'stroke-danger',
  'repair-fix': 'stroke-success',
  'repair-ecu': 'stroke-subcontractor',
  'job-client': 'stroke-sold',
  'job-vehicle': 'stroke-accent',
  'job-family': 'stroke-warning',
};

function nodeRadius(node: RemanGraphNode): number {
  return KIND_STYLE[node.kind].r + Math.min(8, (node.degree ?? 0) * 0.9);
}

interface Transform { x: number; y: number; k: number }
interface Pt { x: number; y: number }
interface Box { minX: number; minY: number; maxX: number; maxY: number }

function boxOf(points: readonly Pt[]): Box | null {
  if (points.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

/** Transform that frames `box` inside a `w x h` viewport with a margin. */
function computeFit(box: Box | null, w: number, h: number): Transform {
  if (!box || w <= 0 || h <= 0) return { x: 0, y: 0, k: 1 };
  const bw = Math.max(1, box.maxX - box.minX);
  const bh = Math.max(1, box.maxY - box.minY);
  const k = clamp(Math.min((w - FIT_PADDING * 2) / bw, (h - FIT_PADDING * 2) / bh), MIN_K, MAX_K);
  return { x: w / 2 - (k * (box.minX + box.maxX)) / 2, y: h / 2 - (k * (box.minY + box.maxY)) / 2, k };
}

/** Layout homes for the current visible graph, re-centred on the origin. */
function homesFor(nodeIds: string[], edges: Array<{ source: string; target: string }>): Map<string, Pt> {
  const laid = forceLayout(
    {
      nodes: nodeIds.map(id => ({ id, kind: 'job' as RemanNodeKind, label: id, degree: 0 })),
      edges: edges.map(e => ({ id: `${e.source}~${e.target}`, source: e.source, target: e.target, kind: 'job-repair' as RemanGraphEdgeKind })),
    },
    { width: LAYOUT_W, height: LAYOUT_H, seed: 1 },
  );
  const cx = laid.nodes.reduce((s, n) => s + n.x, 0) / (laid.nodes.length || 1);
  const cy = laid.nodes.reduce((s, n) => s + n.y, 0) / (laid.nodes.length || 1);
  const m = new Map<string, Pt>();
  for (const n of laid.nodes) m.set(n.id, { x: n.x - cx, y: n.y - cy });
  return m;
}

export interface RemanGraphViewProps {
  jobs: RemanGraphJob[];
  knowledgeEntries: RemanGraphKnowledgeEntry[];
  loadingLinks?: boolean;
  linksError?: string;
  onRetryLinks?: () => void;
  onOpenJob?: (jobId: string) => void;
}

export default function RemanGraphView({
  jobs, knowledgeEntries, loadingLinks, linksError, onRetryLinks, onOpenJob,
}: RemanGraphViewProps) {
  const { t } = useTranslation();

  const [hidden, setHidden] = useState<Set<RemanNodeKind>>(() => new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, k: 1 });
  const [size, setSize] = useState({ w: 1040, h: 600 });
  const [grabbing, setGrabbing] = useState(false);
  // Click-bounce ripples: node id -> increasing key (re-mounts the ripple).
  const [bounces, setBounces] = useState<Map<string, number>>(new Map());

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const rootGRef = useRef<SVGGElement>(null);
  const transformRef = useRef(transform);
  transformRef.current = transform;
  const userMovedRef = useRef(false);
  const refitPendingRef = useRef(true);
  const wheelPendingRef = useRef<Transform | null>(null);
  const wheelRafRef = useRef(0);

  const simRef = useRef<RemanForceSim | null>(null);
  const loopRef = useRef(0);
  const stoppedRef = useRef(false);
  const nodeEls = useRef(new Map<string, SVGGElement>());
  const edgeEls = useRef(new Map<string, SVGLineElement>());
  const edgesRef = useRef<Array<{ id: string; source: string; target: string }>>([]);
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const bounceTimers = useRef(new Set<number>());
  const bounceSeq = useRef(new Map<string, number>());

  /* ── graph model ─────────────────────────────────────────── */

  const buildOptions = useMemo<BuildRemanGraphOptions>(() => {
    const opts: BuildRemanGraphOptions = {};
    for (const kind of TOGGLEABLE_KINDS) if (hidden.has(kind)) opts[KIND_TO_OPTION[kind]] = false;
    return opts;
  }, [hidden]);

  const jobsSig = jobs.map(j => j.id).join(',');
  const kbSig = knowledgeEntries.map(e => `${e.id}:${e.linkedJobIds.length}:${e.faultCodes.length}`).join(',');

  const graph = useMemo(
    () => buildRemanGraph(jobs, knowledgeEntries, buildOptions),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- string sigs are the real deps
    [jobsSig, kbSig, buildOptions],
  );
  const displayGraph = useMemo(() => {
    if (!focusId || !graph.nodes.some(n => n.id === focusId)) return graph;
    return egoGraph(graph, focusId, 2);
  }, [graph, focusId]);

  edgesRef.current = displayGraph.edges;

  // Layout homes for the visible graph — available on the first render so
  // nodes never flash at the origin before the sim is built.
  const homes = useMemo(
    () => homesFor(displayGraph.nodes.map(n => n.id), displayGraph.edges),
    [displayGraph],
  );

  const stats = useMemo(() => remanGraphStats(graph), [graph]);
  const selectedNode = selectedId ? graph.nodes.find(n => n.id === selectedId) ?? null : null;
  const selectedConns = useMemo(
    () => (selectedId ? graphNeighbors(displayGraph, selectedId) : []),
    [displayGraph, selectedId],
  );
  const neighborIds = useMemo(() => new Set(selectedConns.map(n => n.id)), [selectedConns]);

  // Auto-fit frames the *layout* (the home positions), not live sim state, so
  // a node hand-dragged to a far corner never forces the whole view to zoom
  // out, and pointer jitter during settle-in can't skew the initial frame.
  const layoutBox = useCallback((): Box | null => boxOf([...homes.values()]), [homes]);
  // The explicit "Reset view" button frames everything actually on screen.
  const liveBox = useCallback((): Box | null => simRef.current?.bounds() ?? layoutBox(), [layoutBox]);
  const nodePos = useCallback(
    (id: string): Pt => simRef.current?.node(id) ?? homes.get(id) ?? { x: 0, y: 0 },
    [homes],
  );

  /* ── transform commit ────────────────────────────────────── */

  const applyRootTransform = useCallback((tr: Transform) => {
    rootGRef.current?.setAttribute('transform', `translate(${tr.x} ${tr.y}) scale(${tr.k})`);
  }, []);
  const commitTransform = useCallback((next: Transform) => {
    wheelPendingRef.current = null;
    if (wheelRafRef.current) { cancelAnimationFrame(wheelRafRef.current); wheelRafRef.current = 0; }
    applyRootTransform(next);
    setTransform(next);
  }, [applyRootTransform]);

  /* ── the animation loop ──────────────────────────────────── */

  const writeFrame = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return;
    for (const n of sim.nodes) {
      const el = nodeEls.current.get(n.id);
      if (el) el.setAttribute('transform', `translate(${n.x} ${n.y})`);
    }
    for (const e of edgesRef.current) {
      const el = edgeEls.current.get(e.id);
      if (!el) continue;
      const a = sim.node(e.source);
      const b = sim.node(e.target);
      if (!a || !b) continue;
      el.setAttribute('x1', String(a.x)); el.setAttribute('y1', String(a.y));
      el.setAttribute('x2', String(b.x)); el.setAttribute('y2', String(b.y));
    }
  }, []);

  const frame = useCallback(() => {
    loopRef.current = 0;
    const sim = simRef.current;
    if (!sim || stoppedRef.current) return;
    sim.tick(1);
    writeFrame();
    if (refitPendingRef.current && sim.settled && !userMovedRef.current) {
      refitPendingRef.current = false;
      commitTransform(computeFit(layoutBox(), sizeRef.current.w, sizeRef.current.h));
    }
    // `settled` already accounts for a resting pointer, so this alone keeps
    // the loop alive exactly while something is actually moving.
    if (!sim.settled) {
      loopRef.current = requestAnimationFrame(frame);
    }
  }, [writeFrame, commitTransform, layoutBox]);

  const startLoop = useCallback(() => {
    if (!loopRef.current) loopRef.current = requestAnimationFrame(frame);
  }, [frame]);

  /* ── (re)build the simulation when the visible graph changes ── */

  useEffect(() => {
    if (!simRef.current) simRef.current = new RemanForceSim(homes, { seed: 1 });
    else simRef.current.setHomes(homes);
    refitPendingRef.current = true;
    userMovedRef.current = false;
    writeFrame();
    startLoop();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `homes` identity is the dep; helpers are stable
  }, [homes]);

  useEffect(() => {
    if (selectedId && !simRef.current?.node(selectedId)) setSelectedId(null);
  }, [displayGraph, selectedId]);

  useEffect(() => {
    const timers = bounceTimers.current;
    return () => {
      stoppedRef.current = true;
      if (loopRef.current) cancelAnimationFrame(loopRef.current);
      if (wheelRafRef.current) cancelAnimationFrame(wheelRafRef.current);
      for (const id of timers) window.clearTimeout(id);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (selectedId) setSelectedId(null);
      else if (focusId) setFocusId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, focusId]);

  /* ── size ────────────────────────────────────────────────── */

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let raf = 0;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) setSize(prev => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(() => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; measure(); });
    });
    ro.observe(el);
    return () => { if (raf) cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  useEffect(() => {
    if (!userMovedRef.current) commitTransform(computeFit(layoutBox(), size.w, size.h));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reframe on real size change only
  }, [size.w, size.h]);

  /* ── pointer: gesture (pan / node-drag) + hover repel ─────── */

  const toGraph = useCallback((clientX: number, clientY: number, tr: Transform = transformRef.current): Pt => {
    const rect = svgRef.current?.getBoundingClientRect();
    const sx = clientX - (rect?.left ?? 0);
    const sy = clientY - (rect?.top ?? 0);
    return { x: (sx - tr.x) / tr.k, y: (sy - tr.y) / tr.k };
  }, []);

  const gesture = useRef<null | {
    pointerId: number;
    mode: 'pan' | 'node';
    nodeId?: string;
    sx: number; sy: number;
    tx: number; ty: number; tk: number;
    px: number; py: number; // previous client pos, for fling velocity
    moved: boolean;
    pendingT?: Transform;
  }>(null);

  const capture = (id: number) => { try { svgRef.current?.setPointerCapture(id); } catch { /* jsdom */ } };
  const releaseCapture = (id: number) => { try { svgRef.current?.releasePointerCapture(id); } catch { /* jsdom */ } };

  const beginGesture = (e: React.PointerEvent, nodeId?: string) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (gesture.current) return;
    e.stopPropagation();
    const tr = wheelPendingRef.current ?? transformRef.current;
    if (wheelPendingRef.current) commitTransform(wheelPendingRef.current);
    gesture.current = {
      pointerId: e.pointerId,
      mode: nodeId ? 'node' : 'pan',
      nodeId,
      sx: e.clientX, sy: e.clientY,
      tx: tr.x, ty: tr.y, tk: tr.k,
      px: e.clientX, py: e.clientY,
      moved: false,
    };
    if (nodeId) { simRef.current?.grab(nodeId); startLoop(); }
    capture(e.pointerId);
    setGrabbing(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (g && e.pointerId !== g.pointerId) return;
    const dx = g ? e.clientX - g.sx : 0;
    const dy = g ? e.clientY - g.sy : 0;
    if (g && !g.moved && Math.hypot(dx, dy) <= CLICK_SLOP) return;
    if (g) { g.moved = true; g.px = e.clientX; g.py = e.clientY; }

    if (g?.mode === 'pan') {
      const next = { x: g.tx + dx, y: g.ty + dy, k: g.tk };
      g.pendingT = next;
      applyRootTransform(next);
    } else if (g?.nodeId) {
      const p = toGraph(e.clientX, e.clientY);
      simRef.current?.dragTo(g.nodeId, p.x, p.y);
      writeFrame(); // instant, without waiting for the next rAF tick
    }

    // The repulsion "dent" tracks the cursor whenever it's over the canvas —
    // hovering, panning, or dragging — so it never leaves a stale dent behind.
    // During a pan it uses the *in-progress* transform so it doesn't lag.
    if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
      const tr = g?.pendingT ?? wheelPendingRef.current ?? transformRef.current;
      const p = toGraph(e.clientX, e.clientY, tr);
      simRef.current?.setPointer(p.x, p.y);
      startLoop();
    }
  };

  const endGesture = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || (e.pointerId !== g.pointerId && e.type !== 'lostpointercapture')) return;
    gesture.current = null;
    releaseCapture(g.pointerId);
    setGrabbing(false);

    if (!g.moved) {
      if (g.nodeId) {
        const id = g.nodeId;
        simRef.current?.release(id);
        // a little pop + ripple on click-select
        simRef.current?.kick(id, 0, -14);
        const seq = (bounceSeq.current.get(id) ?? 0) + 1;
        bounceSeq.current.set(id, seq);
        setBounces(prev => new Map(prev).set(id, seq));
        const tid = window.setTimeout(() => {
          bounceTimers.current.delete(tid);
          setBounces(prev => {
            if (prev.get(id) !== seq) return prev; // a newer click owns it now
            const next = new Map(prev);
            next.delete(id);
            return next;
          });
        }, 640);
        bounceTimers.current.add(tid);
        startLoop();
        setSelectedId(cur => (cur === id ? null : id));
      } else {
        setSelectedId(null);
      }
      return;
    }
    if (g.mode === 'pan' && g.pendingT) {
      userMovedRef.current = true;
      commitTransform(g.pendingT);
    } else if (g.mode === 'node' && g.nodeId) {
      const tk = transformRef.current.k || 1;
      const flingX = clamp((e.clientX - g.px) / tk, -18, 18);
      const flingY = clamp((e.clientY - g.py) / tk, -18, 18);
      // `stick` — a hand-dragged node stays where it was dropped, even across
      // a later re-layout (Obsidian-style).
      simRef.current?.release(g.nodeId, flingX, flingY, true);
      startLoop();
    }
  };

  const onPointerLeave = () => {
    // Drop the dent and let the pushed-aside nodes spring home.
    simRef.current?.clearPointer();
    startLoop();
  };

  /* ── wheel zoom ──────────────────────────────────────────── */

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      const base = wheelPendingRef.current ?? transformRef.current;
      const step = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      const k = clamp(base.k * Math.exp(-step * 0.0016), MIN_K, MAX_K);
      if (k === base.k) return;
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const next: Transform = { x: sx - ((sx - base.x) / base.k) * k, y: sy - ((sy - base.y) / base.k) * k, k };
      wheelPendingRef.current = next;
      userMovedRef.current = true;
      applyRootTransform(next);
      if (!wheelRafRef.current) {
        wheelRafRef.current = requestAnimationFrame(() => {
          wheelRafRef.current = 0;
          if (wheelPendingRef.current) setTransform(wheelPendingRef.current);
        });
      }
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [applyRootTransform]);

  const zoomBy = (mult: number) => {
    const base = wheelPendingRef.current ?? transformRef.current;
    const k = clamp(base.k * mult, MIN_K, MAX_K);
    const cx = size.w / 2;
    const cy = size.h / 2;
    userMovedRef.current = true;
    commitTransform({ x: cx - ((cx - base.x) / base.k) * k, y: cy - ((cy - base.y) / base.k) * k, k });
  };
  // "Reset view" — also un-sticks any hand-placed nodes and springs the whole
  // graph back onto its layout, then frames it.
  const fitView = () => {
    userMovedRef.current = false;
    const sim = simRef.current;
    if (sim?.hasCustomHomes) {
      sim.clearCustomHomes();
      sim.setHomes(homes);
      startLoop();
      refitPendingRef.current = true; // reframe once it re-settles
    }
    commitTransform(computeFit(liveBox(), size.w, size.h));
  };

  const toggleKind = (kind: RemanNodeKind) => {
    setHidden(prev => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  const setNodeEl = useCallback((id: string, el: SVGGElement | null) => {
    if (el) nodeEls.current.set(id, el);
    else nodeEls.current.delete(id);
  }, []);
  const setEdgeEl = useCallback((id: string, el: SVGLineElement | null) => {
    if (el) edgeEls.current.set(id, el);
    else edgeEls.current.delete(id);
  }, []);

  /* ── render ──────────────────────────────────────────────── */

  const KIND_LABEL: Record<RemanNodeKind, string> = {
    job: t('reman.graph_kind_job'),
    repair: t('reman.graph_kind_repair'),
    faultCode: t('reman.graph_kind_faultCode'),
    cause: t('reman.graph_kind_cause'),
    fix: t('reman.graph_kind_fix'),
    client: t('reman.graph_kind_client'),
    vehicle: t('reman.graph_kind_vehicle'),
    family: t('reman.graph_kind_family'),
    ecu: t('reman.graph_kind_ecu'),
  };
  const legendKinds = (Object.keys(KIND_LABEL) as RemanNodeKind[]).filter(k => stats.byKind[k] > 0 || hidden.has(k));

  const k = transform.k;
  const labelThreshold = k > 1.05 ? 0 : k > 0.7 ? 3 : 5;
  const showLabel = (n: RemanGraphNode) =>
    n.kind === 'job' || n.kind === 'faultCode'
    || n.id === selectedId || neighborIds.has(n.id)
    || (n.degree ?? 0) >= labelThreshold;

  if (jobs.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card/40 text-center py-16">
        <p className="text-sm text-text-tertiary">{t('reman.graph_no_jobs')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-text-tertiary px-0.5">{t('reman.graph_hint')}</p>

      <div className="flex flex-wrap items-center gap-1.5">
        {legendKinds.map(kind => {
          const isToggleable = isToggleableKind(kind);
          const isHidden = hidden.has(kind);
          return (
            <button
              key={kind}
              type="button"
              aria-label={KIND_LABEL[kind]}
              aria-pressed={isToggleable ? !isHidden : undefined}
              disabled={!isToggleable}
              onClick={() => isToggleable && toggleKind(kind)}
              className={[
                'flex items-center gap-1.5 text-[10px] font-medium px-2 py-1 rounded-md border transition-colors',
                FOCUS_RING,
                isHidden
                  ? 'bg-card border-border text-text-tertiary line-through'
                  : 'bg-elevated border-border text-text-secondary',
                isToggleable ? 'hover:text-text-primary cursor-pointer' : 'cursor-default',
              ].join(' ')}
              title={isToggleable ? t('reman.graph_toggle_kind') : undefined}
            >
              <span className={`w-2 h-2 rounded-full ${KIND_STYLE[kind].dot} ${isHidden ? 'opacity-40' : KIND_STYLE[kind].pale ? 'opacity-60' : ''}`} />
              {KIND_LABEL[kind]}
              <span className="text-text-tertiary">{stats.byKind[kind]}</span>
            </button>
          );
        })}
      </div>

      <div
        ref={wrapRef}
        className="relative w-full h-[68vh] min-h-[480px] max-h-[860px] rounded-xl border border-border bg-card overflow-hidden"
      >
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
          {focusId && (
            <button
              type="button"
              onClick={() => setFocusId(null)}
              className={`text-[10px] font-semibold px-2 py-1 rounded-md bg-accent text-white hover:bg-accent/90 transition-colors ${FOCUS_RING}`}
            >
              {t('reman.graph_show_all')}
            </button>
          )}
          <span
            data-testid="graph-zoom-level"
            className="text-[10px] tabular-nums text-text-tertiary bg-card/80 border border-border rounded-md px-1.5 py-1 select-none"
          >
            {Math.round(k * 100)}%
          </span>
          <button type="button" aria-label={t('reman.graph_zoom_out')} onClick={() => zoomBy(1 / 1.25)} className={CTRL_BTN}>
            <MagnifyingGlassMinusIcon className="w-3.5 h-3.5" />
          </button>
          <button type="button" aria-label={t('reman.graph_zoom_in')} onClick={() => zoomBy(1.25)} className={CTRL_BTN}>
            <MagnifyingGlassPlusIcon className="w-3.5 h-3.5" />
          </button>
          <button type="button" aria-label={t('reman.graph_reset_view')} onClick={fitView} className={CTRL_BTN}>
            <ArrowsPointingOutIcon className="w-3.5 h-3.5" />
          </button>
        </div>

        {loadingLinks && (
          <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 text-[10px] text-text-tertiary bg-card/80 border border-border rounded-md px-2 py-1">
            <ArrowPathIcon className="w-3 h-3 animate-spin" />
            {t('reman.graph_loading_links')}
          </div>
        )}
        {linksError && (
          <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 text-[10px] text-danger bg-danger/10 border border-danger/20 rounded-md px-2 py-1">
            <ExclamationTriangleIcon className="w-3 h-3" />
            {t('reman.graph_links_error')}
            {onRetryLinks && (
              <button type="button" onClick={onRetryLinks} className={`underline hover:no-underline font-semibold ${FOCUS_RING}`}>
                {t('reman.graph_retry')}
              </button>
            )}
          </div>
        )}

        <svg
          ref={svgRef}
          data-testid="reman-graph"
          width={size.w}
          height={size.h}
          className="block touch-none select-none animate-fade-in"
          style={{ cursor: grabbing ? 'grabbing' : 'grab' }}
          onPointerDown={e => beginGesture(e)}
          onPointerMove={onPointerMove}
          onPointerUp={endGesture}
          onPointerCancel={endGesture}
          onPointerLeave={onPointerLeave}
          onLostPointerCapture={endGesture}
          onDoubleClick={fitView}
        >
          <g ref={rootGRef} transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}>
            {displayGraph.edges.map(e => {
              const a = nodePos(e.source);
              const b = nodePos(e.target);
              const incident = selectedId != null && (e.source === selectedId || e.target === selectedId);
              const dim = selectedId != null && !incident;
              return (
                <line
                  key={e.id}
                  ref={el => setEdgeEl(e.id, el)}
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  className={incident ? 'stroke-accent' : EDGE_STYLE[e.kind]}
                  strokeWidth={(incident ? 2 : 1.1) / k}
                  strokeOpacity={dim ? 0.08 : incident ? 0.85 : 0.32}
                />
              );
            })}
            {displayGraph.nodes.map(n => {
              const p = nodePos(n.id);
              const st = KIND_STYLE[n.kind];
              const r = nodeRadius(n);
              const isSel = n.id === selectedId;
              const dim = selectedId != null && !isSel && !neighborIds.has(n.id);
              const label = n.label.length > 24 ? `${n.label.slice(0, 23)}…` : n.label;
              const bounceKey = bounces.get(n.id);
              return (
                <g
                  key={n.id}
                  ref={el => setNodeEl(n.id, el)}
                  data-node-id={n.id}
                  role="button"
                  aria-label={`${KIND_LABEL[n.kind]}: ${n.label}`}
                  transform={`translate(${p.x} ${p.y})`}
                  style={{ cursor: 'grab', opacity: dim ? 0.22 : 1, transition: 'opacity 0.2s' }}
                  onPointerDown={ev => beginGesture(ev, n.id)}
                  onDoubleClick={ev => { ev.stopPropagation(); setFocusId(n.id); setSelectedId(n.id); }}
                >
                  {bounceKey !== undefined && (
                    <circle
                      key={`ripple-${bounceKey}`}
                      r={r}
                      className={`${st.fill} animate-graph-ripple pointer-events-none`}
                      style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                    />
                  )}
                  <circle
                    r={r}
                    className={`${st.fill} stroke-card ${bounceKey !== undefined ? 'animate-graph-pop' : ''}`}
                    style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                    strokeWidth={(isSel ? 3 : 1.5) / k}
                    fillOpacity={n.unlisted ? 0.35 : st.pale ? 0.6 : 1}
                    strokeDasharray={n.kind === 'job' && n.unlisted ? `${4 / k} ${3 / k}` : undefined}
                  />
                  {isSel && (
                    <circle r={r + 6 / k} className={`fill-none ${st.edge}`} strokeWidth={1.75 / k} strokeOpacity={0.8} />
                  )}
                  {showLabel(n) && (
                    <text
                      x={0}
                      y={r + 4 + 11 / k}
                      textAnchor="middle"
                      className={n.kind === 'faultCode' || n.kind === 'job' ? 'fill-text-primary' : 'fill-text-secondary'}
                      style={{
                        fontSize: 11 / k,
                        fontWeight: n.kind === 'job' || n.kind === 'faultCode' ? 600 : 400,
                        pointerEvents: 'none',
                        paintOrder: 'stroke',
                        stroke: 'var(--color-card)',
                        strokeWidth: 3 / k,
                        strokeLinejoin: 'round',
                      }}
                    >
                      {label}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {selectedNode && (
          <div className="absolute bottom-3 left-3 z-10 w-72 max-h-[70%] overflow-y-auto rounded-lg border border-border bg-card/95 backdrop-blur-sm shadow-lg p-2.5 space-y-2 animate-slide-up">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wide text-text-tertiary">
                  <span className={`w-2 h-2 rounded-full ${KIND_STYLE[selectedNode.kind].dot} ${KIND_STYLE[selectedNode.kind].pale ? 'opacity-60' : ''}`} />
                  {KIND_LABEL[selectedNode.kind]}
                  {selectedNode.kind === 'job' && selectedNode.unlisted && ` · ${t('reman.graph_unlisted_job')}`}
                </span>
                <p className="text-xs font-semibold text-text-primary break-words">{selectedNode.label}</p>
                {selectedNode.sub && <p className="text-[10px] text-text-tertiary break-words">{selectedNode.sub}</p>}
              </div>
              <button type="button" aria-label={t('reman.graph_close_panel')} onClick={() => setSelectedId(null)}
                className={`shrink-0 text-text-tertiary hover:text-text-primary transition-colors ${FOCUS_RING}`}>
                <XMarkIcon className="w-3.5 h-3.5" />
              </button>
            </div>

            <p className="text-[10px] text-text-tertiary">{t('reman.graph_degree', { count: selectedConns.length })}</p>

            <div className="flex flex-wrap gap-1.5">
              {selectedNode.kind === 'job' && selectedNode.jobId && onOpenJob && (
                <button
                  type="button"
                  onClick={() => onOpenJob(selectedNode.jobId as string)}
                  className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md bg-accent text-white hover:bg-accent/90 transition-colors ${FOCUS_RING}`}
                >
                  <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                  {t('reman.graph_open_job')}
                </button>
              )}
              <button
                type="button"
                onClick={() => setFocusId(f => (f === selectedNode.id ? null : selectedNode.id))}
                className={`text-[10px] font-medium px-2 py-1 rounded-md bg-elevated border border-border text-text-secondary hover:text-text-primary transition-colors ${FOCUS_RING}`}
              >
                {focusId === selectedNode.id ? t('reman.graph_show_all') : t('reman.graph_focus')}
              </button>
            </div>

            {selectedConns.length > 0 && (() => {
              const byKind = new Map<RemanNodeKind, RemanGraphNode[]>();
              for (const c of selectedConns) {
                const list = byKind.get(c.kind) ?? [];
                list.push(c);
                byKind.set(c.kind, list);
              }
              return (
                <div className="space-y-1.5 pt-1 border-t border-border">
                  <span className="text-[9px] font-semibold uppercase tracking-wide text-text-tertiary">
                    {t('reman.graph_connections')}
                  </span>
                  {[...byKind.entries()].map(([kind, list]) => (
                    <div key={kind}>
                      <span className="text-[9px] text-text-tertiary">{KIND_LABEL[kind]}</span>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {list.slice(0, 16).map(c => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setSelectedId(c.id)}
                            className={`text-[10px] px-1.5 py-0.5 rounded bg-elevated border border-border text-text-secondary hover:text-text-primary transition-colors max-w-[9rem] truncate ${FOCUS_RING}`}
                          >
                            {c.label}
                          </button>
                        ))}
                        {list.length > 16 && <span className="text-[9px] text-text-tertiary self-center">+{list.length - 16}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
