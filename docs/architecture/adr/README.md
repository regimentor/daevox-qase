# Architecture decision records

Use an ADR when a decision changes a package boundary, public contract, persistence model, security posture, operational workflow, or a durable invariant. Do not use an ADR for ordinary implementation details or temporary debugging notes.

## Process

1. Create the next numbered file as `NNNN-short-title.md`.
2. Record the decision before or alongside implementation.
3. Link affected contexts and issues.
4. Mark the ADR `Accepted`, `Superseded`, or `Deprecated` as the decision changes.
5. Update `CONTEXT-MAP.md` or a package context when the accepted decision changes current behavior.

## Template

```markdown
# ADR NNNN: <title>

- Status: Proposed
- Date: YYYY-MM-DD
- Contexts: <API, Storage, Web>
- Issue: `.scratch/<feature>/issue.md`

## Context

What problem and constraints require a decision?

## Decision

What are we choosing?

## Consequences

What becomes easier, harder, required, or explicitly out of scope?

## Alternatives considered

Which credible alternatives were rejected and why?
```
