# Feature Specification: Virtual Card Lifecycle

**Feature Branch**: `homework-3-submission` (spec directory `001-virtual-card-lifecycle`)

**Created**: 2026-10-05

**Status**: Draft

**Input**: User description: "Virtual card lifecycle for a regulated card issuer: cardholders issue
virtual cards, see masked details and securely reveal full details, freeze and unfreeze, set spending
limits, view transactions and close cards. Internal ops and compliance staff search cards, review the
audit trail and apply or lift blocks with four-eyes approval. A fraud system can block cards
automatically."

## Clarifications

### Session 2026-10-05

- Q: Which time zone defines "daily" and "monthly" limits? → A: The cardholder's configured time
  zone (default: account country), so limits match what the user sees in the app.
- Q: If the issuer partner is unreachable, does a freeze still work? → A: Yes. Our system answers
  every payment authorization, so a freeze is enforced locally at once; partner sync is best effort.
- Q: Can ops agents unfreeze a cardholder freeze? → A: No. Only the cardholder removes their own
  freeze; staff manage fraud and compliance blocks only.
- Q: What happens to approval requests nobody decides? → A: They expire after 72 hours as
  "expired", the cardholder is notified, nothing is applied.
- Q: Are amounts in requests allowed with more decimals than the currency? → A: No, rejected
  (e.g. 10.005 EUR); amounts are validated against the currency's minor-unit exponent.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Issue a virtual card (Priority: P1)

A cardholder with a verified account creates a virtual debit card linked to their account,
optionally giving it a nickname, and can use it for online payments right away.

**Why this priority**: Without issuance there is no card; every other story depends on it.

**Independent Test**: Issue a card for a verified cardholder and confirm it appears in their card
list as active, with masked number, expiry and nickname, and that an audit event was recorded.

**Acceptance Scenarios**:

1. **Given** a verified cardholder with fewer than 5 open cards, **When** they request a new virtual
   card, **Then** an active card appears in their list showing only the last 4 digits and expiry,
   and one audit event "card issued" is recorded.
2. **Given** the same issue request is submitted twice (double tap, network retry), **When** both
   requests are processed, **Then** exactly one card exists and both requests get the same result.
3. **Given** a cardholder who already has 5 open cards, **When** they request another,
   **Then** the request is refused with a clear "card limit reached" message and nothing is issued.
4. **Given** the card network or issuer partner is unavailable, **When** a card is requested,
   **Then** the cardholder sees "card is being created" and the card becomes active or the request
   fails with a clear message within 2 minutes; no half-created card remains usable.

---

### User Story 2 - Freeze and unfreeze a card (Priority: P1)

A cardholder who misplaced their phone or suspects misuse freezes a card instantly, and unfreezes it
later. While frozen, new payments are declined; nothing else about the card changes.

**Why this priority**: The main self-service security control; reduces fraud losses and support calls.

**Independent Test**: Freeze an active card, attempt a payment (declined with reason "card frozen"),
unfreeze, attempt again (approved), and check two audit events exist.

**Acceptance Scenarios**:

1. **Given** an active card, **When** the cardholder freezes it, **Then** new payment attempts are
   declined within 5 seconds and the card shows "Frozen".
2. **Given** a card frozen by the cardholder, **When** they unfreeze it, **Then** payments are
   accepted again and the card shows "Active".
3. **Given** a card that is frozen and also blocked by fraud, **When** the cardholder unfreezes it,
   **Then** the cardholder freeze is removed but the card stays unusable and shows "Blocked by bank".
4. **Given** an already frozen card, **When** the cardholder freezes it again, **Then** the request
   succeeds without change and no duplicate audit event is created.

---

### User Story 3 - Set spending limits (Priority: P2)

A cardholder sets a per-transaction, daily and monthly spending limit on a card (for example a card
dedicated to subscriptions), within the bank's policy ceiling.

**Why this priority**: Core budgeting and risk feature; requested by both users and fraud teams.

**Independent Test**: Set a daily limit, make payments up to the limit (approved) and one above it
(declined with reason "limit exceeded").

