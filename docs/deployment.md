# Production Docker Compose deployment

This deployment builds the API and SPA on the target server from the checked-out repository. The server needs Linux, Git, Docker Engine with the Compose plugin, OpenSSL, and enough disk space for the named PostgreSQL and SeaweedFS volumes.

## Initial installation

From the repository root, initialize the production environment. `PUBLIC_ORIGIN` and `PUBLIC_S3_ORIGIN` are the browser-visible app and S3 origins, required only when `.env` does not exist:

```bash
PUBLIC_ORIGIN=http://server.example:8080 PUBLIC_S3_ORIGIN=http://server.example:9000 ./deploy/init.sh
chmod 600 .env
docker compose --env-file .env -f deploy/docker-compose.production.yml config
docker compose --env-file .env -f deploy/docker-compose.production.yml up -d --build
```

The initializer copies `.env.example`, generates Ed25519 JWT keys, PostgreSQL and SeaweedFS credentials, and a demo password, then sets `.env` permissions to `600`. It never prints secret values. A later invocation is a no-op and does not regenerate credentials. Production seeding is intentionally excluded; do not enable it without reviewing the existing production opt-in safeguards.

Only nginx publishes host ports (app and S3). PostgreSQL, SeaweedFS, and the API stay on the Compose network. The SPA is served by nginx, which proxies `/graphql`, `/health/live`, and `/health/ready` to the API. Unknown frontend paths fall back to `index.html`.

## Redeployment and operations

Use the same `.env` for updates so credentials, the public origin, and volume names remain stable:

```bash
docker compose --env-file .env -f deploy/docker-compose.production.yml up -d --build
docker compose --env-file .env -f deploy/docker-compose.production.yml ps
docker compose --env-file .env -f deploy/docker-compose.production.yml logs -f
```

Verify the public health endpoints through nginx:

```bash
curl -fsS "http://127.0.0.1:${NGINX_PORT}/health/live"
curl -fsS "http://127.0.0.1:${NGINX_PORT}/health/ready"
```

The backend runs `npm run db:migrate:deploy` synchronously before NestJS starts. A failed migration keeps the backend unhealthy and prevents normal application startup. `postgres` and `seaweedfs` readiness gates must pass before the backend starts.

Do not use `docker compose down -v` during a normal update: it removes the named database and object-storage volumes. The volumes survive container recreation, but volumes are not backups; arrange separate PostgreSQL and SeaweedFS backup procedures for production.

TLS certificates, DNS, firewall rules, systemd, and resource limits must be handled separately.

## SeaweedFS S3 endpoint

SeaweedFS is pinned to `chrislusf/seaweedfs:4.48` and runs `weed mini` with all persistent state under `/data`. It pre-creates `S3_BUCKET` and enables signed S3 authentication from `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`. Keep those values unchanged on redeployment. Local Compose publishes only S3 on `localhost:9000`; production publishes nginx's app and S3 listeners. Filer, master, admin, volume and gRPC ports have no host mappings. Do not expose them through an external proxy.

On first production installation, pass both origins:

```bash
PUBLIC_ORIGIN=http://server.example:8080 PUBLIC_S3_ORIGIN=http://server.example:9000 ./deploy/init.sh
```

`S3_ENDPOINT=http://seaweedfs:8333` serves backend HEAD/DELETE/readiness calls. `S3_PUBLIC_ENDPOINT` serves presigned PUT/GET links, via nginx port `S3_PORT` (default 9000). The S3 listener preserves the original Host including port, object path, and query string. Use a dedicated HTTPS S3 origin when the app uses HTTPS; configure the external TLS proxy to preserve that signed Host and URI without redirects or path prefixes. Both browsers and the backend need their respective endpoint reachable. Changing a URL after signing invalidates its signature. Local installations may leave `S3_PUBLIC_ENDPOINT` empty to use `S3_ENDPOINT` for both purposes.

