# agents.md — Virtual Card Service

Rules for any AI coding agent (Claude Code, Copilot, Cursor, Codex) working on this project.
Source of truth: [specification.md](specification.md). Principles: [constitution](.specify/memory/constitution.md).
If a request conflicts with them, stop and ask; do not improvise.

## Project

- A card service for virtual debit cards: issue, freeze/unfreeze, limits, transactions, reveal,
  close, plus back-office blocks, four-eyes approvals and an append-only audit trail.
- The issuer processor holds card data and asks us to approve every payment in real time.

## Tech stack (assumed)

- TypeScript 5 (strict), Node.js 22, Fastify, Zod, Kysely, PostgreSQL 16, pino, OpenTelemetry.
- Tests: Vitest, Testcontainers PostgreSQL, Pact, k6.
- Layout: feature folders under `src/` (`cards`, `limits`, `authorization`, `approvals`, `audit`,
  `processor`, `platform`, `admin`); tests under `tests/{unit,integration,contract,load}`.

## Banking rules (MUST)

- Money is `{ amount_minor: int64, currency: ISO 4217 }`. NEVER use floats or `Number` arithmetic on
  money that can exceed 2^53; NEVER mix currencies; validate decimals against the currency exponent.
- NEVER store, log, print, trace, return or put in fixtures a full card number (PAN) or CVV. Show
  cards as `**** 1234`. Test data uses processor sandbox tokens, not numbers.
- Every POST/PUT/PATCH handler requires `Idempotency-Key` and goes through the idempotency hook.
- Every state change and every denied sensitive attempt writes an audit event in the SAME database
  transaction. NEVER update or delete audit rows.
- Card changes use optimistic locking (`version`); return `409 version_conflict`, never last-write-wins.
- Only transitions from the state table in `specs/001-virtual-card-lifecycle/plan.md` are allowed.
- Lifting blocks and over-ceiling limits require an approver different from the requester.
- Timestamps in UTC; limit periods in the cardholder's time zone.

## Code style

- Small pure functions for rules (`decideAuthorization` is a chain of rules, each testable alone).
- Errors: RFC 9457 problem details with the stable `type` codes listed in specification.md §5.
- Validate all input at the edge with Zod; internal code trusts typed values.
- No `any`; no default exports; one module per concern; names in English.
- Comments explain why, not what. No commented-out code.

## Testing and verification (definition of done)

- Every task in specification.md §10 is done only when its DoD is met and tests are green.
- New rule → unit test with boundary values (limit, limit + 1 minor unit, period boundaries).
- New endpoint → integration test for success, validation error, wrong role, idempotent replay,
  version conflict.
- Run the PAN scanner on any new fixture or log sample.
- Performance-sensitive code (authorization path) → keep one DB read, no external calls; check
  against NFR-10 in the load test.

## Edge cases — how to treat them

- Look up the case in specification.md §8 first; implement exactly the listed behavior.
- If a case is missing: choose the safest behavior (decline the payment, deny the action, keep
  the card frozen), audit it, and add the case to the spec in the same change.
- Never swallow errors from the processor; retry with the same idempotency key, then fail visibly.
- Prefer idempotent, retry-safe writes over "check then write".

## Security and compliance

- Secrets only from the secret manager; never in code, `.env` committed files or logs.
- Least privilege: check the role scope on every endpoint; another user's card → 404.
- Do not add dependencies without stating why; prefer well-maintained, widely used packages.
- Do not weaken a constitution rule to make a test pass.

## Workflow

- Spec first: if behavior changes, update `specs/001-virtual-card-lifecycle/spec.md` and
  `specification.md`, then code.
- Keep changes scoped to one task id (T-xxx); mention it in the commit message: `[T018] ...`.
