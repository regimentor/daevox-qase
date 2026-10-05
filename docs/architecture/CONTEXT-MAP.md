# Architecture context map

This repository is a three-context npm workspace monorepo. Read this map first, then read the context for every package affected by a change.

```text
frontend/web  ── GraphQL operations/types ──>  backend/api  ── Prisma client ──>  backend/storage
      │                                             │                              │
      └──────────── browser/e2e contracts ──────────┴──── Object Storage ──────────┘
```

## Contexts

| Context | Location                                                         | Owns                                                                                                                        | Does not own                                                |
| ------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| API     | [`backend/api/CONTEXT.md`](../../backend/api/CONTEXT.md)         | GraphQL contract, authentication, authorization, domain services, HTTP/GraphQL infrastructure, object-storage orchestration | Database schema/migrations or UI composition                |
| Storage | [`backend/storage/CONTEXT.md`](../../backend/storage/CONTEXT.md) | Prisma schema/client, PostgreSQL migrations, seed data, database-facing transaction primitives                              | GraphQL resolvers, HTTP behavior, or frontend state         |
| Web     | [`frontend/web/CONTEXT.md`](../../frontend/web/CONTEXT.md)       | React Router app, FSD slices, GraphQL operations/client, UI and browser tests                                               | Server authorization, database access, or persistence rules |

## How to use the map

1. Read the relevant context before editing its code.
2. For a schema or operation change, read API and Web contexts together.
3. For a persistence change, read Storage and API contexts together.
4. For a cross-package change, define the contract at the boundary and run the verification for every affected context.
5. Keep each context factual. If a proposed design is not implemented, record it as an ADR or explicitly labeled plan instead of silently adding it to a context.

## Shared contracts

- GraphQL SDL in `backend/api/src/schema/schema.graphql` is the public API contract.
- API-generated resolver interfaces and frontend GraphQL types are derived artifacts.
- `@app/api` consumes `@app/storage`; the web client consumes the API through GraphQL.
- Authentication and tenant authorization are server responsibilities; frontend route protection is not a substitute for API authorization.
- S3 and SeaweedFS implementations satisfy the API's `ObjectStorage` contract; attachment bytes do not pass through GraphQL.

- SeaweedFS 4.48 serves the existing S3 `ObjectStorage` contract. The API uses the internal endpoint for metadata/deletion/readiness and the optional public endpoint for browser signatures. Production nginx preserves signed Host, URI and query on a dedicated S3 listener. PostgreSQL and GraphQL contracts are unchanged.