**Acceptance Scenarios**:

1. **Given** an active card, **When** the cardholder sets a daily limit of 100.00 EUR, **Then**
   payments whose daily total would exceed 100.00 EUR are declined with reason "daily limit".
2. **Given** a limit above the bank's policy ceiling, **When** the cardholder requests it, **Then**
   it is not applied immediately; it becomes a request requiring ops approval, and the cardholder
   sees "pending approval".
3. **Given** a cardholder lowers the daily limit below today's spent amount, **When** the change is
   saved, **Then** it is accepted, already approved payments stay valid, and further payments today
   are declined.
4. **Given** a limit value that is zero, negative, non-numeric or has more decimals than the
   currency allows, **When** it is submitted, **Then** it is rejected with a field-level message.

---

### User Story 4 - View card transactions (Priority: P2)

A cardholder sees the payments made with a card: pending, completed, declined (with the reason) and
refunded, newest first, and can filter by status and date.

**Why this priority**: Users verify their spending and spot fraud; needed to make freeze meaningful.

**Independent Test**: Make approved, declined and refunded payments with a card and confirm each
appears with correct amount, merchant, status and decline reason.

**Acceptance Scenarios**:

1. **Given** a card with 250 transactions, **When** the cardholder opens its history, **Then** the
   newest 50 are shown first and older ones load page by page, without duplicates or gaps.
2. **Given** a declined payment, **When** it is shown, **Then** it includes a human-readable reason
   ("card frozen", "daily limit", "insufficient funds", "blocked by bank").
3. **Given** a card with no transactions, **When** the history opens, **Then** an empty state
   explains that payments will appear here.

---

### User Story 5 - Reveal full card details (Priority: P2)

To pay online, a cardholder reveals the full card number and security code after strong
authentication; the details hide again automatically.

**Why this priority**: Required to actually use a virtual card; the most sensitive action.

**Independent Test**: Request reveal, pass strong authentication, see full details, confirm they hide
after 60 seconds and that a "details revealed" audit event exists without the details themselves.

**Acceptance Scenarios**:

1. **Given** an active card, **When** the cardholder passes strong authentication and reveals details,
   **Then** the full number, expiry and security code are visible for at most 60 seconds.
2. **Given** a failed strong authentication, **When** reveal is attempted, **Then** nothing is shown
   and a "reveal denied" audit event is recorded.
3. **Given** 5 reveals of the same card within one hour, **When** a 6th is attempted, **Then** it is
   refused and flagged to fraud monitoring.

---

### User Story 6 - Close a card (Priority: P3)

A cardholder permanently closes a card they no longer need.

**Why this priority**: Hygiene and risk reduction; not needed for first value.

**Independent Test**: Close a card, confirm new payments are declined, the card is no longer usable
or reopenable, and history remains visible.

**Acceptance Scenarios**:

1. **Given** an active or frozen card, **When** the cardholder confirms closing, **Then** the card is
   closed permanently, new payments are declined, and its history stays readable.
2. **Given** pending payments at close time, **When** they complete later, **Then** they are still
   recorded against the closed card.
3. **Given** a closed card, **When** any change (freeze, limit, reveal) is attempted, **Then** it is
   refused with "card is closed".

---

### User Story 7 - Ops and compliance oversight (Priority: P2)

Ops agents find a card by cardholder or last 4 digits, see its state, blocks, limits and full audit
trail, and apply or lift a compliance block. Lifting a fraud or compliance block needs a second
person's approval. The fraud system can block a card automatically.

**Why this priority**: Required to operate in a regulated environment; without it the product
cannot launch.

**Independent Test**: Fraud blocks a card; an agent requests lifting; a second agent approves; the
card becomes usable; all steps appear in the audit trail with both people named.

**Acceptance Scenarios**:

1. **Given** an agent searching by cardholder, **When** results are shown, **Then** cards show only
   last 4 digits and no full card data is ever visible to staff.
2. **Given** a fraud block on a card, **When** an agent requests to lift it, **Then** the block stays
   until a different authorized person approves; the requester cannot approve their own request.
