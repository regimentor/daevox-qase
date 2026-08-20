# Production Docker Compose deployment

This deployment builds the API and SPA on the target server from the checked-out repository. The server needs Linux, Git, Docker Engine with the Compose plugin, OpenSSL, and enough disk space for the named PostgreSQL and MinIO volumes.

## Initial installation

From the repository root, initialize the production environment. `PUBLIC_ORIGIN` is the browser-visible origin and is required only when `.env` does not exist:

```bash
PUBLIC_ORIGIN=http://server.example:8080 ./deploy/init.sh
chmod 600 .env
docker compose --env-file .env -f deploy/docker-compose.production.yml config
docker compose --env-file .env -f deploy/docker-compose.production.yml up -d --build
```

The initializer copies `.env.example`, generates Ed25519 JWT keys, PostgreSQL and MinIO credentials, and a demo password, then sets `.env` permissions to `600`. It never prints secret values. A later invocation is a no-op and does not regenerate credentials. Production seeding is intentionally excluded; do not enable it without reviewing the existing production opt-in safeguards.

Only nginx publishes a host port. PostgreSQL, MinIO, and the API stay on the Compose network. The SPA is served by nginx, which proxies `/graphql`, `/health/live`, and `/health/ready` to the API. Unknown frontend paths fall back to `index.html`.

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

The backend runs `npm run db:migrate:deploy` synchronously before NestJS starts. A failed migration keeps the backend unhealthy and prevents normal application startup. `postgres` and `minio-init` readiness gates must pass before the backend starts.

Do not use `docker compose down -v` during a normal update: it removes the named database and object-storage volumes. The volumes survive container recreation, but volumes are not backups; arrange separate PostgreSQL and MinIO backup procedures for production.

TLS certificates, DNS, firewall rules, backups, rollback, systemd, and resource limits are outside this Compose deployment and must be handled separately.
