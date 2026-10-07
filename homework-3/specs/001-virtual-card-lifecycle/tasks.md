---
description: "Task list for Virtual Card Lifecycle"
---

# Tasks: Virtual Card Lifecycle

**Input**: [spec.md](./spec.md), [plan.md](./plan.md)

**Tests**: Required. The constitution (VII) and spec (SC-004 to SC-006) demand verification, so each
story includes its tests. Detailed acceptance criteria per task live in `../../specification.md`
(section "Low-Level Tasks"); this file is the Spec Kit checklist view.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[US n]**: user story from spec.md

## Phase 1: Setup

- [ ] T001 Create service skeleton per plan structure (`src/`, `tests/`), TypeScript strict, Vitest
- [ ] T002 [P] Configure pino logger with redaction paths and PAN regex scrubber in `src/platform/logging.ts`
- [ ] T003 [P] Add CI gates: lint, typecheck, tests, PAN scanner over logs and fixtures in `.github/workflows/ci.yml`

## Phase 2: Foundational (blocks all stories)

- [ ] T004 Money value object (int64 minor units + ISO 4217, exponent validation) in `src/platform/money.ts`
- [ ] T005 [P] Problem-details error model with stable codes in `src/platform/errors.ts`
- [ ] T006 [P] Auth: JWT scopes for cardholder / ops / compliance / fraud, SCA token check in `src/platform/auth.ts`
- [ ] T007 Idempotency middleware + `idempotency_keys` table (hash, replay, mismatch 422) in `src/platform/idempotency.ts`
- [ ] T008 Database migrations for all tables in plan Data Model in `migrations/0001_cards.sql`
- [ ] T009 Append-only audit writer (same transaction, hash chain, INSERT-only role) in `src/audit/auditWriter.ts`
- [ ] T010 Transactional outbox + dispatcher in `src/platform/outbox.ts`
- [ ] T011 Card state machine (transition table, restrictions overlay, version check) in `src/cards/stateMachine.ts`
- [ ] T012 [P] Processor client with mTLS, timeouts, idempotent retries in `src/processor/client.ts`

**Checkpoint**: foundation ready; stories can proceed in parallel.

## Phase 3: US1 Issue a virtual card (P1) — MVP

- [ ] T013 [US1] Issue service: 5-card cap, ISSUING row, outbox job in `src/cards/issueCard.ts`
- [ ] T014 [US1] Processor issuance worker: ACTIVE / ISSUE_FAILED, 2 min timeout in `src/processor/issuanceWorker.ts`
- [ ] T015 [US1] Routes `POST/GET /v1/cards` (masked output) in `src/cards/routes.ts`
- [ ] T016 [P] [US1] Tests: duplicate submit → one card; 6th card → 409; partner outage → ISSUE_FAILED in `tests/integration/issueCard.test.ts`

## Phase 4: US2 Freeze / unfreeze (P1)

- [ ] T017 [US2] Freeze/unfreeze commands (idempotent, If-Match version) in `src/cards/freeze.ts`
- [ ] T018 [US2] JIT authorization endpoint + rule chain (state, restrictions) in `src/authorization/decide.ts`
- [ ] T019 [P] [US2] Tests: concurrent freeze/unfreeze → one 409; unfreeze keeps fraud block; decline reason `card_frozen` in `tests/integration/freeze.test.ts`

## Phase 5: US3 Spending limits (P2)

- [ ] T020 [US3] Limits API with ceiling check → approval request in `src/limits/setLimits.ts`
- [ ] T021 [US3] Spend counters per period in cardholder TZ, refund adjustment in `src/limits/spendCounters.ts`
- [ ] T022 [US3] Limit rule in authorization chain in `src/authorization/rules/limitRule.ts`
- [ ] T023 [P] [US3] Tests: boundary amounts, midnight rollover, lower-than-spent, currency mismatch in `tests/unit/limits.test.ts`

## Phase 6: US4 Transactions (P2)

- [ ] T024 [US4] Processor events webhook: store/update transactions idempotently by `processor_txn_id` in `src/processor/events.ts`
- [ ] T025 [US4] `GET /v1/cards/{id}/transactions` cursor pagination + filters in `src/cards/transactions.ts`
- [ ] T026 [P] [US4] Tests: 250 rows paging without gaps/duplicates; out-of-order events; empty state in `tests/integration/transactions.test.ts`

## Phase 7: US5 Reveal details (P2)

- [ ] T027 [US5] Reveal session: SCA required, 5/hour/card rate limit, processor iframe token, audit (no data) in `src/cards/reveal.ts`
- [ ] T028 [P] [US5] Tests: failed SCA → denied + audited; 6th reveal → 429 + fraud signal; response contains no PAN in `tests/integration/reveal.test.ts`

## Phase 8: US6 Close (P3)

- [ ] T029 [US6] Close command (confirmation flag, terminal, processor sync via outbox) in `src/cards/close.ts`
- [ ] T030 [US6] Expiry job + 30-day renewal notice in `src/cards/expiryJob.ts`
- [ ] T031 [P] [US6] Tests: actions on closed card → 409 `card_closed`; late clearing recorded in `tests/integration/close.test.ts`

## Phase 9: US7 Ops & compliance oversight (P2)

- [ ] T032 [US7] Admin search by cardholder / last4 (masked) in `src/admin/searchCards.ts`
- [ ] T033 [US7] Compliance and fraud blocks API in `src/admin/blocks.ts`
- [ ] T034 [US7] Four-eyes approvals (requester ≠ approver, 72 h expiry) in `src/approvals/approvals.ts`
- [ ] T035 [US7] Audit read API + daily reconciliation job (changes ↔ audit) in `src/audit/auditRead.ts`, `src/audit/reconcile.ts`
- [ ] T036 [P] [US7] Tests: self-approval denied; audit immutable at DB level; staff never see PAN in `tests/integration/admin.test.ts`

## Phase 10: Polish & cross-cutting

- [ ] T037 [P] Notifications consumer (issued, blocked, closed, expiring, approval decided) in `src/notifications/consumer.ts`
- [ ] T038 [P] Rate limits per actor (writes 30/min, admin search 60/min) in `src/platform/rateLimit.ts`
- [ ] T039 [P] Fraud signals (reveal bursts, freeze cycling > 10/h) in `src/authorization/fraudSignals.ts`
- [ ] T040 Contract tests with processor (Pact) in `tests/contract/processor.pact.test.ts`
- [ ] T041 Load test: authorization p99 ≤ 300 ms at 1,000 req/s in `tests/load/authorization.k6.js`
- [ ] T042 OpenAPI document generated from route schemas in `docs/openapi.yaml`
- [ ] T043 Runbook: processor outage, stand-in declines, reconciliation alerts in `docs/runbook.md`

## Dependencies & Execution Order

- Phase 1 → Phase 2 → stories. US1 and US2 first (MVP: issue + freeze + JIT decisions).
- US3 depends on T018 (authorization chain). US7 depends on T009 and T011.
- Polish tasks after the stories they touch.

## Parallel Example

After Phase 2: US1 (T013–T016) and US2 (T017–T019) can run in parallel by two developers or agents;
tasks marked [P] inside a story touch different files.
