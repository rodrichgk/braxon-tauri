import { describe, it, expect, vi, afterEach } from "vitest";
import { renderWithProviders, cleanup } from "@/test/render";

import HomePage from "@/pages/Home";
import ValvesPage from "@/pages/Valves";
import MotorsPage from "@/pages/Motors";
import JobsPage from "@/pages/Jobs";
import SignalPage from "@/pages/Signal";
import RemanPage from "@/pages/Reman";
import F2EvoHydraulicPage from "@/pages/F2EvoHydraulic";
import F2EvoElectronicsPage from "@/pages/F2EvoElectronics";
// F2EvoLegacy is intentionally omitted: F2EvoLegacyPanel dereferences
// `currentBoard` (a board-selection lookup) unguarded, so it needs a
// specific AppSettings board state to mount — see its own follow-up test.

// "Renders without throwing" smoke coverage for the top-level routes. Every
// unlisted Tauri command resolves to [] (the common shape); the point is that
// each page mounts its provider tree, effects and first paint cleanly.
const opts = {
  user: { id: "u1", name: "Tech", role: "technicien" as const },
  tauriFallback: () => [] as unknown,
};

afterEach(cleanup);

describe("page smoke renders", () => {
  it.each([
    ["Home", HomePage],
    ["Valves", ValvesPage],
    ["Motors", MotorsPage],
    ["Jobs", JobsPage],
    ["Signal", SignalPage],
    ["Reman", RemanPage],
    ["F2EvoHydraulic", F2EvoHydraulicPage],
    ["F2EvoElectronics", F2EvoElectronicsPage],
  ])("%s mounts and paints something", (_name, Page) => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = renderWithProviders(<Page />, opts);
    expect(container.firstChild).toBeTruthy();
    spy.mockRestore();
  });
});
