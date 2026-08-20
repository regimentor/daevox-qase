# Storage context

## Responsibility

`@app/storage` owns the PostgreSQL persistence boundary: Prisma schema and generated client, migrations, seed data, database configuration, and the shared database client consumed by the API.

## Structure

- `prisma/schema.prisma` defines models, enums, relations, indexes, constraints, and database mappings.
- `prisma/migrations/` contains committed, ordered migrations.
- `prisma/seed.ts` creates idempotent demo data for local verification.
- `src/client.ts` and `src/index.ts` expose the storage client and package surface.
- `src/generated/` contains Prisma-generated output and must not be edited manually.

## Boundary rules

- Change `schema.prisma` first, then create a new migration. Never rewrite an applied migration or use a destructive reset as a substitute for a migration.
- Use `npm run db:migrate` for development migration creation/application and `npm run db:migrate:deploy` for deployment-style application of committed migrations.
- Run `npm run db:generate` after schema changes. Generated Prisma output is derived and should not be hand-edited.
- Keep database-specific concerns in this package; the API owns business authorization and GraphQL behavior.
- Preserve tenant-scoping relationships, composite foreign keys, check constraints, partial/descending indexes, and snapshot immutability triggers unless an explicit ADR changes the design.

## Data guarantees

The baseline schema supports tenant-scoped workspaces/projects, atomic case numbering, immutable run snapshots, append-only result history, and the object-deletion outbox used by the API's attachment cleanup command. Database constraints and triggers are part of the behavior, not incidental implementation details.

`TestPlanSourceSuite` stores a plan's selected source suites. `TestPlanCaseSource` records source-suite provenance independently from the `manual` flag on `TestPlanCase`; archived plan-case links remain available for active/archived counts without changing run snapshots. Plan-case positions remain globally unique across active and archived links, so new links use a position above the global maximum and reordering reuses only active position slots.

`ArchiveOperation` groups the soft-archived suite subtree or case and is referenced by archived repository objects. Restoring a suite restores the objects from its operation and moves the root to the end of its sibling list; it does not recreate deleted plan/source links.

## Seed and local infrastructure

The seed is idempotent and creates demo users, workspace/project data, suites, cases, a plan, an environment, and a draft run with snapshots. It requires `SEED_DEMO_PASSWORD` to meet the documented minimum; production seeding additionally requires explicit opt-in.

PostgreSQL and MinIO are supplied by `docker compose`. Do not commit local volumes, credentials, or environment files.

## Verification

For schema changes, run `npm run db:generate`, `npm run typecheck`, and the relevant API/integration tests. For migration or transaction changes, run the e2e suite when available because it applies real migrations against disposable PostgreSQL and exercises cross-package behavior.
