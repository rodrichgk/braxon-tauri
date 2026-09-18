// Interaction physics for the REMAN visual-search graph.
//
// The *layout* is still the deterministic Fruchterman–Reingold pass in
// remanGraph.ts (`forceLayout`) — it already produces the organic radial
// spread you can see in the middle of the graph. What was wrong before was
// the hard bounding-box clamp that flattened everything near the edges into
// straight rows; that clamp is gone, so the canvas now behaves as if it were
// infinite.
//
// This module adds *life* on top of that fixed layout, without a full n-body
// simulation to fight the layout for control:
//  - every node is a damped spring anchored to its layout position ("home");
//  - the pointer pushes nearby nodes off their home — they slide out of the
//    way and spring back when it leaves;
//  - a grabbed node follows the cursor; a click `kick`s a node so it and its
//    neighbours bounce.
//
// The pointer push is a "bump", not a monotonic repel: it's zero right at the
// pointer, rises over `pointerDeadzone..pointerRadius`, and falls back to zero
// at `pointerRadius`. Reported directly: with a plain repel (strongest at
// d=0) a node fled fastest exactly as the cursor closed in on it, so it could
// never actually be clicked. With the bump, a node in your approach path
// dodges aside while you're still some distance off, then — once the cursor
// is within `pointerDeadzone` of it, i.e. once you're basically hovering it —
// the push switches off and it holds still to be clicked.
// It's framework-agnostic and deterministic (seeded initial jitter, no
// randomness in `tick`), so the physics is unit-tested here and
// src/components/RemanGraphView.tsx is just a rAF loop reading positions.

export interface SimNode {
  id: string;
  /** Current position. */
  x: number;
  y: number;
  /** Current velocity. */
  vx: number;
  vy: number;
  /** Anchor ("home") position from the layout. */
  hx: number;
  hy: number;
}

export interface RemanForceSimOptions {
  seed?: number;
  /** Spring stiffness pulling a node back to its home. Default `0.045`. */
  stiffness?: number;
  /** Fraction of velocity kept per tick (friction). Default `0.82`. */
  damping?: number;
  /** Outer radius of the pointer push. Default `150`. */
  pointerRadius?: number;
  /** Inner radius, centred on the pointer, that feels **no** push — this is
   *  what keeps the node your cursor is actually over clickable. Should be at
   *  least as large as the biggest node's drawn radius. Default `26`. */
  pointerDeadzone?: number;
  /** Peak strength of the pointer push (reached mid-way between the deadzone
   *  and the outer radius). Default `28`. */
  pointerStrength?: number;
  /** Random velocity each node gets on creation, for a lively settle-in.
   *  Default `7`. */
  spawnKick?: number;
  /** A node is "at rest" below this speed and this distance from home.
   *  Default `0.06` / `0.4`. */
  restSpeed?: number;
  restOffset?: number;
}

type Req = Required<RemanForceSimOptions>;
const DEFAULTS: Req = {
  seed: 1,
  stiffness: 0.045,
  damping: 0.82,
  pointerRadius: 150,
  pointerDeadzone: 26,
  pointerStrength: 28,
  spawnKick: 7,
  restSpeed: 0.06,
  restOffset: 0.4,
};

