# Database contract

BRAXON shares one PostgreSQL database with the web app in
[`pic-abs-tester`](https://github.com/rodrichgk/pic-abs-tester). The two
codebases now live in separate repositories, so nothing enforces this contract
automatically — it is written down here because a change on either side can
break the other silently.

Connection settings are entered in the app and stored at
`%APPDATA%\pic-abs-tester\db_config.json` (see `src-tauri/src/database.rs`).
There is no bundled or local database; the app is useless without a reachable
PostgreSQL server.

## Who owns what

**Owned by the web app**, defined in `prisma/schema.prisma` and created by
Prisma migrations. BRAXON reads and writes these with raw SQL and must not
alter their shape:

| Table | Used by BRAXON |
|---|---|
| `ABSData` | yes — reference lookup, search, editor |
| `SignalProfile` | yes — signal tester profiles |
| `MotorTest` | yes — motor test results |
| `ABSModule`, `Valve` | indirectly |
| `TestSequence`, `TestStep`, `TestRun`, `TestResult`, `Report` | not currently |

**Owned by BRAXON**, created at runtime by `CREATE TABLE IF NOT EXISTS` in
`src-tauri/src/commands.rs`. These are **not** in `prisma/schema.prisma` and
Prisma knows nothing about them:

| Table | Created in | Purpose |
|---|---|---|
| `EcuDtc` | `ensure_ecu_tables()` | ECU diagnostic trouble codes |
| `AppUser` | `ensure_auth_tables()` | application login accounts |
| `RepairJob` | `ensure_auth_tables()` | repair job lifecycle |

## Consequences worth knowing

- `prisma migrate reset` or `prisma db push --force-reset` in the web repo will
  drop the three BRAXON-owned tables along with everything else. They are
  recreated on next launch, but their **data is gone**.
- `prisma db pull` will introspect the BRAXON-owned tables into
  `schema.prisma`. Do not commit that unless you intend Prisma to take
  ownership of them.
- Renaming or retyping a column on a Prisma-owned table breaks BRAXON's raw
  SQL at runtime, not at build time. There is no type checking across this
  boundary in either direction.
- Adding a column to a BRAXON-owned table means editing the `CREATE TABLE`
  statement *and* handling existing installs, since `IF NOT EXISTS` will not
  alter a table that already exists.

## If you want one source of truth

Move `EcuDtc`, `AppUser` and `RepairJob` into `prisma/schema.prisma` as real
models, generate a migration, and delete the `ensure_*_tables` helpers. That
puts every table under Prisma's migration history at the cost of making BRAXON
depend on the web repo having been migrated first.
