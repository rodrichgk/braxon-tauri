#!/usr/bin/env node
// PostToolUse hook (Edit|Write|MultiEdit) — see .claude/settings.json.
//
// Reads the hook payload on stdin, works out which suite covers the file that
// was just written, and runs it. A failure exits 2 so Claude Code feeds the
// output back to the model as a blocking error.
//
// Routing:
//   - src-tauri Rust source            -> cargo test        (in src-tauri/)
//   - test harness (src/test, vitest
//     config, package.json, tsconfig)  -> vitest run (all)
//   - a frontend *.test.ts(x) file     -> vitest run <that file>
//   - other frontend .ts(x) source     -> vitest related <file>
//   - scan-service / scripts .js/.mjs  -> vitest related <file>
//   - anything else                    -> no-op
//
// Escape hatch: set CLAUDE_SKIP_TEST_HOOKS=1 to make this a no-op.

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
const rawPath =
  payload?.tool_input?.file_path ||
  payload?.tool_input?.path ||
  payload?.tool_response?.filePath ||
  "";

if (!rawPath) process.exit(0);

const rel = path.relative(REPO, path.resolve(rawPath)).split(path.sep).join("/");
if (rel.startsWith("..") || path.isAbsolute(rel)) process.exit(0); // outside the repo

if (!existsSync(path.join(REPO, "node_modules", "vitest"))) {
  console.error("[post-edit-tests] node_modules/vitest missing — run `npm install`. Skipping.");
  process.exit(0);
}

const isRustSource = /^src-tauri\/.+\.rs$/.test(rel);
const isHarness =
  /^src\/test\//.test(rel) ||
  rel === "vitest.config.ts" ||
  rel === "package.json" ||
  /^tsconfig(\.\w+)?\.json$/.test(rel);
const isFrontendTest = /^src\/.+\.(test|spec)\.(ts|tsx)$/.test(rel);
const isFrontendSource = /^src\/.+\.(ts|tsx)$/.test(rel);
const isNodeSideSource =
  /^(scan-service|scripts)\/.+\.(js|mjs)$/.test(rel) && !/^scripts\/_(scratch|snapshot)/.test(rel);

// Not a file any suite covers (docs, assets, config we don't watch) — bail
// before touching the lock.
if (!(isRustSource || isHarness || isFrontendTest || isFrontendSource || isNodeSideSource)) {
  process.exit(0);
}

function run(cmd, args, opts = {}) {
  console.error(`[post-edit-tests] ${rel} -> ${cmd} ${args.join(" ")}`);
  return runResilient(cmd, args, opts);
}

const code = await withTestLock(() => {
  if (isRustSource) return run("cargo", ["test", "--quiet"], { cwd: path.join(REPO, "src-tauri") });
  if (isHarness) return run("npx", ["vitest", "run"]);
  if (isFrontendTest) return run("npx", ["vitest", "run", rel]);
  if (isFrontendSource || isNodeSideSource) return run("npx", ["vitest", "related", "--run", rel]);
  return 0; // not a file we test
});

if (code !== 0) {
  console.error(
    `\n[post-edit-tests] tests failed for ${rel} (exit ${code}). Fix them before continuing — ` +
      `do not weaken or skip the test.`,
  );
  process.exit(2);
}
process.exit(0);
