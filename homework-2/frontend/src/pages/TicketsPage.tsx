import { Link } from 'react-router';
import { useTickets } from '../api/queries';
import { FilterBar } from '../components/FilterBar';
import { EmptyState, ErrorState, LoadingState } from '../components/QueryState';
import { CategoryTag, PriorityBadge, StatusTag } from '../components/Tag';
import { useTicketFilters } from '../hooks/useTicketFilters';
import { useTicketLink } from '../hooks/useTicketLink';
import { formatAge, formatDateTime } from '../lib/time';
import styles from './TicketsPage.module.css';

/** Every ticket, any status, as a table with all three filters (category, priority, status) and search. */
export function TicketsPage() {
  const filters = useTicketFilters();
  const { data: tickets, isPending, isError, error, refetch, isFetching } = useTickets(filters.apiFilters);
  const { selectedId, linkTo } = useTicketLink();

  return (
    <div className={styles.page} aria-busy={isFetching}>
      <FilterBar
        values={filters.values}
        onListChange={filters.setList}
        onSearchChange={filters.setSearch}
        onClear={filters.clear}
        canClear={!filters.isDefault}
        summary={tickets ? `${tickets.length} ticket${tickets.length === 1 ? '' : 's'}` : undefined}
      />

      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : tickets.length === 0 ? (
        <EmptyState title="No tickets match these filters">
          <span>Change the filters, or import sample tickets on the Import page.</span>
        </EmptyState>
      ) : (
        <div className={styles.table} role="table" aria-label="Tickets">
          <div className={`${styles.row} ${styles.head}`} role="row">
            <span role="columnheader">Priority</span>
            <span role="columnheader">Subject</span>
            <span role="columnheader">Category</span>
            <span role="columnheader">Status</span>
            <span role="columnheader">Assignee</span>
            <span role="columnheader" className={styles.right}>Created</span>
          </div>
          {tickets.map((ticket) => (
            <Link
              key={ticket.id}
              to={linkTo(ticket.id)}
              className={styles.row}
              role="row"
              aria-current={ticket.id === selectedId || undefined}
              data-selected={ticket.id === selectedId || undefined}
            >
              <span role="cell"><PriorityBadge priority={ticket.priority} /></span>
              <span role="cell" className={styles.subjectCell}>
                <span className={styles.subject}>{ticket.subject}</span>
                <span className={styles.customer}>{ticket.customer_name} · {ticket.customer_email}</span>
              </span>
              <span role="cell"><CategoryTag category={ticket.category} /></span>
              <span role="cell"><StatusTag status={ticket.status} /></span>
              <span role="cell" className={styles.muted}>{ticket.assigned_to ?? 'Unassigned'}</span>
              <span role="cell" className={`${styles.right} mono ${styles.muted}`}>
                <time dateTime={ticket.created_at} title={formatDateTime(ticket.created_at)}>{formatAge(ticket.created_at)}</time>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
