import { Link } from 'react-router';
import type { Ticket } from '../api/types';
import { formatAge, formatDateTime } from '../lib/time';
import { CategoryTag, StatusTag } from './Tag';
import styles from './TicketCard.module.css';

/** A ticket on the priority board. */
export function TicketCard({ ticket, selected, to }: { ticket: Ticket; selected: boolean; to: { search: string } }) {
  const confidence = ticket.classification?.confidence;
  return (
    <Link to={to} className={styles.card} aria-current={selected || undefined} data-selected={selected || undefined}>
      <span className={styles.meta}>
        <span>{ticket.customer_id}</span>
        <time dateTime={ticket.created_at} title={formatDateTime(ticket.created_at)}>
          {formatAge(ticket.created_at)}
        </time>
      </span>
      <span className={styles.subject}>{ticket.subject}</span>
      <span className={styles.tags}>
        <CategoryTag category={ticket.category} />
        <StatusTag status={ticket.status} />
      </span>
      <span className={styles.footer}>
        <span className={styles.assignee}>{ticket.assigned_to ?? 'Unassigned'}</span>
        {confidence !== undefined && <span className="mono">conf {confidence.toFixed(2)}</span>}
      </span>
    </Link>
  );
}