3. **Given** a compliance officer, **When** they open a card's audit trail, **Then** every state
   change, limit change, reveal and denied attempt is listed with actor, time, before/after and reason.
4. **Given** an ops agent, **When** they try to edit or delete an audit event, **Then** it is impossible.

---

### Edge Cases

Numbering matches the consolidated table in `../../specification.md` §8, which also states the audit
implication of each case.

- **EC-001 Concurrent or stale change** (two devices, or an outdated screen): the change based on an
  old card state is rejected; the cardholder sees the current state and can retry.
- **EC-002 Payment right after a freeze**: declined with reason "card frozen"; payments approved
  before the freeze still complete.
- **EC-003 Freeze while the card is being created**: refused with "card is being created".
- **EC-004 Limit lowered below today's spending**: accepted; applies to future payments only.
- **EC-005 Invalid limit** (other currency, too many decimals, zero, negative): rejected per field.
- **EC-006 Day and month boundaries**: totals reset at midnight in the cardholder's time zone;
  refunds reduce the spent total of the original payment's period.
- **EC-007 Duplicate request with changed content**: rejected, never applied.
- **EC-008 Partner outage**: issuing completes or fails definitively within 2 minutes; closing takes
  effect at once and is synced later; freezes always work.
- **EC-009 Our decision is too slow**: the payment is declined by the partner's safe default; the
  customer can retry.
- **EC-010 Someone else's card**: answered as "not found", with no hint that the card exists.
- **EC-011 Staff action outside their role**: denied and recorded.
- **EC-012 Approving one's own request**: denied.
- **EC-013 Approval request left undecided**: expires after 72 hours; nothing is applied.
- **EC-014 Fraud-like patterns** (more than 5 reveals per hour, freeze/unfreeze more than 10 times
  per hour): refused or flagged to fraud monitoring.
- **EC-015 Payment updates arrive twice or out of order**: the payment ends in the correct final
  status, shown once.
- **EC-016 Customer account closed**: all their cards close automatically with reason "account closed".
- **EC-017 Card expires**: behaves like closed for new payments; pending ones complete; a new card
  is offered 30 days before expiry.
- **EC-018 Nothing to show** (no cards, no payments): an empty state explains the next step.

## Requirements *(mandatory)*

### Functional Requirements

Issuance

- **FR-001**: Verified cardholders MUST be able to issue a virtual card linked to their account,
  with an optional nickname of up to 30 characters.
- **FR-002**: The system MUST allow at most 5 open cards (active, frozen or blocked) per cardholder.
- **FR-003**: Every state-changing request MUST be idempotent: repeating it with the same key
  returns the original result; the same key with different content is rejected.

Card state

- **FR-004**: A card MUST have exactly one lifecycle state: Issuing, Issue failed, Active, Closed
  or Expired;
  and zero or more restrictions: cardholder freeze, fraud block, compliance block.
- **FR-005**: A card MUST be usable for payments only when Active with no restrictions.
- **FR-006**: Cardholders MUST be able to add and remove only the cardholder freeze; fraud and
  compliance blocks are removable only by authorized staff with four-eyes approval.
- **FR-007**: Transitions not listed in the state table (to be defined in the plan) MUST be
  rejected with a specific reason; Closed and Expired are terminal.
- **FR-008**: Concurrent conflicting changes to one card MUST result in one success and one
  conflict response, never a lost update.

Limits

- **FR-009**: Cardholders MUST be able to set per-transaction, daily and monthly limits in the card's
  currency, each optional and positive.
- **FR-010**: Limits above the bank's policy ceiling MUST become approval requests for ops instead
  of being applied.
- **FR-011**: Payments MUST be declined when they would exceed any active limit, with the specific
  limit as the reason.

Transactions

- **FR-012**: Cardholders MUST see a card's transactions newest first, 50 per page, filterable by
  status (pending, completed, declined, refunded) and date range.
- **FR-013**: Every declined payment MUST show a human-readable reason.

Sensitive data

