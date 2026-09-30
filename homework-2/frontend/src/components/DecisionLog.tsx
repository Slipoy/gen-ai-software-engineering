import { useClassificationHistory } from '../api/queries';
import type { ClassificationDecision } from '../api/types';
import { CATEGORY_LABELS, PRIORITY_LABELS } from '../lib/labels';
import { formatDateTime } from '../lib/time';
import styles from './DecisionLog.module.css';

function describe(decision: ClassificationDecision): string {
  const to = `${CATEGORY_LABELS[decision.category]} · ${PRIORITY_LABELS[decision.priority]}`;
  if (decision.actor === 'agent') {
    return `An agent changed it to ${to}`;
  }
  if (decision.applied) return `Classifier set ${to}`;
  const agrees = decision.category === decision.previous_category && decision.priority === decision.previous_priority;
  return agrees ? `Classifier agreed with ${to}` : `Classifier suggested ${to}, manual choice kept`;
}

/** Who decided the category and priority, and when: the backend's decision log for this ticket. */
export function DecisionLog({ ticketId }: { ticketId: string }) {
  const { data: decisions, isPending, isError } = useClassificationHistory(ticketId);

  return (
    <section className={styles.log} aria-labelledby="decision-log-title">
      <h3 id="decision-log-title" className={styles.title}>
        Decision log
      </h3>
      {isPending ? (
        <p className={styles.muted}>Loading…</p>
      ) : isError ? (
        <p className={styles.muted}>Could not load the decision log.</p>
      ) : decisions.length === 0 ? (
        <p className={styles.muted}>No decisions yet.</p>
      ) : (
        <ol className={styles.list}>
          {/* Newest first: the latest decision is the one an agent looks for. */}
          {[...decisions].reverse().map((decision) => (
            <li key={decision.id} className={styles.entry}>
              <time className="mono" dateTime={decision.at}>
                {formatDateTime(decision.at)}
              </time>
              <span>
                {describe(decision)}
                {decision.confidence !== null && <span className={styles.muted}> ({decision.confidence.toFixed(2)})</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
