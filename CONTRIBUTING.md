# Contributing to BRAXON

## Start here

1. [`CLAUDE.md`](CLAUDE.md) — the rules (applies to humans and AI agents alike).
2. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — the module map.
3. [`docs/TESTING.md`](docs/TESTING.md) — how to test what.

## Setup

```sh
npm install                 # not npm ci — see .github/workflows/ci.yml
npm run tauri:dev           # app with hot reload  (needs Rust + a reachable Postgres)
npm run dev                 # frontend only
```

## The workflow

- Branch off `dev`. PRs target `dev` (or `main` for releases).
- **Tests are not optional.** Every code change keeps `npm run test:all` green
  and adds tests for new behaviour / a regression test for a bug fix. CI gates
  `dev` and `main` on it. See `CLAUDE.md` §3.
- Run `npm run test:all` before opening a PR. Run `npm run test:coverage` and
  check the files you touched didn't lose coverage.
- Keep `src/i18n/en.json` and `src/i18n/fr.json` in sync.
- Match the codebase's comment style: explain *why*, cite sources
  (original .NET `ABS.cs`, DDT4ALL, bench reports, protocol captures).

## Releasing

Version must match across `package.json`, `src-tauri/Cargo.toml`,
`src-tauri/tauri.conf.json` and the git tag. `git tag vX.Y.Z && git push origin
vX.Y.Z` triggers `.github/workflows/release.yml`. See [`README.md`](README.md).
