# Agent instructions

## File search or grep

For any file search or grep in the current git-indexed directory, use fff tools.

## Repository shape

This repository is an npm workspace monorepo for the Daevox QA Suite MVP:

- `backend/api` (`@app/api`) is the NestJS GraphQL API.
- `backend/storage` (`@app/storage`) owns PostgreSQL access, Prisma schema, migrations, and seed data.
- `frontend/web` (`@app/web`) is the React Router Framework Mode SPA.

Read `docs/architecture/CONTEXT-MAP.md` first. Before changing a package, read its local `CONTEXT.md`. For a cross-package change, read every affected context and document the contract between them.

## Working rules

- Preserve tenant isolation. Domain reads and writes must remain scoped through the authenticated user, workspace membership, workspace, project, and resource. Cross-tenant identifiers must not reveal whether a resource exists.
- Treat `backend/api/src/schema/schema.graphql` as the public GraphQL contract. Run the API type generator after changing it, then run frontend code generation when operations or schema types change.
- Do not edit generated artifacts by hand: `backend/api/src/generated/graphql.ts`, `frontend/web/app/shared/api/graphql/generated.ts`, and Prisma output under `backend/storage/src/generated/` are derived files.
- Change the Prisma schema and create a new migration for database changes. Never rewrite an applied migration. Use `db:migrate:deploy` for deployment-style application of migrations.
- Keep snapshot payloads immutable, results append-only, and multi-step domain changes transactional. Preserve the existing retry/locking behavior when touching numbering, runs, assignments, or results.
- Keep attachment bytes outside GraphQL. Use the `ObjectStorage` contract and preserve the deletion outbox behavior when changing S3/MinIO integration.
- Keep frontend imports within the FSD layer order `shared → entities → features → widgets → pages → app`; use public `index.ts` APIs and do not deep-import sibling slices.
- Never commit `.env` files, credentials, JWT keys, access keys, passwords, or generated local infrastructure data. Use `.env.example` and local Docker services.
- Update the relevant context or development documentation when a supported command, boundary, invariant, generated file, or operational workflow changes. Record significant architectural decisions in `docs/architecture/adr/`.

## Start here

For local setup and the verification matrix, read [`docs/development.md`](docs/development.md). For local work items, read [`docs/issue-tracking.md`](docs/issue-tracking.md).

Use the smallest relevant check while iterating, then run the complete verification gate for broad or cross-package changes.

## Verification by change area

| Change area                             | Minimum focused checks                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| API source or GraphQL schema            | `npm run typecheck`, relevant API tests, and `npm run lint`                                             |
| Storage schema, migrations, or seed     | `npm run db:generate`, `npm run typecheck`, relevant API/integration tests                              |
| Frontend source or GraphQL operations   | `npm run codegen`, `npm run codegen:check`, `npm run typecheck:web`, `npm run test:web`, `npm run lint` |
| Cross-package or public contract change | API and frontend checks above, then the full verification gate                                          |

The full verification gate is:

```bash
npm run build
npm run typecheck
npm run lint
npm run format:check
npm test
npm run test:e2e
npm run test:coverage
```

Do not claim a check passed unless it was actually run. If an environment-dependent check cannot run, report the exact command and blocker.

## Local issue workflow

Issues are local markdown files at `.scratch/<feature>/issue.md`. Use the lifecycle `draft → ready → in-progress → done`; use `blocked` when progress depends on an external decision or system. Keep acceptance criteria and implementation notes in the issue, and do not store secrets or personal data there.

## Documentation rules

Documentation describes the current, observed system. Do not present proposed behavior as implemented behavior. When a future design matters, write an ADR or an explicitly labeled plan. Keep `README.md` focused on orientation and quick start; put detailed development and architecture guidance in `docs/` and the package contexts.
