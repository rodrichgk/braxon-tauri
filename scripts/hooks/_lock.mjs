// Shared helpers for the test hooks (post-edit-tests.mjs, stop-tests.mjs).
//
// Two things this file exists to fix, both Windows + OneDrive specific:
//
//  1. Drive-letter casing. Claude Code sometimes invokes a hook with a cwd
//     of `c:\…` (lowercase) while npm/vitest resolve their own bins/config
//     via `C:\…`. Node then loads TWO copies of the `vitest` module — one per
//     casing — and every suite dies with "Vitest failed to find the current
//     suite" at src/test/setup.ts. `REPO` below is canonicalised with
//     realpathSync.native and passed as the spawn cwd so the whole run uses
//     one casing.
//
//  2. Concurrency. A per-save vitest run and the end-of-turn full run (or two
//     Claude sessions) racing on the synced `node_modules/.vite` cache corrupt
//     it — same symptom. `withTestLock` serialises them with an atomic
//     mkdir-based mutex.

import { mkdirSync, rmSync, statSync, writeFileSync, readFileSync, realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

function canonical(p) {
  try {
    return realpathSync.native(p);
  } catch {
    // Fall back to at least fixing the drive letter.
    return /^[a-z]:/.test(p) ? p[0].toUpperCase() + p.slice(1) : p;
  }
}

/** Repo root, canonical on-disk casing. Use this as the cwd for every child. */
export const REPO = canonical(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".."));

const LOCK_DIR = path.join(REPO, "node_modules", ".cache", "braxon-test-hook.lock");
const STALE_MS = 15 * 60 * 1000;
const POLL_MS = 400;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function acquire(waitMs) {
  const deadline = Date.now() + waitMs;
  for (;;) {
    try {
      mkdirSync(LOCK_DIR, { recursive: true });
      try {
        writeFileSync(path.join(LOCK_DIR, "pid"), String(process.pid), { flag: "wx" });
        return true;
      } catch {
        /* someone else holds it */
      }
    } catch {
      /* ignore */
    }

    try {
      const age = Date.now() - statSync(LOCK_DIR).mtimeMs;
      if (age > STALE_MS) {
        rmSync(LOCK_DIR, { recursive: true, force: true });
        continue;
      }
    } catch {
      /* lock vanished — retry */
    }

    if (Date.now() > deadline) return false;
    await sleep(POLL_MS);
  }
}

function release() {
  try {
    if (readFileSync(path.join(LOCK_DIR, "pid"), "utf8") === String(process.pid)) {
      rmSync(LOCK_DIR, { recursive: true, force: true });
    }
  } catch {
    /* ignore */
  }
}

/** Run `fn` while holding the lock. If the lock can't be taken in `waitMs`,
 *  runs anyway (better a possibly-noisy run than a skipped test gate). */
export async function withTestLock(fn, waitMs = 10 * 60 * 1000) {
  const got = await acquire(waitMs);
  try {
    return await fn();
  } finally {
    if (got) release();
  }
}

/** "failed to find the current suite" etc.: Vitest's worker/module state got
 *  duplicated (casing) or its cache corrupted (a race). Not a real test
 *  failure — worth one clean retry. */
const INFRA_ERROR = /failed to find the current suite|Vitest failed to find|Cannot find module .*@vitest|ERR_MODULE_NOT_FOUND.*vitest/i;

function clearVitestCache() {
  for (const d of [".vite", ".vitest", path.join(".cache", "vitest")]) {
    try {
      rmSync(path.join(REPO, "node_modules", d), { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

/**
 * Run a command from the canonical repo root, streaming its output live AND
 * capturing it. On a Vitest infrastructure error (not a genuine test/type
 * failure) clear the cache and retry once. Returns the final exit code.
 */
export function runResilient(cmd, args, opts = {}) {
  const cwd = opts.cwd || REPO;
  const spawn = () =>
    spawnSync(cmd, args, {
      cwd,
      shell: process.platform === "win32",
      // Pin every vitest child to one drive-letter casing regardless of how
      // the hook itself was invoked.
      env: { ...process.env, VITEST_CWD: cwd },
      encoding: "utf8",
      maxBuffer: 128 * 1024 * 1024,
    });

  let res = spawn();
  process.stdout.write(res.stdout ?? "");
  process.stderr.write(res.stderr ?? "");

  const code = res.status ?? 1;
  if (code !== 0 && INFRA_ERROR.test((res.stdout ?? "") + (res.stderr ?? ""))) {
    console.error("\n[test-hook] Vitest infra error (not a test failure) — clearing cache and retrying once…\n");
    clearVitestCache();
    res = spawn();
    process.stdout.write(res.stdout ?? "");
    process.stderr.write(res.stderr ?? "");
    return res.status ?? 1;
  }
  return code;
}
