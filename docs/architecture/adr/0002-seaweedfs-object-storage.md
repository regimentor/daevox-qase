# ADR 0002: SeaweedFS for attachment object storage

- Status: Accepted
- Date: 2026-10-05
- Contexts: API, Web, deployment
- Issue: `.scratch/seaweedfs-object-storage/issue.md`

## Context

MinIO server/client images blocked the local Compose startup. Attachments already use S3 operations behind `ObjectStorage`; their bytes, tenant authorization and durable deletion outbox must retain their existing contracts.

## Decision

Use `chrislusf/seaweedfs:4.48` with `weed mini` for local and single-server production Compose and real API/browser e2e. Its versioned source and binary support credential seeding and idempotent bucket creation; persist all data and metadata under `/data`. Keep internal component ports unpublished. Cluster availability and replication are outside this MVP's scope.

Separate backend S3 operations (`S3_ENDPOINT`) from browser signing (`S3_PUBLIC_ENDPOINT`, optional locally). Production exposes S3 through a dedicated nginx listener preserving Host, path and query. A real S3 test confirmed browser PUT/HEAD/GET/DELETE, expiry, authentication and proxy signatures. Configure the AWS SDK to calculate checksums only when required: its default empty-body checksum caused a confirmed `BadDigest` on presigned PUT.

## Consequences

No GraphQL or database migration is required. SeaweedFS volumes cannot read MinIO's on-disk format. Inventory and copy existing objects through S3, verify SHA-256/size/MIME, keep old volumes and prepare rollback before switching. Production migration requires separate owner approval. Backups must capture all filer metadata and volume data consistently, alongside PostgreSQL and credentials. Docker-based startup, browser e2e and backup/restore still need validation in an environment with Docker access; accepted implementation does not assert production cutover is complete.

## Alternatives considered

Keeping MinIO would retain the unavailable image dependencies. `weed server -filer -s3` is composable but needs more bootstrap configuration; this pinned `mini` supports the required single-server credentials and bucket lifecycle. Multi-server SeaweedFS adds operational scope without satisfying an additional MVP requirement.

## Sources

- [SeaweedFS 4.48 release](https://github.com/seaweedfs/seaweedfs/releases/tag/4.48)
- [Versioned mini implementation](https://github.com/seaweedfs/seaweedfs/blob/4.48/weed/command/mini.go)
- [weed mini guide](https://github.com/seaweedfs/seaweedfs/wiki/Quick-Start-with-weed-mini)