const MAX_SPEED = 60; // px/tick — guards against a pathological spike

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RemanForceSim {
  private readonly opt: Req;
  private nodesById = new Map<string, SimNode>();
  private pinned = new Set<string>();
  /** Nodes the user hand-placed (via `release`) — their home is left where
   *  it was dropped across `setHomes` re-layouts, Obsidian-style. */
  private customHome = new Set<string>();
  private pointer: { x: number; y: number } | null = null;
  private rand: () => number;

  constructor(homes: ReadonlyMap<string, { x: number; y: number }> = new Map(), options: RemanForceSimOptions = {}) {
    this.opt = { ...DEFAULTS, ...options };
    this.rand = mulberry32(this.opt.seed);
    this.setHomes(homes);
  }

  /** Update anchor positions after a re-layout. Survivors keep their current
   *  position/velocity and let the spring ease them to the new home (unless
   *  they were hand-placed, in which case their home stays put); new nodes
   *  spawn at their home with a small random kick. */
  setHomes(homes: ReadonlyMap<string, { x: number; y: number }>): void {
    for (const id of [...this.nodesById.keys()]) {
      if (!homes.has(id)) {
        this.nodesById.delete(id);
        this.pinned.delete(id);
        this.customHome.delete(id);
      }
    }
    for (const [id, h] of homes) {
      const existing = this.nodesById.get(id);
      if (existing) {
        if (!this.customHome.has(id)) {
          existing.hx = h.x;
          existing.hy = h.y;
        }
      } else {
        const k = this.opt.spawnKick;
        this.nodesById.set(id, {
          id,
          x: h.x,
          y: h.y,
          vx: (this.rand() - 0.5) * 2 * k,
          vy: (this.rand() - 0.5) * 2 * k,
          hx: h.x,
          hy: h.y,
        });
      }
    }
  }

  /** Advance one step. `dt` scales the step (default 1). */
  tick(dt = 1): void {
    const o = this.opt;
    for (const n of this.nodesById.values()) {
      if (this.pinned.has(n.id)) { n.vx = 0; n.vy = 0; continue; }

      // Spring toward home.
      let ax = (n.hx - n.x) * o.stiffness;
      let ay = (n.hy - n.y) * o.stiffness;

      // Pointer repulsion (not spring-scaled — works even when at rest). A
      // "bump" shape: zero inside `pointerDeadzone`, rising to `pointerStrength`
      // at the midpoint of the band, back to zero at `pointerRadius` — see the
      // file header for why it isn't strongest at d=0.
      if (this.pointer) {
        const dx = n.x - this.pointer.x;
        const dy = n.y - this.pointer.y;
        const d = Math.hypot(dx, dy);
        const band = o.pointerRadius - o.pointerDeadzone;
        if (band > 0 && d > o.pointerDeadzone && d < o.pointerRadius) {
          const t = (d - o.pointerDeadzone) / band;
          const shape = Math.sin(Math.PI * t); // 0 → 1 → 0 across the band
          const push = (o.pointerStrength * shape) / d;
          ax += dx * push;
          ay += dy * push;
        }
      }

      n.vx = (n.vx + ax * dt) * o.damping;
      n.vy = (n.vy + ay * dt) * o.damping;

      const sp = Math.hypot(n.vx, n.vy);
      if (sp > MAX_SPEED) { n.vx = (n.vx / sp) * MAX_SPEED; n.vy = (n.vy / sp) * MAX_SPEED; }

      n.x += n.vx * dt;
      n.y += n.vy * dt;
      if (!Number.isFinite(n.x)) { n.x = n.hx; n.vx = 0; }
      if (!Number.isFinite(n.y)) { n.y = n.hy; n.vy = 0; }
    }
  }

  get nodes(): SimNode[] {
    return [...this.nodesById.values()];
  }

  node(id: string): SimNode | undefined {
    return this.nodesById.get(id);
  }

  /** Nothing is moving and nothing is being dragged, so a render loop can
   *  stop. A parked pointer that is holding some node off its home still
   *  counts as settled *once that node stops moving* — otherwise a cursor
   *  merely resting over the graph would pin the animation loop at 60fps.
   *  The component restarts the loop on the next `setPointer`. */
  get settled(): boolean {
    if (this.pinned.size > 0) return false;
    const hasPointer = this.pointer !== null;
    for (const n of this.nodesById.values()) {
      if (Math.hypot(n.vx, n.vy) > this.opt.restSpeed) return false;
      if (!hasPointer && Math.hypot(n.x - n.hx, n.y - n.hy) > this.opt.restOffset) return false;
    }
    return true;
  }

  setPointer(x: number, y: number): void {
    this.pointer = { x, y };
  }

  clearPointer(): void {
    this.pointer = null;
  }

  grab(id: string): void {
    const n = this.nodesById.get(id);
    if (!n) return;
    this.pinned.add(id);
    n.vx = 0;
    n.vy = 0;
  }

  dragTo(id: string, x: number, y: number): void {
    const n = this.nodesById.get(id);
    if (n) { n.x = x; n.y = y; n.vx = 0; n.vy = 0; }
  }

  /** Un-pin a grabbed node, with an optional fling velocity. When `stick`,
   *  its home snaps to where it was dropped and stays there across later
   *  `setHomes` re-layouts (Obsidian-style); otherwise it springs back to
   *  its layout home. */
  release(id: string, vx = 0, vy = 0, stick = false): void {
    this.pinned.delete(id);
    const n = this.nodesById.get(id);
    if (!n) return;
    n.vx = vx;
    n.vy = vy;
    if (stick) {
      n.hx = n.x;
      n.hy = n.y;
      this.customHome.add(id);
    }
  }

  /** Forget every hand-placed home, so the next `setHomes` pulls those nodes
   *  back onto the layout ("reset arrangement"). */
  clearCustomHomes(): void {
    this.customHome.clear();
  }

  /** Any nodes been hand-placed? */
  get hasCustomHomes(): boolean {
    return this.customHome.size > 0;
  }

  /** Impulse — a click bounce. The node leaves home and springs back. */
  kick(id: string, vx: number, vy: number): void {
    const n = this.nodesById.get(id);
    if (n) { n.vx += vx; n.vy += vy; }
  }

  bounds(): { minX: number; minY: number; maxX: number; maxY: number } | null {
    const ns = this.nodes;
    if (ns.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of ns) {
      if (n.x < minX) minX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.x > maxX) maxX = n.x;
      if (n.y > maxY) maxY = n.y;
    }
    return { minX, minY, maxX, maxY };
  }
}
