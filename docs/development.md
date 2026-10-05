# Development guide

## Prerequisites

- Node.js 22.12 or newer
- npm
- Docker with Compose
- OpenSSL when generating Ed25519 keys

The repository uses npm workspaces for `@app/storage`, `@app/api`, and `@app/web`. Run commands from the repository root unless a command explicitly names a workspace.

## Local setup

Create the API environment and start PostgreSQL and SeaweedFS:

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

## Nest dependency alignment

The root overrides pin `@nestjs/common`, `@nestjs/core`, and `@nestjs/platform-express` to `11.2.7`. Keep these overrides aligned with the API workspace's direct dependencies. GraphQL, Apollo, configuration and throttling must resolve the same Nest classes as the application: mixed root/workspace copies make dependency injection fail with an unresolved `HttpAdapterHost`. The API bootstrap regression test runs a separate Node process so the real installed dependency tree is exercised.

After changing Nest versions, regenerate the lockfile through npm and verify `npm ls @nestjs/core @nestjs/common @nestjs/platform-express` plus `npx vitest run backend/api/test/graphql-bootstrap.spec.ts`. A clean install uses the committed lockfile with `npm ci`.

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

`npm test` uses the root Vitest projects: API unit tests run in Node, and frontend unit/component tests use the web configuration with jsdom, setup files, and the `@` alias. Playwright browser tests and API e2e/integration tests are excluded from this unit-test command. `npm run test:web` runs the same web project independently.

The e2e suite uses disposable PostgreSQL and SeaweedFS Testcontainers. Coverage combines unit, Storybook browser, and Playwright execution; it is expected to be slower and more infrastructure-sensitive than focused checks.

## Change safety

GraphQL SDL is the public contract. API generated interfaces and frontend GraphQL types are derived from it. Database changes require a new Prisma migration; applied migrations must remain immutable. Keep tenant scoping, transaction boundaries, immutable run snapshots, append-only results, and object-storage cleanup behavior intact when changing domain code.

## Object-storage compatibility

Local Compose uses SeaweedFS 4.48, with S3 at `http://localhost:9000` and persistent state in `seaweedfs-data`. Credentials come from `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` in `.env`; bucket creation is idempotent. No master/filer/admin ports are published. Existing MinIO data needs S3 copying before switching; see [deployment operations](deployment.md).

The focused compatibility test runs the real adapter against a disposable SeaweedFS container:

```bash
npx vitest run --config backend/api/vitest.e2e.config.ts backend/api/test/seaweedfs.e2e-spec.ts
```

When Docker is unavailable, a separately started, disposable SeaweedFS 4.48 with test credentials `seaweedfs-test-user` / `seaweedfs-test-password` can be used by setting `SEAWEED_TEST_ENDPOINT`. The test creates and deletes its own temporary bucket. This validates S3 compatibility; it does not replace PostgreSQL/API/browser e2e or the container persistence check. Never point it at a production bucket.
