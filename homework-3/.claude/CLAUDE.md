@../agents.md

# Claude Code rules for this project

Shared agent rules are imported above from `agents.md`. This file adds Claude-specific behavior.

## Before you act

- Read the relevant section of `specification.md` and the constitution before writing code or docs.
- For a new feature or a behavior change, use the Spec Kit skills in this folder in order:
  `/speckit-specify` → `/speckit-clarify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-analyze`.
  Do not skip to implementation.
- Work on one task id at a time (T-xxx). State which objective (OBJ-x) it serves.

## FinTech-sensitive defaults

- When unsure, choose the safer behavior: decline, deny, keep frozen, require approval.
- Never print card numbers, tokens or secrets in the terminal, even when debugging.
- Generated test data: synthetic names, `example.com` e-mails, processor sandbox card tokens.
- Money examples always use integer minor units and a currency code.

## Naming and patterns

- Files: `camelCase.ts`; types and classes `PascalCase`; error types `snake_case`.
- API paths: plural nouns, `/v1/...`; actions as sub-resources (`/cards/{id}/freeze`).
- Database: `snake_case` tables and columns; money columns end in `_minor`.

## Avoid

- Floats for money, `Date` arithmetic without time zone, `UPDATE`/`DELETE` on `audit_events`.
- Calling the processor from the authorization request path.
- Large refactors mixed with feature work; new dependencies without a reason in the PR.

## Output style

- Short answers, lists over paragraphs. Show the diff summary and the tests you ran.
- Confirm before running database migrations, deleting files or anything outside this folder.
