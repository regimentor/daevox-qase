# ADR 0001: Source suites and soft archive for plans and repository objects

- Status: Accepted
- Date: 2026-08-21
- Contexts: API, Storage, Web
- Issue: `.scratch/test-plans-from-suites/issue.md`

## Context

Test plans were manual snapshots of selected cases, while repository deletion was irreversible. The product needs plans that can be synchronized from several suites without duplicating cases, while existing runs must remain immutable and archived repository objects must be recoverable.

## Decision

Store selected source suites separately from plan-case rows. Each plan-case row has a `manual` flag and may have one or more source-suite provenance rows. Synchronization derives active cases recursively from the selected active suites in deterministic tree/case-number order, appends newly discovered cases, and removes source-only links only when no selected source remains.

Replace public suite/case hard-delete operations with soft archive and restore operations. An archive operation groups the affected suite subtree or case. Archive previews are calculated before the transaction, archive mutations mark repository objects and active plan-case links in one transaction, and restore clears only the archive state. Plan/source links are intentionally not restored automatically; a restored active case may re-enter a still-linked plan through ordinary source synchronization.

## Consequences

- Existing plan-case rows remain compatible because migrated rows default to `manual = true` and have no source suites.
- Plans expose active and archived case counts separately; run creation continues to snapshot only active source cases.
- Archive, restore, source replacement, case creation, and case movement require transaction-aware service boundaries and tenant-scoped validation.
- Source-suite removal and archive operations need user-facing impact previews and confirmation flows.
- Historical archive operations remain as provenance records even after objects are restored.

## Alternatives considered

- Recomputing plan membership on every read was rejected because plans remain ordered snapshots and existing positions must not be rebuilt.
- A single source-suite ID on each plan-case was rejected because cases can be covered by overlapping suites.
- Hard deletion with an undo table was rejected because it would complicate foreign-key preservation and make repository history less explicit than soft archive state.
