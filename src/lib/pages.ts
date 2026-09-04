// The app's page identifiers — previously defined inside components/
// Navigation.tsx, a component that turned out to be dead code (superseded
// by Sidebar.tsx, never actually rendered — App.tsx only imports Sidebar).
// This one `Page` type was the only real, still-used export from that
// file (App.tsx/Sidebar.tsx/TestSessionContext.tsx all imported it purely
// for the type), so it moved here rather than deleting it along with the
// rest of Navigation.tsx. See docs/reman-schema.md's 2026-09-02 Bench
// Report entry for the full context.
export type Page =
  | 'home' | 'valves' | 'motors' | 'signal' | 'jobs' | 'reman'
  | 'f2evo_hydraulic' | 'f2evo_electronics' | 'f2evo_gearbox' | 'f2evo_sensor' | 'f2evo_washing';
