import { memo, useMemo, useState } from 'react';
import { useTickets } from '../api/queries';
import { PRIORITIES, type Priority, type Ticket } from '../api/types';
import { FilterBar } from '../components/FilterBar';
import { EmptyState, ErrorState, LoadingState } from '../components/QueryState';
import { SplitView } from '../components/SplitView';
import { TicketCard } from '../components/TicketCard';
import { useIncrementalList } from '../hooks/useIncrementalList';
import { useTicketFilters } from '../hooks/useTicketFilters';
import { useTicketLink } from '../hooks/useTicketLink';
import { OPEN_STATUSES, PRIORITY_LABELS } from '../lib/labels';
import styles from './QueuePage.module.css';

const CARDS_PER_PAGE = 50;

interface ColumnProps {
  priority: Priority;
  /** On phones only one column is shown at a time; this is the one picked in the tabs. */
  activeOnPhone: boolean;
  tickets: Ticket[];
  selectedId: string | null;
  searchFor: (id: string) => string;
  /** Changes when the filters change, so the column goes back to its first page. */
  resetKey: string;
}

/** One priority column. Shows the first 50 cards, then 50 more per click. */
const BoardColumn = memo(function BoardColumn({
  priority,
  activeOnPhone,
  tickets,
  selectedId,
  searchFor,
  resetKey,
}: ColumnProps) {
  const { visible, hidden, showMore } = useIncrementalList(tickets, CARDS_PER_PAGE, resetKey);
  return (
    <section
      id={`column-${priority}`}
      className={styles.column}
      data-priority={priority}
      data-active-on-phone={activeOnPhone || undefined}
      aria-labelledby={`col-${priority}`}
    >
      <h2 id={`col-${priority}`} className={styles.columnHeader}>
        <span className={styles.columnName}>{PRIORITY_LABELS[priority]}</span>
        <span className={styles.columnCount}>{tickets.length}</span>
      </h2>
      <ul className={styles.cards}>
        {visible.map((ticket) => (
          <li key={ticket.id}>
            <TicketCard ticket={ticket} selected={ticket.id === selectedId} search={searchFor(ticket.id)} />
          </li>
        ))}
        {tickets.length === 0 && <li className={styles.none}>Nothing here</li>}
      </ul>
      {hidden > 0 && (
        <button type="button" className={styles.more} onClick={showMore}>
          Show {Math.min(hidden, CARDS_PER_PAGE)} more <span className="mono">({hidden} hidden)</span>
        </button>
      )}
    </section>
  );
});

/**
 * The queue: open tickets as four priority columns, so the most pressing work is always top-left.
 * One request loads all matching tickets; grouping into columns happens here in the browser.
 */
export function QueuePage() {
  const filters = useTicketFilters({ defaultStatus: OPEN_STATUSES });
  // The columns are the priorities, so a priority filter would only empty some columns without saying why.
  // A `?priority=` left in the URL (e.g. after coming from All tickets) is therefore ignored here.
  const { priority: _ignoredOnBoard, ...apiFilters } = filters.apiFilters;
  const { data: tickets, isPending, isError, error, refetch, isFetching } = useTickets(apiFilters);
  const { selectedId, searchFor } = useTicketLink();
  const resetKey = JSON.stringify(apiFilters);
  const [phoneColumn, setPhoneColumn] = useState<Priority>('urgent');

  const columns = useMemo(() => {
    const byPriority: Record<Priority, Ticket[]> = { urgent: [], high: [], medium: [], low: [] };
    for (const ticket of tickets ?? []) byPriority[ticket.priority].push(ticket);
    return PRIORITIES.map((priority) => ({ priority, tickets: byPriority[priority] }));
  }, [tickets]);

  const summary = tickets
    ? `${tickets.length} ticket${tickets.length === 1 ? '' : 's'} · ${columns[0]!.tickets.length} urgent`
    : undefined;

  return (
    <SplitView>
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
          <>
            {/* Phones show one priority at a time, switched with these tabs (hidden on wider screens by CSS). */}
            <div className={styles.phoneTabs} role="group" aria-label="Priority">
              {columns.map((column) => (
                <button
                  key={column.priority}
                  type="button"
                  className={styles.phoneTab}
                  data-priority={column.priority}
                  aria-pressed={phoneColumn === column.priority}
                  aria-controls={`column-${column.priority}`}
                  onClick={() => setPhoneColumn(column.priority)}
                >
                  {PRIORITY_LABELS[column.priority]} <span className="mono">{column.tickets.length}</span>
                </button>
              ))}
            </div>
            <div className={styles.board}>
              {columns.map((column) => (
                <BoardColumn
                  key={column.priority}
                  priority={column.priority}
                  activeOnPhone={phoneColumn === column.priority}
                  tickets={column.tickets}
                  // Only the column holding the selected ticket gets its id; the others keep equal props and skip rendering.
                  selectedId={column.tickets.some((ticket) => ticket.id === selectedId) ? selectedId : null}
                  searchFor={searchFor}
                  resetKey={resetKey}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </SplitView>
  );
}
