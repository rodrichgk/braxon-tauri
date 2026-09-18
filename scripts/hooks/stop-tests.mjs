#!/usr/bin/env node
/* Stop hook — see .claude/settings.json.

   Runs the full suite (`npm run test:all` = typecheck + Vitest + cargo test)
   when Claude finishes a turn. A failure exits 2, which keeps the turn open
   and hands the output back to the model to fix.

   Loop guard: Claude Code sets `stop_hook_active: true` on the payload when it
   re-invokes after a Stop hook already blocked once. We honour that and exit 0
   so a genuinely stuck failure can't trap the session — the failure is still
   visible in the transcript and CI still gates it.

   Escape hatch: CLAUDE_SKIP_TEST_HOOKS=1 makes this a no-op. */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { REPO, withTestLock, runResilient } from "./_lock.mjs";

function stdinJson() {
  try {
    return JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    return {};
  }
}

if (process.env.CLAUDE_SKIP_TEST_HOOKS) process.exit(0);

const payload = stdinJson();
if (payload?.stop_hook_active) process.exit(0); // already blocked once this turn

if (!existsSync(path.join(REPO, "node_modules", "vitest"))) {
  console.error("[stop-tests] node_modules/vitest missing — run `npm install`. Skipping.");
  process.exit(0);
}

console.error("[stop-tests] npm run test:all");
const code = await withTestLock(() => runResilient("npm", ["run", "test:all"], { cwd: REPO }));

if (code !== 0) {
  console.error(
    "\n[stop-tests] `npm run test:all` failed. The turn is not done: fix the failing " +
      "tests / types (do not skip, weaken, or lower thresholds) and let it re-run.",
  );
  process.exit(2);
}
process.exit(0);
