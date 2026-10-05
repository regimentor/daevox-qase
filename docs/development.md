# Development guide

## Prerequisites

- Node.js 22.12 or newer
- npm
- Docker with Compose
- OpenSSL when generating Ed25519 keys

The repository uses npm workspaces for `@app/storage`, `@app/api`, and `@app/web`. Run commands from the repository root unless a command explicitly names a workspace.

## Local setup

Create the API environment and start PostgreSQL and MinIO:

```bash
cp .env.example .env
docker compose up -d
npm ci
npm run db:generate
npm run db:migrate:deploy
npm run db:seed
```

Set `SEED_DEMO_PASSWORD` to a password of at least 12 characters before seeding. The seed is intended for local/demo use; production seeding also requires `ALLOW_PRODUCTION_SEED=true`.

The root `package.json` records version-pinned dependency install-script approvals in `allowScripts`. npm versions that enforce this policy skip unapproved dependency scripts. After updating dependencies, run `npm install-scripts ls`, review the listed scripts, and approve the required packages with `npm install-scripts approve <pkg>`. Commit the updated approvals. To run scripts skipped during an earlier installation, run `npm rebuild` after approving them, or reinstall with `npm ci`.

## Dependency security

Run `npm audit` from the repository root. The root overrides pin Prisma's `mysql2` dependency to `3.24.5` and `@prisma/config`'s `deepmerge-ts` dependency to `8.0.2` to address security advisories while retaining Prisma `7.9.1`. Verify Prisma generation and the application checks when changing these overrides; remove them once upstream dependencies use fixed versions.

As of 2026-10-05, the audit still reports ten high-severity entries stemming from `braces` and its GraphQL codegen dependency chain. [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) has no patched release. These entries remain unresolved; the audit's suggested downgrade of GraphQL codegen is not applied. The API/storage contract, database schema, and public GraphQL contract are unchanged by these dependency updates.

The development placeholders in `.env.example` are for local infrastructure. Never commit a real `.env`, credential, access key, password, or JWT key. For production-style keys, generate an Ed25519 pair and store the required PEM or base64-encoded values in the environment.

Start the API:

```bash
npm run dev
```

In a second terminal, configure and start the web client:

```bash
cp frontend/web/.env.example frontend/web/.env
npm run codegen
npm run dev:web
```

The API serves GraphQL at `POST /graphql`, with liveness and readiness endpoints at `/health/live` and `/health/ready`. The web client is normally available at `http://localhost:5173`.

## Common commands

| Purpose                                 | Command                       |
| --------------------------------------- | ----------------------------- |
| Build storage and API                   | `npm run build`               |
| Build web client                        | `npm run build:web`           |
| Run all workspace type checks           | `npm run typecheck`           |
| Check frontend types                    | `npm run typecheck:web`       |
| Generate frontend GraphQL types         | `npm run codegen`             |
| Verify generated frontend GraphQL types | `npm run codegen:check`       |
| Lint backend and frontend               | `npm run lint`                |
| Check formatting                        | `npm run format:check`        |
| Format the repository                   | `npm run format`              |
| Run unit/component tests                | `npm test`                    |
| Run frontend tests                      | `npm run test:web`            |
| Run browser coverage workflow           | `npm run test:web:coverage`   |
| Run end-to-end tests                    | `npm run test:e2e`            |
| Run full coverage gate                  | `npm run test:coverage`       |
| Generate Prisma client                  | `npm run db:generate`         |
| Create/apply a development migration    | `npm run db:migrate`          |
| Apply committed migrations              | `npm run db:migrate:deploy`   |
| Seed demo data                          | `npm run db:seed`             |
| Open Prisma Studio                      | `npm run db:studio`           |
| Clean failed attachment deletions       | `npm run attachments:cleanup` |

The API build regenerates resolver-facing GraphQL interfaces. The frontend codegen reads the API SDL and operations under `frontend/web/app/**/*.graphql`. Do not edit generated output directly; change its source and regenerate it.

## Verification strategy

Start with the smallest check for the changed area:

- API or schema: typecheck, relevant API tests, and lint.
- Storage or migrations: Prisma generation, typecheck, and relevant integration tests.
- Frontend or operations: codegen, codegen check, frontend typecheck, frontend tests, and lint.
- Cross-package changes: run the full gate from `AGENTS.md`.

The e2e suite uses disposable PostgreSQL and MinIO Testcontainers. Coverage combines unit, Storybook browser, and Playwright execution; it is expected to be slower and more infrastructure-sensitive than focused checks.

## Change safety

GraphQL SDL is the public contract. API generated interfaces and frontend GraphQL types are derived from it. Database changes require a new Prisma migration; applied migrations must remain immutable. Keep tenant scoping, transaction boundaries, immutable run snapshots, append-only results, and object-storage cleanup behavior intact when changing domain code.
