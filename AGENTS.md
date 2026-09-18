# AGENTS.md

**Canonical guidance lives in [`CLAUDE.md`](CLAUDE.md). Read it first.** This
file exists so tools that look for `AGENTS.md` (Cursor, Aider, Copilot, OpenAI
Codex, …) land on the same rules. Also read [`docs/TESTING.md`](docs/TESTING.md)
before touching code.

## The non-negotiables (full detail in CLAUDE.md)

1. **Tests run on every change and must stay green.** Enforced by
   `.claude/settings.json` hooks — a fast suite after each edit, the full
   `npm run test:all` at end of turn. If you touch code you own the result.
2. **New behaviour ships with tests; bug fixes ship with a regression test.**
   Never `skip`/`delete`/weaken a test or lower a coverage threshold to go green.
3. **Keep `src/lib/` pure** (no React, no `@tauri-apps/*` beyond types) — it's
   the main test target. Untestable logic is a design smell: extract it.
4. **TypeScript strict**, no `any`, no unused locals/params (`tsc` fails on them).
5. **i18n** — every user-facing string key goes in **both** `src/i18n/en.json`
   and `src/i18n/fr.json`.
6. **Design tokens** (`bg-card`, `accent`, `success`, …), never raw Tailwind
   colour classes.
7. **Windows-only, Tauri v1, Postgres/REMAN 4D absent in tests**, repo path has
   spaces — quote it.

## Commands

```sh
npm run test:all        # typecheck + Vitest + cargo test  — run before "done"
npm test                # Vitest once
npm run test:watch      # Vitest watch
npm run test:coverage   # + V8 coverage report
npm run test:rust       # cargo test in src-tauri/
npm run typecheck       # tsc --noEmit
```

## Where tests go

- `src/**` → `Foo.test.ts` / `Foo.test.tsx` next to `Foo.ts(x)`. Harness:
  `src/test/{setup,tauri,render}.ts(x)`.
- `src-tauri/src/*.rs` → `#[cfg(test)] mod tests` in the same file.
- `scan-service/` → `*.test.js` next to `server.js` (run by the root Vitest).

See `CLAUDE.md` §6/§7 for the before/after checklists.