- **FR-014**: Full card number and security code MUST be visible only to the cardholder, only after
  strong authentication, for at most 60 seconds, and never to staff.
- **FR-015**: The system MUST limit reveals to 5 per card per hour.
- **FR-016**: Full card data MUST NOT appear in any log, report, message, export or audit record.

Closing

- **FR-017**: Cardholders MUST be able to close a card after an explicit confirmation; closing is
  permanent and keeps the transaction history readable.

Oversight

- **FR-018**: Ops agents MUST be able to search cards by cardholder identifier or last 4 digits
  and see state, restrictions, limits and audit trail.
- **FR-019**: Compliance officers MUST be able to apply and request lifting of a compliance block,
  with a mandatory reason.
- **FR-020**: The fraud system MUST be able to apply a fraud block automatically, with a reason code.
- **FR-021**: Lifting a block or approving a limit above the ceiling MUST require approval by a
  second authorized person different from the requester.
- **FR-022**: Every state change, limit change, reveal, approval and denied attempt MUST create an
  audit event with actor, role, action, target, before/after, reason, time and correlation id.
- **FR-023**: Audit events MUST be readable by compliance and MUST NOT be editable or deletable by
  anyone through the product.

Notifications

- **FR-024**: Cardholders MUST be notified (in-app and e-mail) when a card is issued, blocked by the
  bank, closed, about to expire, or when a limit request is approved or rejected.

### Key Entities

- **Cardholder**: a verified customer; owns cards; has a time zone used for limit periods.
- **Card**: virtual card owned by one cardholder; lifecycle state, restrictions, nickname, last 4
  digits, expiry, currency, version for conflict detection. Never holds the full number.
- **Restriction**: cardholder freeze, fraud block or compliance block on a card; who applied it,
  when, reason.
- **Spending Limit**: per-transaction, daily or monthly amount in the card currency.
- **Card Transaction**: a payment attempt or result on a card; amount, currency, merchant, status,
  decline reason, timestamps.
- **Approval Request**: a pending request to lift a block or raise a limit above the ceiling;
  requester, approver, decision, reason.
- **Audit Event**: immutable record of an action on a card (see FR-022).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 95% of cardholders can issue a card and see it ready to use in under 10 seconds;
  99.9% within 2 minutes (assumed target: partner issuance is usually instant but can queue).
- **SC-002**: After a freeze is confirmed, 99.99% of new payment attempts on that card are declined
  (assumed target: a freeze is a security control and must be near-certain).
- **SC-003**: Card list and transaction history open in under 1 second for 95% of views.
- **SC-004**: Zero occurrences of full card number or security code in logs, exports, audit records
  or staff screens, verified by automated scanning before every release.
- **SC-005**: 100% of state changes and sensitive actions have a matching audit event, verified by a
  daily reconciliation between card changes and audit records.
- **SC-006**: Duplicate submissions never create a second card or apply a change twice (0 duplicates
  in reconciliation).
- **SC-007**: An agent can find a card and its full audit trail in under 30 seconds.
- **SC-008**: "Lost card / suspicious payment" support contacts drop by 30% within 3 months of launch,
  as cardholders self-serve freeze and limits.

## Assumptions

- Cardholders are already verified (KYC done) by an existing onboarding service; this feature does
  not onboard customers.
- An issuer partner (card processor) creates cards, stores full card data, provides the secure
  reveal, and asks us to approve or decline each payment in real time.
- Strong customer authentication is provided by the existing banking app login/approval mechanism.
- Cards are virtual debit cards in a single currency per card (the account currency); physical
  cards, credit lines, multi-currency and currency conversion are out of scope.
- The bank's limit policy ceiling is configured by ops (default assumed: 5,000.00 per transaction,
  10,000.00 per day, 50,000.00 per month in the card currency).
- Disputes/chargebacks, statements and card replacement are out of scope; disputes are handled by an
  existing process.
- Audit records are retained for 7 years (assumed regulatory retention); personal data in them is
  pseudonymized on erasure requests.
- Notifications use the existing notification service.
