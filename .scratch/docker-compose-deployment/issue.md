# Production Docker Compose deployment

Status: done
Owner: Codex

## Problem

The repository needs a repeatable production-style deployment on a server using Docker Compose. The server must build the application images locally from the checked-out repository, run database migrations automatically before starting the backend, expose the application through nginx on a configurable port, and initialize a safe `.env` without committing production secrets.

## Scope

Included:

- Add production deployment files under `deploy/`.
- Add a production `docker-compose.production.yml` while preserving the existing local `docker-compose.yml`.
- Build backend and frontend images on the target server from the repository and `package-lock.json`.
- Run PostgreSQL and MinIO in Compose with named persistent volumes.
- Run an idempotent `deploy/init.sh` that creates `.env` from `.env.example` on first setup.
- Generate production JWT Ed25519 keys, PostgreSQL credentials, MinIO credentials, and `SEED_DEMO_PASSWORD` without printing them.
- Require `PUBLIC_ORIGIN` on the first `init.sh` invocation and use it for `CORS_ORIGINS`.
- Run `npm run db:migrate:deploy` from the backend container before starting NestJS.
- Serve the SPA and proxy `/graphql` and `/health/*` through nginx.
- Publish only `${NGINX_PORT}:80` externally.
- Add healthchecks, dependency readiness, and `restart: unless-stopped` for long-running services.
- Document initial installation, redeployment, health verification, logs, volume safety, and server prerequisites.

Excluded:

- TLS certificates, Certbot, DNS, firewall configuration, and domain provisioning.
- Automatic PostgreSQL or MinIO backups.
- Automatic migration or image rollback.
- Systemd integration, centralized logging, resource limits, and Docker image pruning.
- Automatic production seeding.

## Acceptance criteria

- [x] `deploy/docker-compose.production.yml` exists and starts PostgreSQL, MinIO, `minio-init`, backend, and frontend/nginx.
- [x] The existing development Compose workflow remains usable and is not replaced by production-only settings.
- [x] Production Dockerfiles build successfully on a server with Docker Engine and the Compose plugin, using the checked-out repository and committed `package-lock.json`; no Docker Registry is required.
- [x] Runtime images use Node.js 22.12 or newer and production dependencies are installed with `npm ci`.
- [x] Backend image contains the Prisma schema, migrations, generated client, and all files needed to run `npm run db:migrate:deploy`.
- [x] Backend startup runs migrations synchronously before `npm run start -w @app/api`; a migration failure prevents the application from starting and exits non-zero.
- [x] Compose starts backend only after PostgreSQL and MinIO/bucket readiness checks pass.
- [x] PostgreSQL and MinIO use named volumes that survive container recreation.
- [x] PostgreSQL, MinIO, and backend ports are not published on the host; only nginx publishes `${NGINX_PORT}:80`.
- [x] nginx serves the frontend with SPA fallback to `index.html`.
- [x] nginx proxies `/graphql`, `/health/live`, and `/health/ready` to backend and forwards standard `Host`, `X-Real-IP`, `X-Forwarded-For`, and `X-Forwarded-Proto` headers.
- [x] nginx permits attachment requests up to `26m` and has appropriate proxy timeouts.
- [x] Frontend is built with `VITE_GRAPHQL_URL=/graphql`, so browser requests use the nginx origin.
- [x] `deploy/init.sh` requires `PUBLIC_ORIGIN` when creating a new `.env` and fails clearly if OpenSSL is unavailable.
- [x] On first run, `init.sh` copies `.env.example`, configures Compose service hostnames (`postgres` and `minio`), generates all production secret values, sets `.env` permissions to `600`, and does not print secret values.
- [x] Generated PostgreSQL passwords use a URL-safe alphabet and are consistent with `DATABASE_URL` and `POSTGRES_PASSWORD`.
- [x] The generated MinIO root credentials are reused as `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`; the fixed bucket name is `daevox-attachments`.
- [x] A second `init.sh` run does not overwrite an existing `.env` or regenerate JWT keys and credentials.
- [x] Production Compose uses pinned image versions rather than `latest`.
- [x] `NODE_ENV=production` disables development GraphQL introspection/landing-page behavior as already defined by the API.
- [x] Healthchecks verify backend readiness through `/health/ready` and nginx exposes the health endpoints successfully.
- [x] A clean-volume deployment applies all committed migrations and becomes healthy.
- [x] A redeployment using `docker compose --env-file .env -f deploy/docker-compose.production.yml up -d --build` preserves database and object-storage data.
- [x] Documentation explicitly warns not to use `docker compose down -v` during a normal update.
- [x] Documentation includes `docker compose logs -f` for logs and states that volumes are not backups.
- [x] The deployment verification includes `docker compose config`, image build, clean startup, migration success, health checks through nginx, data persistence after recreation, and a no-op second `init.sh` run.

