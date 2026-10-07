# Implementation Plan: Virtual Card Lifecycle

**Branch**: `homework-3-submission` | **Date**: 2026-10-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-virtual-card-lifecycle/spec.md`

**Note**: Homework scope is documentation only. The stack below is the assumed target that the
tasks are written against; nothing is implemented. Research, data model and contracts are kept in
this one file to stay readable (Spec Kit would split them into research.md, data-model.md and
contracts/).

## Summary

A card service that owns card state, limits, restrictions, approvals and the audit trail, and
integrates with an issuer processor that holds card data. The processor asks the service to approve
or decline every payment in real time ("just-in-time authorization"), so freezes and limits are
enforced by our own decision logic within one request, not by eventual sync.

## Technical Context

**Language/Version**: TypeScript 5 on Node.js 22 LTS

**Primary Dependencies**: Fastify (HTTP), Zod (validation), Kysely (SQL), pino (logging with redaction),
OpenTelemetry (traces)

**Storage**: PostgreSQL 16 (cards, limits, restrictions, approvals, idempotency, audit); transactional
outbox for events

**Testing**: Vitest (unit), Testcontainers PostgreSQL (integration), Pact (consumer contract with the
processor), k6 (load), a PAN-pattern scanner on logs and fixtures

**Target Platform**: Linux containers on Kubernetes, two availability zones

**Project Type**: Web service (REST API for app and back office, webhook endpoint for the processor)

**Performance Goals** (assumed targets, see Research R-6):

- Authorization decision: p95 ≤ 150 ms, p99 ≤ 300 ms at 200 req/s sustained, 1,000 req/s peak
- Cardholder reads (card list, transactions page): p95 ≤ 300 ms
- Cardholder writes (freeze, limits, close): p95 ≤ 500 ms
- Issue card: p95 ≤ 5 s synchronous; queued completion ≤ 2 min (99.9%)

**Constraints**: no PAN/CVV in our storage or logs (constitution II); idempotent writes (III);
append-only audit (IV); money as int64 minor units (I)

**Scale/Scope**: assumed 500k cardholders, 1.5M cards, 20M transactions per month

## Constitution Check

| Principle | How the plan satisfies it | Status |
|---|---|---|
| I. Money is exact | `amount_minor BIGINT` + `currency CHAR(3)`; Zod rejects fractional minor units | PASS |
| II. Card data never leaks | Only processor token, last4, expiry stored; reveal via processor-hosted iframe token; pino redact paths + PAN regex scrubber; CI scanner | PASS |
| III. Idempotent writes | `Idempotency-Key` header required on all POST/PATCH; `idempotency_keys` table with request hash, 24 h TTL; processor calls reuse the key | PASS |
| IV. Append-only audit | Audit row written in the same DB transaction as the change; DB role has INSERT only; hash chain per card | PASS |
| V. Explicit state machine | Transition table below; optimistic concurrency via `cards.version` + `If-Match` | PASS |
| VI. Least privilege | Roles in JWT scopes; four-eyes enforced in `approvals` (requester ≠ approver); SCA token required for reveal and limit raise | PASS |
| VII. Spec is source of truth | Tasks reference FR/SC/EC ids; plan changes go back into spec first | PASS |

No violations; Complexity Tracking is empty.

## Research Decisions

- **R-1 Real-time authorization (JIT)** over pushing state to the processor: freeze and limits take
  effect on the next payment without waiting for sync. Rejected: processor-side controls only
  (sync lag, cannot express four-eyes blocks).
- **R-2 Restrictions as overlays**, not extra states: a card can be frozen by the user and blocked
  by fraud at the same time; removing one leaves the other.
- **R-3 Transactional outbox** for audit export, notifications and processor sync: no dual writes.
- **R-4 Cursor pagination** (`created_at`, `id`) for transactions: stable under new inserts.
- **R-5 Stand-in on timeout**: if our decision takes longer than the processor's 2 s limit, the
  processor declines (stand-in rule "decline"); a decline is the safe default for a debit card.
- **R-6 Performance numbers**: processors give issuers roughly 1–2 s to answer; 300 ms p99 leaves
  margin for network and retries. 200/1,000 req/s matches 20M transactions/month with a 5× peak.
  Read and write budgets follow common mobile-banking UX (screens feel instant under 300–500 ms).

## Card State Model

Lifecycle state (exactly one): `ISSUING`, `ACTIVE`, `CLOSED`, `EXPIRED`, `ISSUE_FAILED`.
Restrictions (zero or more): `CARDHOLDER_FREEZE`, `FRAUD_BLOCK`, `COMPLIANCE_BLOCK`.

| From | Action | Actor | To | Notes |
|---|---|---|---|---|
| — | issue | cardholder | ISSUING | creates card row + outbox job |
| ISSUING | processor confirms | system | ACTIVE | |
| ISSUING | processor fails / 2 min timeout | system | ISSUE_FAILED | terminal, slot freed |
| ACTIVE | freeze / unfreeze | cardholder | ACTIVE (+/- CARDHOLDER_FREEZE) | idempotent |
| ACTIVE | fraud block | fraud system | ACTIVE (+FRAUD_BLOCK) | |
| ACTIVE | compliance block | compliance officer | ACTIVE (+COMPLIANCE_BLOCK) | reason required |
| ACTIVE | lift block | ops + second approver | ACTIVE (−block) | four-eyes |
| ACTIVE | close | cardholder, compliance | CLOSED | terminal |
| ACTIVE | expiry date passes | system | EXPIRED | terminal |

Payment approval rule: `state = ACTIVE` AND no restrictions AND within all limits AND account has
funds (funds check is delegated to the ledger service).

## Data Model (summary)

| Table | Key columns |
|---|---|
| `cards` | id (ULID), cardholder_id, processor_token, last4, exp_month, exp_year, currency, nickname, state, version, created_at, closed_at |
| `card_restrictions` | card_id, type, reason_code, applied_by, applied_at, lifted_by, lifted_at |
| `card_limits` | card_id, period (`TRANSACTION`/`DAY`/`MONTH`), amount_minor, currency, updated_at |
| `card_spend_counters` | card_id, period, period_start (cardholder TZ), spent_minor |
| `card_transactions` | id, card_id, processor_txn_id (unique), amount_minor, currency, merchant_name, mcc, status, decline_reason, created_at |
| `approval_requests` | id, card_id, type, payload, requested_by, decided_by, status, expires_at |
| `audit_events` | id, card_id, actor_id, actor_role, action, before, after, reason, correlation_id, prev_hash, hash, created_at |
| `idempotency_keys` | key, actor_id, request_hash, response, created_at (TTL 24 h) |

## API Contract (summary)

| Method | Path | Who | Notes |
|---|---|---|---|
| POST | `/v1/cards` | cardholder | issue; Idempotency-Key; 201 / 202 (issuing) / 409 limit reached |
| GET | `/v1/cards` | cardholder | own cards, masked |
| POST | `/v1/cards/{id}/freeze`, `/unfreeze` | cardholder | If-Match version; 200 / 409 conflict |
| PUT | `/v1/cards/{id}/limits` | cardholder | 200 applied / 202 pending approval / 422 invalid |
| GET | `/v1/cards/{id}/transactions?cursor=&status=&from=&to=` | cardholder | 50 per page, max 100 |
| POST | `/v1/cards/{id}/reveal-sessions` | cardholder | SCA token; returns processor iframe token (60 s) |
| POST | `/v1/cards/{id}/close` | cardholder | confirmation flag required |
| GET | `/v1/admin/cards?cardholder=&last4=` | ops | masked; paginated |
| POST | `/v1/admin/cards/{id}/blocks` | compliance | reason required |
| POST | `/v1/admin/approvals/{id}/decision` | ops | approver ≠ requester |
| GET | `/v1/admin/cards/{id}/audit` | compliance | read only |
| POST | `/v1/processor/authorizations` | processor (mTLS) | JIT decision, p99 ≤ 300 ms |
| POST | `/v1/processor/events` | processor (mTLS) | card created, transaction cleared, refunds |

Errors use RFC 9457 problem details with stable `type` codes (`card_frozen`, `limit_exceeded`,
`version_conflict`, `idempotency_mismatch`, ...).

## Project Structure

### Documentation (this feature)

```text
specs/001-virtual-card-lifecycle/
├── spec.md
├── plan.md        # this file (research, data model, contracts summarized here)
├── tasks.md
└── checklists/requirements.md
```

### Source Code (assumed target layout)

```text
src/
├── cards/          # card aggregate, state machine, service, routes
├── limits/         # limits, spend counters, policy ceiling
├── authorization/  # JIT decision endpoint and rules
├── approvals/      # four-eyes requests
├── audit/          # append-only writer, hash chain, read API
├── processor/      # client, webhooks, mTLS, idempotent retries
├── platform/       # idempotency, auth/scopes, problem errors, logging redaction, outbox
└── admin/          # back-office routes
tests/
├── unit/
├── integration/
├── contract/
└── load/
```

**Structure Decision**: single web service with feature folders; back office uses the same service
behind separate scopes.

## Complexity Tracking

Empty: no constitution violations.
