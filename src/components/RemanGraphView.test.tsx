import { describe, it, expect, vi, afterEach } from "vitest";
import { renderWithProviders, screen, cleanup, fireEvent } from "@/test/render";
import RemanGraphView from "@/components/RemanGraphView";
import type { RemanGraphJob, RemanGraphKnowledgeEntry } from "@/lib/remanGraph";

const rootTransform = () => {
  const g = screen.getByTestId("reman-graph").querySelector("g")!;
  const m = /translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)\)/.exec(g.getAttribute("transform") || "");
  return m ? { x: +m[1], y: +m[2], k: +m[3] } : null;
};
const pointer = (extra: Record<string, unknown>) => ({ button: 0, pointerId: 1, ...extra });

afterEach(cleanup);

const jobs: RemanGraphJob[] = [
  { id: "100", reference: "REF-100", clientName: "ACME", family: "ABS", vehicleModel: "GOLF" },
  { id: "200", reference: "REF-200", clientName: "ACME", family: "ABS", vehicleModel: "GOLF" },
];

const kb: RemanGraphKnowledgeEntry[] = [
  {
    id: 1,
    ecuRef: "E-1",
    faultCodes: ["C1391"],
    causeTags: ["cracked joint"],
    fixTags: ["reflow pump driver"],
    linkedJobIds: ["100", "200"],
  },
];

const opts = {
  user: { id: "u1", name: "Tech", role: "technicien" as const },
  language: "en" as const,
  // The component makes no IPC calls, but renderWithProviders' provider stack
  // (ReportsContext etc.) does on mount — resolve those instead of rejecting.
  tauriFallback: () => [] as unknown,
};

