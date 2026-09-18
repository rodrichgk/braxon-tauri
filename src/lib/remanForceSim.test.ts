import { describe, it, expect } from "vitest";
import { RemanForceSim } from "@/lib/remanForceSim";

/** `n` homes laid out on a horizontal line, `gap` apart, centred on origin. */
function lineHomes(n: number, gap = 90): Map<string, { x: number; y: number }> {
  const m = new Map<string, { x: number; y: number }>();
  for (let i = 0; i < n; i++) m.set(`n${i}`, { x: (i - (n - 1) / 2) * gap, y: 0 });
  return m;
}
const settle = (sim: RemanForceSim, ticks = 300) => { for (let i = 0; i < ticks; i++) sim.tick(1); };
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe("RemanForceSim", () => {
  it("handles an empty sim", () => {
    const sim = new RemanForceSim();
    expect(sim.nodes).toEqual([]);
    expect(() => sim.tick()).not.toThrow();
    expect(sim.bounds()).toBeNull();
    expect(sim.settled).toBe(true);
  });

  it("is deterministic for a given seed", () => {
    const a = new RemanForceSim(lineHomes(12), { seed: 4 });
    const b = new RemanForceSim(lineHomes(12), { seed: 4 });
    settle(a, 120);
    settle(b, 120);
    expect(a.nodes.map(n => [n.x, n.y])).toEqual(b.nodes.map(n => [n.x, n.y]));
    // A different seed diverges.
    const c = new RemanForceSim(lineHomes(12), { seed: 99 });
    settle(c, 120);
    expect(a.nodes.map(n => [n.x, n.y])).not.toEqual(c.nodes.map(n => [n.x, n.y]));
  });

  it("springs every node back to its home and comes to rest", () => {
    const homes = lineHomes(10);
    const sim = new RemanForceSim(homes, { seed: 2 });
    expect(sim.settled).toBe(false); // spawn kick
    settle(sim, 400);
    expect(sim.settled).toBe(true);
    for (const n of sim.nodes) {
      const h = homes.get(n.id)!;
      expect(dist(n, h)).toBeLessThan(0.5);
    }
  });

  it("with no spawn kick it is at rest immediately", () => {
    const sim = new RemanForceSim(lineHomes(6), { spawnKick: 0 });
    expect(sim.settled).toBe(true);
    sim.tick();
    expect(sim.settled).toBe(true);
  });

  it("keeps every coordinate finite through a long run", () => {
    const sim = new RemanForceSim(lineHomes(40), { seed: 3 });
    settle(sim, 600);
    for (const n of sim.nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
      expect(Number.isFinite(n.vx)).toBe(true);
    }
  });

  it("pushes nodes away from the pointer (from outside the deadzone), and they return once it leaves", () => {
    const homes = lineHomes(9);
    const sim = new RemanForceSim(homes, { seed: 4 });
    settle(sim, 300);
    const target = sim.node("n4")!;
    const home = homes.get("n4")!;
    expect(dist(target, home)).toBeLessThan(0.5);

    sim.setPointer(home.x + 60, home.y); // inside pointerRadius, past the deadzone
    for (let i = 0; i < 8; i++) sim.tick(1);
    const pushed = dist(target, home);
    expect(pushed).toBeGreaterThan(10); // shoved out of the way
    expect(sim.settled).toBe(false);   // still in motion

    sim.clearPointer();
    settle(sim, 400);
    expect(dist(target, home)).toBeLessThan(0.5); // sprang back home
  });

  it("a parked pointer over empty space lets the sim settle (no idle loop)", () => {
    const sim = new RemanForceSim(lineHomes(6), { spawnKick: 0 });
    sim.setPointer(50_000, 50_000); // nowhere near any node
    settle(sim, 60);
    expect(sim.settled).toBe(true);
  });

  it("a pointer parked next to a node settles once the node stops dodging", () => {
    const homes = lineHomes(6);
    const sim = new RemanForceSim(homes, { spawnKick: 0 });
    const home = homes.get("n2")!;
    sim.setPointer(home.x + 60, home.y); // past the deadzone, so it gets shoved
    settle(sim, 400);
    expect(sim.settled).toBe(true);                 // no longer moving
    expect(dist(sim.node("n2")!, home)).toBeGreaterThan(5); // …but held off its home
  });

  it("a pointer resting inside the deadzone applies no push at all (so the node under it stays clickable)", () => {
    // An isolated node (no neighbours close enough to also feel the pointer),
    // so this only exercises the deadzone itself.
    const homes = new Map([["solo", { x: 0, y: 0 }]]);
    const sim = new RemanForceSim(homes, { spawnKick: 0 });
    // Well within the default 26-unit deadzone — comparable to a node's own
    // drawn radius, i.e. "the cursor is basically hovering the node".
    sim.setPointer(8, 4);
    for (let i = 0; i < 10; i++) sim.tick(1);
    const n = sim.node("solo")!;
    expect(n.x).toBe(0);
    expect(n.y).toBe(0);
    expect(n.vx).toBe(0);
    expect(n.vy).toBe(0);
  });

  it("release without stick springs the node back; with stick it stays put", () => {
    const homes = lineHomes(6);

    const springy = new RemanForceSim(homes, { spawnKick: 0 });
    springy.grab("n2");
    springy.dragTo("n2", 900, -700);
    springy.release("n2");
    settle(springy, 400);
    expect(dist(springy.node("n2")!, homes.get("n2")!)).toBeLessThan(1);

    const stuck = new RemanForceSim(homes, { spawnKick: 0 });
    stuck.grab("n2");
    stuck.dragTo("n2", 900, -700);
    for (let i = 0; i < 12; i++) stuck.tick(1);
    expect(stuck.node("n2")!.x).toBeCloseTo(900, 5);
    expect(stuck.hasCustomHomes).toBe(false);
    stuck.release("n2", 0, 0, true);
    expect(stuck.hasCustomHomes).toBe(true);
    settle(stuck, 400);
    expect(dist(stuck.node("n2")!, { x: 900, y: -700 })).toBeLessThan(2);
    // …and it survives a re-layout.
    stuck.setHomes(homes);
    settle(stuck, 200);
    expect(dist(stuck.node("n2")!, { x: 900, y: -700 })).toBeLessThan(2);
    // clearCustomHomes + setHomes pulls it back onto the layout.
    stuck.clearCustomHomes();
    expect(stuck.hasCustomHomes).toBe(false);
    stuck.setHomes(homes);
    settle(stuck, 500);
    expect(dist(stuck.node("n2")!, homes.get("n2")!)).toBeLessThan(1);
  });

  it("kick perturbs a resting node, which then bounces home", () => {
    const homes = lineHomes(5);
    const sim = new RemanForceSim(homes, { spawnKick: 0 });
    expect(sim.settled).toBe(true);
    const home = homes.get("n0")!;
    sim.kick("n0", 40, 0);
    expect(sim.settled).toBe(false);
    sim.tick(1);
    expect(sim.node("n0")!.x).toBeGreaterThan(home.x);
    settle(sim, 400);
    expect(dist(sim.node("n0")!, home)).toBeLessThan(0.5);
  });

  it("setHomes drops gone nodes, keeps survivors in place, spawns new ones", () => {
    const sim = new RemanForceSim(lineHomes(5), { seed: 9, spawnKick: 0 });
    settle(sim, 200);
    const keptPos = { ...sim.node("n2")! };

    const next = new Map<string, { x: number; y: number }>([
      ["n2", { x: 500, y: 500 }], // survivor, new home
      ["n3", { x: 560, y: 500 }],
      ["x9", { x: 620, y: 500 }], // brand new
    ]);
    sim.setHomes(next);

    expect(sim.node("n0")).toBeUndefined();
    // Survivor keeps its *position* immediately; only its home moved.
    expect(sim.node("n2")!.x).toBe(keptPos.x);
    expect(sim.node("n2")!.hx).toBe(500);
    expect(sim.node("x9")).toBeDefined();
    expect(sim.node("x9")!.x).toBe(620);

    settle(sim, 500);
    expect(dist(sim.node("n2")!, { x: 500, y: 500 })).toBeLessThan(1);
  });

  it("exposes a finite bounding box that contains every node", () => {
    const sim = new RemanForceSim(lineHomes(12), { seed: 1 });
    settle(sim, 200);
    const b = sim.bounds()!;
    for (const n of sim.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(b.minX);
      expect(n.x).toBeLessThanOrEqual(b.maxX);
      expect(n.y).toBeGreaterThanOrEqual(b.minY);
      expect(n.y).toBeLessThanOrEqual(b.maxY);
    }
    expect(Number.isFinite(b.minX + b.maxX + b.minY + b.maxY)).toBe(true);
  });
});