The Compose healthcheck checks bucket metadata and an S3 authentication rejection; application readiness performs authenticated `HeadBucket`. Browser CORS is handled by the S3 gateway. The AWS adapter requests checksums only when required: the SDK's default empty-body checksum otherwise makes presigned browser PUT fail with `BadDigest` on this version.

## Backup and restore

For a consistent single-server backup, pause application traffic and stop the backend and SeaweedFS gracefully. Back up PostgreSQL along with the **entire** SeaweedFS named volume: volume data/indexes, master state, filer LevelDB metadata, mini configuration and IAM/key state. Copying only object bytes or only filer metadata cannot restore attachments. Keep `.env` and the exact image/version in secure backup storage as well; it contains credentials and signing keys.

Example (run from the repository root; use a private backup directory):

```bash
mkdir -m 700 backups
docker compose --env-file .env -f deploy/docker-compose.production.yml stop backend seaweedfs
docker compose --env-file .env -f deploy/docker-compose.production.yml run --rm --no-deps --user root --entrypoint /bin/sh -v "$PWD/backups:/backup" seaweedfs -c 'tar -C /data -czf /backup/seaweedfs.tar.gz .'
docker compose --env-file .env -f deploy/docker-compose.production.yml up -d
```

Restore first into an isolated Compose project with a fresh volume and the backed-up configuration. While SeaweedFS is stopped, extract the archive into its `/data` mount (as root), then start the same pinned image; its entrypoint restores ownership. Verify bucket readiness, object count and SHA-256 hashes through S3, then test an authenticated attachment download against the matching PostgreSQL backup. Do not extract over a running metadata store. Test restoration before relying on a backup; container-based backup/restore has not yet been exercised in the task environment because its Docker socket is inaccessible.

## Existing MinIO environments: inventory and cutover

Do not run the new Compose deployment against an existing environment until its old bucket is inventoried. The initializer intentionally leaves existing `.env` files untouched. Keep the old Compose file/image references, `.env` and MinIO volumes; the new SeaweedFS volume has a different name. Never mount a MinIO volume as SeaweedFS `/data` or run `down -v`.

`scripts/migrate-object-storage.mjs` supports `inventory`, `copy`, and `verify` using S3 APIs. Set `SOURCE_S3_ENDPOINT`, `SOURCE_S3_BUCKET`, `SOURCE_S3_ACCESS_KEY_ID`, `SOURCE_S3_SECRET_ACCESS_KEY` in a private shell environment; copying/verifying also needs the corresponding `TARGET_S3_*` values. Region defaults to `us-east-1`, or set `SOURCE_S3_REGION` / `TARGET_S3_REGION`. It prints aggregate counts only. `copy` preserves keys, bytes, Content-Type and object metadata, verifies SHA-256 and size/MIME after each write, and can be repeated; source objects are never modified. It supports the application's single-current-version attachment objects, not version history or arbitrary bucket policies.

```bash
node scripts/migrate-object-storage.mjs inventory
# After owner approval, with writers and attachment cleanup paused:
node scripts/migrate-object-storage.mjs copy
node scripts/migrate-object-storage.mjs verify
```

Prepare a dedicated empty target bucket and a PostgreSQL backup. Stop API writes and cleanup for the final inventory/copy/verify. Record source and target totals and verify every object's SHA-256, size and MIME before switching `.env` to the new internal/public endpoints. For an existing `.env`, explicitly set `S3_PUBLIC_ENDPOINT` and `S3_PORT` as well as the target access keys; do not rotate JWT/database credentials. Restart the API, check `/health/ready`, and test browser upload, confirmation, Cyrillic download and deletion. Keep traffic paused until these checks pass.

Rollback before reopening writes by restoring the old Compose/configuration and pointing the API back at the retained MinIO bucket. After new writes are accepted, rollback requires another freeze and copying/verifying new and changed objects back to MinIO together with a database-consistent reconciliation of deletions; simply changing the endpoint would lose data. Production copying and cutover require the environment owner's separate authorization. Existing MinIO contents cannot be determined from the task environment's inaccessible Docker daemon.
