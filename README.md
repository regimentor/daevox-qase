# Daevox QA Suite API

Production-oriented MVP for manual QA management. The npm monorepo contains `@app/storage` for PostgreSQL/Prisma, `@app/api` for the NestJS GraphQL API, and `@app/web` for the React application.

## Documentation

- [`AGENTS.md`](AGENTS.md): rules and verification guidance for AI agents and contributors.
- [`docs/development.md`](docs/development.md): local setup, commands, and verification strategy.
- [`docs/deployment.md`](docs/deployment.md): production Docker Compose installation and operations.
- [`docs/issue-tracking.md`](docs/issue-tracking.md): local markdown issue workflow.
- [`docs/architecture/CONTEXT-MAP.md`](docs/architecture/CONTEXT-MAP.md): domain boundaries and package contexts.

## Local start

Requirements: Node.js 22 LTS or newer, npm, and Docker.

```bash
cp .env.example .env
docker compose up -d
npm ci
npm run db:generate
npm run db:migrate:deploy
npm run db:seed
npm run dev
```

Generate the Ed25519 JWT key pair referenced by `.env`:

```bash
openssl genpkey -algorithm Ed25519 -out access-private.pem
openssl pkey -in access-private.pem -pubout -out access-public.pem
```

Put either the PEM text (with escaped newlines) or the base64-encoded DER payload into `ACCESS_TOKEN_PRIVATE_KEY` and `ACCESS_TOKEN_PUBLIC_KEY`. Never commit real keys. The API listens on `POST /graphql`; liveness and readiness are `GET /health/live` and `GET /health/ready`.

Development enables introspection and Apollo's landing page. Production disables introspection. Readiness calls both PostgreSQL and the private S3/SeaweedFS bucket.

## Frontend

The web client is a React Router Framework Mode SPA (`ssr: false`) with React, strict TypeScript, Ant Design and Apollo Client. It implements authentication, tenant/project selection, membership administration, dashboard, repository and suite management, test-case editing, plans, environments, run creation and assignment, immutable snapshot execution, result history and presigned attachment upload.

Start the API as described above, then run the client in another terminal:

```bash
cp frontend/web/.env.example frontend/web/.env
npm run codegen
npm run dev:web
```

The default client URL is `http://localhost:5173`; `VITE_GRAPHQL_URL` selects the GraphQL endpoint. The production output is in `frontend/web/build/client`. Hosting must serve `index.html` for unknown paths; `public/_redirects` provides this fallback for compatible static hosts.

Frontend verification and component development:

```bash
npm run typecheck:web
npm run test:web
npm run test:web:coverage
npm run storybook
npm run build-storybook
npm run test:web:e2e
```

Browser e2e tests start isolated PostgreSQL and SeaweedFS containers plus the real API. Vitest coverage uses the V8 provider; the aggregate gate merges source-level unit, Storybook browser and Playwright coverage, enforcing 80% for statements, branches, functions and lines.

## Design

- SDL in `backend/api/src/schema/schema.graphql` is the public contract; `generate-types.ts` generates resolver-facing TypeScript interfaces.
- Every domain service scopes reads through `User → WorkspaceMember → Workspace → Project → resource`. Cross-tenant IDs return `RESOURCE_NOT_FOUND`.
- Project case numbers come from an atomic `next_case_number` increment in a retried serializable transaction.
- Run creation locks active source cases, then copies every case and step inside one repeatable-read transaction. Database triggers prevent rewriting snapshot payloads.
- Results are append-only. Latest status and summaries use `(created_at DESC, id DESC)` and set-based SQL.
- Suite reorder, last-admin changes, bulk replacements, state transitions, snapshots, assignments, and results use transactions.
- Nested membership users use a request-scoped DataLoader; other nested collections are fetched as deterministic relation batches by their owning application service.
- Attachment bytes never pass through GraphQL. S3 and SeaweedFS share one `ObjectStorage` contract. Failed object deletion leaves an `object_deletions` outbox row for `npm run attachments:cleanup`.
- Logs are one-line JSON with correlation ID, operation name, authenticated user ID, duration, and result code. Request/token/password/storage-key data is never logged.

## Database and demo data

The baseline migration enables `citext`, creates all enums/tables/composite foreign keys, check constraints, root-sibling and partial active-case indexes, descending latest-result indexes, and snapshot immutability triggers.

Set `SEED_DEMO_PASSWORD` to at least 12 characters, then run `npm run db:seed`. The idempotent seed creates `demo@example.com`, Demo Workspace, project `DEMO`, Authentication/Orders suites, `DEMO-1..3`, Smoke plan, Staging environment, and a draft Staging Smoke run with snapshots. Production additionally requires `ALLOW_PRODUCTION_SEED=true`.

## Verification

```bash
npm run build
npm run typecheck
npm run lint
npm run format:check
npm test
npm run test:e2e
npm run test:coverage
```

The e2e suite starts disposable PostgreSQL and SeaweedFS Testcontainers, applies real migrations, and drives the MVP only through GraphQL. It covers tenant isolation, MEMBER/ADMIN rules, last-admin protection, concurrent numbering with transaction retries, filters/search/pagination, complete disposable CRUD lifecycles, suite cycles, run source validation, immutable snapshots, repeated result attempts, summaries/dashboard, auth rate limiting, direct attachment upload/download, and the object-deletion failure outbox.

Coverage combines unit and real-container e2e execution. CI-enforced global minimums are 90% statements, 75% branches, 95% functions, and 90% lines. The current suite covers 93.06% statements, 78.21% branches, 97.25% functions, and 95.52% lines; an HTML report is written to `coverage/index.html`.

Example operations are saved in [`docs/operations.graphql`](docs/operations.graphql).

## Intentional MVP boundaries

Plans are static ordered case lists, analytics are the requested summary/dashboard only, and authorization has only ADMIN/MEMBER. There are no invitations, subscriptions, defects, integrations, audit-log UI, custom fields, or test-case versioning. Attachment deletion is eventually consistent through a durable database outbox because PostgreSQL and S3 cannot share an atomic transaction.
