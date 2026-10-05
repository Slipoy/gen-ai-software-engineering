# Virtual Cards Constitution

Non-negotiable principles for the Virtual Cards feature (issue, freeze/unfreeze, limits, transactions,
close) in a regulated card-issuing environment. Every spec, plan, task and review MUST comply.

## Core Principles

### I. Money Is Exact

- Amounts MUST be integers in the currency's minor units (cents) paired with an ISO 4217 code,
  e.g. `{"amount_minor": 12550, "currency": "EUR"}`. Floating point MUST NOT represent money anywhere.
- Arithmetic MUST never mix currencies; a limit and a transaction are compared only in the same currency.
- Display formatting (symbol position, separators) happens only at the presentation edge, from the locale.

Rationale: float rounding errors in limits or balances are financial and regulatory defects.

### II. Card Data Never Leaks (PCI DSS Scope Minimization)

- The system MUST NOT store, log, or transmit full PAN or CVV. The issuer processor holds them;
  we keep only a processor token, the last 4 digits and expiry month/year.
- Full card details are revealed only through the processor's secure reveal (short-lived token,
  rendered by the processor), never through our API responses.
- Logs, traces, analytics events, error messages and audit records MUST contain masked card data
  only (`**** 4242`).

Rationale: keeping PAN out of our systems keeps us out of most of PCI DSS scope.

### III. Every Write Is Idempotent

- Every state-changing request MUST carry an `Idempotency-Key`. Replays with the same key and body
  return the original result; the same key with a different body is rejected.
- Calls to the processor MUST be retried only with the same idempotency key, so a retry can never
  create a second card or apply a limit twice.

Rationale: mobile clients, networks and processors retry; duplicates in card issuing cost money.

### IV. Audit Trail Is Append-Only

- Every state change (card status, limit, ownership, reveal of card details) MUST produce one
  audit event: actor, actor role, action, target, before/after values, reason, timestamp (UTC),
  correlation id.
- Audit events MUST NOT be updated or deleted by application code, including by ops users.
- Failed and denied attempts on sensitive actions MUST be audited too.

Rationale: compliance must be able to reconstruct who did what and why, at any time.

### V. Explicit Card State Machine

- Card states and allowed transitions MUST be defined in the spec as a single table; any other
  transition is rejected with a domain error, never silently ignored.
- Concurrent changes MUST be resolved with optimistic concurrency (a card version); the losing
  writer gets a conflict, not a lost update.
- A closed card is terminal.

Rationale: freeze, unfreeze, close and fraud blocks race each other; the rules must be explicit.

### VI. Least Privilege and Separation of Duties

- Roles: cardholder, ops agent, compliance officer, fraud system. Each action in the spec states
  which roles may perform it.
- Ops and compliance views MUST NOT expose full card data or more personal data than the task needs.
- High-risk actions (lifting a fraud block, raising a limit above the policy ceiling) MUST require
  a second approver (four-eyes) and strong customer authentication where the cardholder acts.

Rationale: insider risk and PSD2 strong customer authentication requirements.

### VII. Specification Is the Source of Truth

- Work starts from the spec: constitution, spec, clarify, plan, tasks, analyze. Code (when built)
  follows the spec; when they disagree, the spec is fixed first.
- Every requirement MUST be testable and traceable: objectives `OBJ-n`, non-functional requirements
  `NFR-n`, edge cases `EC-n`, tasks `T-n`, each task linked to the objectives it serves.
- Non-functional targets MUST be numbers or ranges; hypothetical numbers are labelled
  "assumed target" with a reason.

Rationale: an AI agent and a team can only build what is written down unambiguously.

## Regulatory and Security Constraints

- PCI DSS: scope minimization per Principle II; processor integration over mutual TLS.
- GDPR: data minimization; personal data retention defined per data type; erasure requests are
  satisfied by pseudonymizing personal fields while audit events keep their legal retention.
- PSD2: strong customer authentication for revealing card details and raising limits.
- Transport TLS 1.2+; data at rest encrypted (AES-256); secrets only from a secret manager,
  never in code, config files or logs.
- Timestamps in UTC, ISO 8601. Identifiers are opaque (UUID / ULID), never sequential.

## Development Workflow and Quality Gates

- Each Spec Kit artifact (constitution, spec, plan, tasks) is reviewed by a human in a pull
  request before the next step starts.
- Edge cases, verification method and performance targets are part of the spec, not the README.
- When implementation happens, merge requires: unit and integration tests for every task's
  acceptance criteria, contract tests against the processor API, static analysis, and an automated
  check that logs and fixtures contain no PAN patterns.

## Governance

- This constitution supersedes other practices in this project; `agents.md` and editor rules are
  derived from it and MUST NOT contradict it.
- Amendments go through a pull request that states the change and its rationale, and bump the
  version: MAJOR for removed or redefined principles, MINOR for new principles or sections,
  PATCH for wording.
- Every spec and plan review includes a constitution check; violations must be fixed or explicitly
  justified in the plan's complexity tracking.

**Version**: 1.0.0 | **Ratified**: 2026-10-05 | **Last Amended**: 2026-10-05
