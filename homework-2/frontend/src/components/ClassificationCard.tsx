import { useAutoClassify } from '../api/queries';
import type { AutoClassifyOutcome, Ticket } from '../api/types';
import { ApiError } from '../api/client';
import { CATEGORY_LABELS, PRIORITY_LABELS } from '../lib/labels';
import { formatDateTime } from '../lib/time';
import styles from './ClassificationCard.module.css';
import { ConfidenceRing } from './ConfidenceRing';

/** One sentence about the last run, shown after the agent presses a button. */
function outcomeMessage(outcome: AutoClassifyOutcome): string {
  const result = `${CATEGORY_LABELS[outcome.category]} · ${PRIORITY_LABELS[outcome.priority]}`;
  if (outcome.applied) return `Classified as ${result}.`;
  const agrees = outcome.category === outcome.ticket.category && outcome.priority === outcome.ticket.priority;
  return agrees
    ? `The classifier agrees with the current ${result}.`
    : `The classifier suggests ${result}, but the manual choice was kept.`;
}

/**
 * The classifier's view of a ticket: its latest suggestion with confidence, reasoning and keywords,
 * plus the actions. When an agent has set category/priority by hand (manual override), the suggestion
 * is shown but not applied, and "Apply suggestion" forces it.
 */
export function ClassificationCard({ ticket }: { ticket: Ticket }) {
  const classify = useAutoClassify();
  const result = ticket.classification;
  const differsFromTicket = result && (result.category !== ticket.category || result.priority !== ticket.priority);

  const run = (force: boolean) => classify.mutate({ id: ticket.id, force });
  const busy = classify.isPending;

  return (
    <section className={styles.card} aria-labelledby="classification-title">
      <h3 id="classification-title" className={styles.title}>
        Auto-classification
      </h3>

      {result ? (
        <>
          <div className={styles.summary}>
            <ConfidenceRing value={result.confidence} />
            <div className={styles.suggestion}>
              <span className={styles.label}>Classifier suggests</span>
              <strong>
                {CATEGORY_LABELS[result.category]} · {PRIORITY_LABELS[result.priority]}
              </strong>
              <span className={`${styles.label} mono`}>
                category {result.category_confidence.toFixed(2)} · priority {result.priority_confidence.toFixed(2)}
              </span>
            </div>
          </div>

          <p className={styles.reasoning}>{result.reasoning}</p>

          {result.keywords_found.length > 0 && (
            <ul className={styles.keywords} aria-label="Keywords found">
              {result.keywords_found.map((keyword) => (
                <li key={keyword} className="mono">
                  {keyword}
                </li>
              ))}
            </ul>
          )}

          {ticket.manual_override && differsFromTicket && (
            <p className={styles.override}>
              An agent set this ticket to {CATEGORY_LABELS[ticket.category]} · {PRIORITY_LABELS[ticket.priority]}. Their choice is
              kept until you apply the suggestion.
            </p>
          )}

          <span className={styles.label}>Last run {formatDateTime(result.classified_at)}</span>
        </>
      ) : (
        <p className={styles.reasoning}>This ticket has not been classified yet.</p>
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={() => run(false)} disabled={busy}>
          {busy ? 'Classifying…' : result ? 'Re-classify' : 'Classify'}
        </button>
        {ticket.manual_override && differsFromTicket && (
          <button type="button" className={styles.secondary} onClick={() => run(true)} disabled={busy}>
            Apply suggestion
          </button>
        )}
      </div>

      <div aria-live="polite" className={styles.feedback}>
        {classify.isSuccess && <span className={styles.success}>{outcomeMessage(classify.data)}</span>}
        {classify.isError && (
          <span className={styles.error}>
            {classify.error instanceof ApiError ? classify.error.message : 'Classification failed. Try again.'}
          </span>
        )}
      </div>
    </section>
  );
}
