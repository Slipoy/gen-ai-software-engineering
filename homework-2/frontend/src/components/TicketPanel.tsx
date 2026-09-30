import { useEffect, useRef, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApiError } from '../api/client';
import { useTicket } from '../api/queries';
import type { Ticket } from '../api/types';
import { useTicketLink } from '../hooks/useTicketLink';
import { SOURCE_LABELS } from '../lib/labels';
import { formatAge, formatDateTime } from '../lib/time';
import { ClassificationCard } from './ClassificationCard';
import { DecisionLog } from './DecisionLog';
import { CategoryTag, PriorityBadge, StatusTag } from './Tag';
import styles from './TicketPanel.module.css';

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.detail}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function TicketDetails({ ticket }: { ticket: Ticket }) {
  const device = [ticket.metadata.device_type, ticket.metadata.browser].filter(Boolean).join(' · ');
  return (
    <>
      <div className={styles.badges}>
        <PriorityBadge priority={ticket.priority} />
        <CategoryTag category={ticket.category} />
        <StatusTag status={ticket.status} />
      </div>

      <div className={styles.heading}>
        <h2 id="ticket-panel-title" className={styles.subject} tabIndex={-1}>
          {ticket.subject}
        </h2>
        <p className={styles.customer}>
          {ticket.customer_name} · <a href={`mailto:${ticket.customer_email}`}>{ticket.customer_email}</a>
        </p>
      </div>

      <p className={styles.description}>{ticket.description}</p>

      <ClassificationCard key={ticket.id} ticket={ticket} />

      <dl className={styles.details}>
        <Detail label="Assignee">{ticket.assigned_to ?? 'Unassigned'}</Detail>
        <Detail label="Source">{SOURCE_LABELS[ticket.metadata.source]}</Detail>
        <Detail label="Device">{device || 'Unknown'}</Detail>
        <Detail label="Customer ID">
          <span className="mono">{ticket.customer_id}</span>
        </Detail>
        <Detail label="Created">
          <time dateTime={ticket.created_at}>{formatDateTime(ticket.created_at)}</time>
        </Detail>
        <Detail label="Updated">
          <time dateTime={ticket.updated_at}>{formatDateTime(ticket.updated_at)}</time>
        </Detail>
        {ticket.resolved_at && (
          <Detail label="Resolved">
            <time dateTime={ticket.resolved_at}>{formatDateTime(ticket.resolved_at)}</time>
          </Detail>
        )}
        <Detail label="Tags">{ticket.tags.length > 0 ? ticket.tags.join(', ') : 'None'}</Detail>
      </dl>

      <DecisionLog ticketId={ticket.id} />
    </>
  );
}

/**
 * Right-hand panel for the ticket selected with `?ticket=<id>`. Closing it (button or Escape) removes
 * the parameter, so Back reopens it. Focus moves to the ticket title when a ticket opens, for keyboard users.
 */
export function TicketPanel({ ticketId }: { ticketId: string }) {
  const { data: ticket, isPending, isError, error } = useTicket(ticketId);
  const { closeTo } = useTicketLink();
  const navigate = useNavigate();
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>('#ticket-panel-title')?.focus();
  }, [ticketId]);

  // Escape closes the panel. An open filter menu handles Escape itself and stops it first (see MultiSelect).
  const closeSearch = closeTo.search;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') navigate({ search: closeSearch });
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [navigate, closeSearch]);

  const notFound = isError && error instanceof ApiError && error.status === 404;

  return (
    <aside ref={panelRef} className={styles.panel} aria-labelledby="ticket-panel-title">
      <div className={styles.topBar}>
        <span className={`${styles.meta} mono`}>
          {ticket ? `${ticket.customer_id} · ${formatAge(ticket.created_at)} ago` : ' '}
        </span>
        <Link to={closeTo} className={styles.close} aria-label="Close ticket">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </Link>
      </div>

      <div className={styles.body}>
        {ticket ? (
          <TicketDetails ticket={ticket} />
        ) : isPending ? (
          <p className={styles.state}>Loading ticket…</p>
        ) : (
          <div className={styles.state} role="alert">
            <h2 id="ticket-panel-title" tabIndex={-1}>
              {notFound ? 'Ticket not found' : 'Could not load the ticket'}
            </h2>
            <p>{notFound ? 'It may have been deleted.' : error instanceof ApiError ? error.message : 'Try again later.'}</p>
          </div>
        )}
      </div>
    </aside>
  );
}
