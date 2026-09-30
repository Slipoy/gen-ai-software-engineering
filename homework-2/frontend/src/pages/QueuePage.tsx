import { useMemo } from 'react';
import { useTickets } from '../api/queries';
import { PRIORITIES, type Priority, type Ticket } from '../api/types';
import { FilterBar } from '../components/FilterBar';
import { EmptyState, ErrorState, LoadingState } from '../components/QueryState';
import { TicketCard } from '../components/TicketCard';
import { useTicketFilters } from '../hooks/useTicketFilters';
import { useTicketLink } from '../hooks/useTicketLink';
import { OPEN_STATUSES, PRIORITY_LABELS } from '../lib/labels';
import styles from './QueuePage.module.css';

/**
 * The queue: open tickets as four priority columns, so the most pressing work is always top-left.
 * One request loads all matching tickets; grouping into columns happens here in the browser.
 */
export function QueuePage() {
  const filters = useTicketFilters({ defaultStatus: OPEN_STATUSES });
  const { data: tickets, isPending, isError, error, refetch, isFetching } = useTickets(filters.apiFilters);
  const { selectedId, linkTo } = useTicketLink();

  const columns = useMemo(() => {
    const byPriority: Record<Priority, Ticket[]> = { urgent: [], high: [], medium: [], low: [] };
    for (const ticket of tickets ?? []) byPriority[ticket.priority].push(ticket);
    return PRIORITIES.map((priority) => ({ priority, tickets: byPriority[priority] }));
  }, [tickets]);

  const summary = tickets
    ? `${tickets.length} ticket${tickets.length === 1 ? '' : 's'} · ${columns[0]!.tickets.length} urgent`
    : undefined;

  return (
    <div className={styles.page} aria-busy={isFetching}>
      <FilterBar
        values={filters.values}
        onListChange={filters.setList}
        onSearchChange={filters.setSearch}
        onClear={filters.clear}
        canClear={!filters.isDefault}
        showPriority={false}
        summary={summary}
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
        <div className={styles.board}>
          {columns.map((column) => (
            <section key={column.priority} className={styles.column} data-priority={column.priority} aria-labelledby={`col-${column.priority}`}>
              <h2 id={`col-${column.priority}`} className={styles.columnHeader}>
                <span className={styles.columnName}>{PRIORITY_LABELS[column.priority]}</span>
                <span className={styles.columnCount}>{column.tickets.length}</span>
              </h2>
              <ul className={styles.cards}>
                {column.tickets.map((ticket) => (
                  <li key={ticket.id}>
                    <TicketCard ticket={ticket} selected={ticket.id === selectedId} to={linkTo(ticket.id)} />
                  </li>
                ))}
                {column.tickets.length === 0 && <li className={styles.none}>Nothing here</li>}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