describe("RemanGraphView", () => {
  it("shows the empty state when there are no jobs", () => {
    renderWithProviders(<RemanGraphView jobs={[]} knowledgeEntries={[]} />, opts);
    expect(screen.getByText(/search or pick a queue/i)).toBeInTheDocument();
  });

  it("renders job, fault-code and fix nodes from the search results + knowledge base", () => {
    renderWithProviders(<RemanGraphView jobs={jobs} knowledgeEntries={kb} />, opts);
    expect(screen.getByTestId("reman-graph")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Job: REF-100" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Job: REF-200" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fault code: C1391" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Proven fix: reflow pump driver" })).toBeInTheDocument();
  });

  it("opens a detail panel on node click and calls onOpenJob from it", async () => {
    const onOpenJob = vi.fn();
    const { user } = renderWithProviders(
      <RemanGraphView jobs={jobs} knowledgeEntries={kb} onOpenJob={onOpenJob} />,
      opts,
    );
    await user.click(screen.getByRole("button", { name: "Job: REF-100" }));
    // Panel appears with the node's connection list + a jump-to-job action.
    expect(screen.getByText("Connections")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /open job/i }));
    expect(onOpenJob).toHaveBeenCalledWith("100");
  });

  it("hides a node kind when its legend chip is toggled off", async () => {
    const { user } = renderWithProviders(<RemanGraphView jobs={jobs} knowledgeEntries={kb} />, opts);
    expect(screen.getByRole("button", { name: "Client: ACME" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Client" })); // legend chip
    expect(screen.queryByRole("button", { name: "Client: ACME" })).not.toBeInTheDocument();
    // Structural kinds are untouched.
    expect(screen.getByRole("button", { name: "Job: REF-100" })).toBeInTheDocument();
  });

  it("surfaces a link-load error with a working retry", async () => {
    const onRetryLinks = vi.fn();
    const { user } = renderWithProviders(
      <RemanGraphView jobs={jobs} knowledgeEntries={[]} linksError="boom" onRetryLinks={onRetryLinks} />,
      opts,
    );
    expect(screen.getByText(/couldn't load repair-knowledge links/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetryLinks).toHaveBeenCalledTimes(1);
  });

  it("zoom in / out buttons move the zoom level up and down", async () => {
    const { user } = renderWithProviders(<RemanGraphView jobs={jobs} knowledgeEntries={kb} />, opts);
    const readout = () => parseInt(screen.getByTestId("graph-zoom-level").textContent || "0", 10);
    const start = readout();
    await user.click(screen.getByRole("button", { name: /zoom in/i }));
    expect(readout()).toBeGreaterThan(start);
    const zoomed = readout();
    await user.click(screen.getByRole("button", { name: /zoom out/i }));
    expect(readout()).toBeLessThan(zoomed);
  });

  it("clears the selection on Escape and on a background click", async () => {
    const { user } = renderWithProviders(<RemanGraphView jobs={jobs} knowledgeEntries={kb} />, opts);
    await user.click(screen.getByRole("button", { name: "Fault code: C1391" }));
    expect(screen.getByText("Connections")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByText("Connections")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Fault code: C1391" }));
    expect(screen.getByText("Connections")).toBeInTheDocument();
    await user.click(screen.getByTestId("reman-graph")); // empty canvas
    expect(screen.queryByText("Connections")).not.toBeInTheDocument();
  });

  it("focuses a node's neighbourhood and restores the full graph", async () => {
    const { user } = renderWithProviders(<RemanGraphView jobs={jobs} knowledgeEntries={kb} />, opts);
    await user.click(screen.getByRole("button", { name: "Job: REF-100" }));
    await user.click(screen.getByRole("button", { name: /^focus$/i }));
    // Show-all control appears (in the toolbar and the panel) once focused.
    expect(screen.getAllByRole("button", { name: /show all/i }).length).toBeGreaterThan(0);
    await user.click(screen.getAllByRole("button", { name: /show all/i })[0]);
    expect(screen.queryByRole("button", { name: /show all/i })).not.toBeInTheDocument();
  });

  it("pans the view on a background drag, leaving zoom and selection untouched", () => {
    renderWithProviders(<RemanGraphView jobs={jobs} knowledgeEntries={kb} />, opts);
    const svg = screen.getByTestId("reman-graph");
    const before = rootTransform()!;
    fireEvent.pointerDown(svg, pointer({ clientX: 300, clientY: 300 }));
    fireEvent.pointerMove(svg, pointer({ clientX: 380, clientY: 350 }));
    fireEvent.pointerUp(svg, pointer({ clientX: 380, clientY: 350 }));
    const after = rootTransform()!;
    expect(after.x).toBeCloseTo(before.x + 80, 2);
    expect(after.y).toBeCloseTo(before.y + 50, 2);
    expect(after.k).toBeCloseTo(before.k, 5);
    expect(screen.queryByText("Connections")).not.toBeInTheDocument();
  });

  it("drags a node into a new position without selecting it (supra-slop)", () => {
    renderWithProviders(<RemanGraphView jobs={jobs} knowledgeEntries={kb} />, opts);
    const node = screen.getByRole("button", { name: "Fault code: C1391" });
    const before = node.getAttribute("transform");
    fireEvent.pointerDown(node, pointer({ clientX: 200, clientY: 200 }));
    fireEvent.pointerMove(node, pointer({ clientX: 268, clientY: 244 }));
    fireEvent.pointerUp(node, pointer({ clientX: 268, clientY: 244 }));
    expect(node.getAttribute("transform")).not.toBe(before);
    expect(screen.queryByText("Connections")).not.toBeInTheDocument();
  });

  it("treats a sub-slop pointer movement as a click (selects the node + fires a ripple)", () => {
    const { container } = renderWithProviders(<RemanGraphView jobs={jobs} knowledgeEntries={kb} />, opts);
    const node = screen.getByRole("button", { name: "Fault code: C1391" });
    expect(container.querySelector(".animate-graph-ripple")).toBeNull();
    fireEvent.pointerDown(node, pointer({ clientX: 200, clientY: 200 }));
    fireEvent.pointerMove(node, pointer({ clientX: 202, clientY: 201 }));
    fireEvent.pointerUp(node, pointer({ clientX: 202, clientY: 201 }));
    expect(screen.getByText("Connections")).toBeInTheDocument();
    expect(container.querySelector(".animate-graph-ripple")).not.toBeNull(); // click reaction
  });

  it("engages hover repulsion on pointer move over the canvas without a gesture", () => {
    renderWithProviders(<RemanGraphView jobs={jobs} knowledgeEntries={kb} />, opts);
    const svg = screen.getByTestId("reman-graph");
    // No pointerdown → this is a hover, not a drag. Must not throw and must
    // not start panning/selecting.
    const before = rootTransform();
    expect(() => {
      fireEvent.pointerMove(svg, { clientX: 400, clientY: 300, pointerType: "mouse" });
      fireEvent.pointerLeave(svg, { clientX: 400, clientY: 300, pointerType: "mouse" });
    }).not.toThrow();
    expect(rootTransform()).toEqual(before);
    expect(screen.queryByText("Connections")).not.toBeInTheDocument();
  });

  it("zooms toward the cursor on wheel and prevents the page from scrolling", () => {
    renderWithProviders(<RemanGraphView jobs={jobs} knowledgeEntries={kb} />, opts);
    const svg = screen.getByTestId("reman-graph");
    svg.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 1040, bottom: 600, width: 1040, height: 600, x: 0, y: 0, toJSON() {} }) as DOMRect;
    const before = rootTransform()!;
    const ev = new WheelEvent("wheel", { deltaY: -260, clientX: 520, clientY: 300, bubbles: true, cancelable: true });
    const notPrevented = svg.dispatchEvent(ev);
    const after = rootTransform()!;
    expect(after.k).toBeGreaterThan(before.k); // zoomed in (applied synchronously)
    expect(notPrevented).toBe(false);          // preventDefault() was called
  });
});
