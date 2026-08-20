# Local issue tracking

This repository tracks work as markdown files rather than through a remote issue service. Each issue lives at:

```text
.scratch/<feature>/issue.md
```

Use a short, lowercase, hyphenated feature directory. Keep one primary issue file per feature and add supporting notes in the same directory only when necessary.

## Issue format

```markdown
# <Short title>

Status: draft
Owner: <person or agent>

## Problem

What user or engineering problem needs to be solved?

## Scope

What is included and explicitly excluded?

## Acceptance criteria

- [ ] Observable criterion one
- [ ] Observable criterion two

## Constraints and context

Relevant domain context, invariants, links, or dependencies.

## Implementation notes

Decisions, touched packages, and verification results.

## Blockers

External decisions or systems required for progress, if any.
```

## Lifecycle

Use these statuses:

- `draft`: the problem or scope is still being clarified.
- `ready`: acceptance criteria are concrete and work can start.
- `in-progress`: implementation or investigation is active.
- `blocked`: progress depends on an external decision, credential, service, or unresolved requirement.
- `done`: acceptance criteria are met and the relevant verification is recorded.

When an issue changes status, update the `Status` line and leave a short note in `Implementation notes`. Do not mark work `done` based only on code changes; record the checks that support completion.

Never put secrets, credentials, tokens, private keys, or unnecessary personal data in an issue file.
