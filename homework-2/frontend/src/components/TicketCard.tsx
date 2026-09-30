import { memo } from 'react';
import { Link } from 'react-router';
import type { Ticket } from '../api/types';
import { formatAge, formatDateTime } from '../lib/time';
import { CategoryTag, StatusTag } from './Tag';
import styles from './TicketCard.module.css';

interface TicketCardProps {
  ticket: Ticket;
  selected: boolean;
  /** The link's query string, e.g. "?category=billing_question&ticket=<id>". */
  search: string;
}

/**
 * A ticket on the priority board. Wrapped in memo(): selecting another ticket re-renders only the two cards
 * whose `selected` changes, instead of every card on the board. That works because every prop is either a
 * primitive or the same `ticket` object as before (TanStack Query keeps unchanged objects when it refetches).
 */
export const TicketCard = memo(function TicketCard({ ticket, selected, search }: TicketCardProps) {
  const confidence = ticket.classification?.confidence;
  return (
    <Link to={{ search }} className={styles.card} aria-current={selected || undefined} data-selected={selected || undefined}>
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
});