## Constraints and context

- The repository is an npm workspace monorepo with `@app/api`, `@app/storage`, and `@app/web`.
- Read `docs/architecture/CONTEXT-MAP.md` and the affected package contexts before implementation.
- The API owns health endpoints, GraphQL, configuration validation, and the `ObjectStorage` contract.
- Storage owns Prisma schema, migrations, and database access. Deployment must use `npm run db:migrate:deploy`; applied migrations remain immutable.
- The frontend currently supports same-origin GraphQL through `VITE_GRAPHQL_URL=/graphql`.
- The existing root `.env.example` and local Compose file are development-oriented and may need production-compatible placeholders while retaining local setup behavior.
- Do not commit `.env`, credentials, JWT keys, volumes, or generated infrastructure data.
- Do not edit generated GraphQL or Prisma artifacts by hand.
- Preserve tenant isolation and all existing API, storage, attachment, transaction, retry, locking, immutable snapshot, and append-only result invariants.
- A single backend replica is assumed so startup migration execution has no competing migration runners.
- The target server must provide Linux, Git, Docker Engine, the Docker Compose plugin, OpenSSL, and storage for named volumes. Server provisioning and network policy are outside this issue.

## Implementation notes

Implementation started with an isolated production Compose stack under `deploy/`, production backend/frontend images, nginx configuration, an idempotent environment initializer, and deployment documentation.

Completed implementation and verification: `docker compose config`, both production image builds, clean startup, migration-before-NestJS startup, nginx liveness/readiness, MinIO bucket readiness, named-volume persistence after container recreation, and isolated first-run/second-run initializer checks all passed. `npm run build`, `npm run typecheck`, `npm run lint`, targeted `oxfmt --check`, `npm run typecheck:web`, `npm run codegen:check`, `npm run test:web`, privileged `npm run test:e2e` (9/9), and privileged `npm run test:coverage` (92.99% statements, 78.11% branches, 97.25% functions, 95.53% lines) passed. The repository-wide `npm run format:check` remains blocked by 66 pre-existing `.agents/` documents; `npm test` also retains two pre-existing frontend suite-loading failures while 61 tests pass. Docker verification resources were removed after testing; the existing ignored `.env` was preserved.

Agreed deployment contract:

1. `PUBLIC_ORIGIN=http://server.example:8080 ./deploy/init.sh` initializes `.env` only when it does not exist.
2. `docker compose --env-file .env -f deploy/docker-compose.production.yml up -d --build` builds images on the server and starts the stack.
3. The backend entrypoint runs `npm run db:migrate:deploy`, then starts `@app/api` only after migrations succeed.
4. nginx is the only public service and serves the SPA plus backend proxy routes.
5. Normal updates reuse `.env` and named volumes; they must not use `down -v`.
6. Production seed execution, if ever needed, is a separate explicit operation and requires the existing production opt-in safeguards.

Affected areas: deployment files, root environment template/documentation, backend image/runtime entrypoint, frontend build image, and nginx configuration. No GraphQL schema, domain behavior, Prisma schema, or generated artifact change is intended.

Verification to record after implementation:

```bash
docker compose --env-file .env -f deploy/docker-compose.production.yml config
docker compose --env-file .env -f deploy/docker-compose.production.yml build
docker compose --env-file .env -f deploy/docker-compose.production.yml up -d
docker compose --env-file .env -f deploy/docker-compose.production.yml ps
curl -fsS "http://127.0.0.1:${NGINX_PORT}/health/live"
curl -fsS "http://127.0.0.1:${NGINX_PORT}/health/ready"
```

Also run the repository verification checks required for the touched areas and record exact results in this file before changing the status to `done`.

## Blockers

None for implementation. TLS/domain, server provisioning, firewall, backups, and rollback procedures are intentionally separate operational concerns.
