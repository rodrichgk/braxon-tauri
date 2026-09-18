import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";

// Canonical, real-on-disk casing for the project root. On Windows the config
// can otherwise load with a lowercase drive letter (`c:\…`) while npm/vitest
// resolve their bins via `C:\…`; Node then loads two copies of the `vitest`
// module and every suite dies with "failed to find the current suite" at
// src/test/setup.ts. The hooks (scripts/hooks/_lock.mjs) already spawn vitest
// with a canonicalised cwd; pinning `root` here is belt-and-suspenders for a
// direct `npx vitest` from a mis-cased shell.
const CONFIG_DIR = fileURLToPath(new URL(".", import.meta.url));
let ROOT: string;
try {
  ROOT = realpathSync.native(CONFIG_DIR);
} catch {
  ROOT = /^[a-z]:/.test(CONFIG_DIR) ? CONFIG_DIR[0].toUpperCase() + CONFIG_DIR.slice(1) : CONFIG_DIR;
}

// Standalone from vite.config.ts on purpose: that file's default export is an
// async factory tuned for the Tauri dev server (port, HMR, file watching) and
// none of it applies to a test run. We only need the React plugin (so JSX/TSX
// transforms) and the "@/" path alias the app source uses everywhere.
export default defineConfig({
  root: ROOT,
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.join(ROOT, "src"),
    },
  },
  test: {
    // jsdom for everything. Pure-logic modules under src/lib run fine in it,
    // and it saves every React test file from a per-file environment pragma.
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // Component/page/hook/lib tests live next to what they cover; the
    // scan-service and the real (non-_scratch) scripts get tested from here
    // too, against the root node_modules (both `pg` and vitest resolve there).
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "scan-service/**/*.{test,spec}.{js,mjs}",
      "scripts/**/*.{test,spec}.{js,mjs}",
    ],
    exclude: [
      "node_modules/**",
      "dist/**",
      "src-tauri/**",
      "scripts/_scratch-*",
      "scripts/_snapshot-*",
    ],
    // A few heavy component trees pull in canvas/pdf work; give them room.
    testTimeout: 15_000,
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "html", "json-summary", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}", "scan-service/*.js", "scripts/decode-*.mjs"],
      exclude: [
        "src/**/*.{test,spec}.{ts,tsx}",
        "src/test/**",
        "src/main.tsx",
        "src/vite-env.d.ts",
        "src/**/*.d.ts",
        "src/i18n/**",         // JSON string tables, nothing to execute
        "src/lib/pdfLogos.ts", // ~100 KB of embedded base64 logo data
        "src/styles/**",
        "src/types/**",
      ],
      // A floor that only goes up. Each number is set just below what the
      // suite currently measures (npm run test:coverage) so a regression
      // fails CI; raise them whenever a new suite lifts the real number.
      // Per-directory globs hold the line on the well-covered layers.
      // Targets and policy: docs/TESTING.md §4.
      thresholds: {
        statements: 32,
        branches: 20,
        functions: 25,
        lines: 34,
        "src/lib/**": { statements: 62, functions: 58, lines: 66, branches: 56 },
        "src/hooks/**": { statements: 82, functions: 82, lines: 84, branches: 58 },
        "src/contexts/**": { statements: 80, functions: 62, lines: 86, branches: 65 },
      },
    },
  },
});
