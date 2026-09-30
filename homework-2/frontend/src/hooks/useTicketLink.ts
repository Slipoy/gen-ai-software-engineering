import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

/**
 * The selected ticket lives in the URL as `?ticket=<id>`, next to the filters, so a view with an open ticket
 * can be shared.
 * - `searchFor(id)`: the query string of the current page with that ticket selected and the filters kept.
 *   It returns a plain string, so memoised cards receive an unchanged prop and skip re-rendering.
 * - `closeTo`: the same page without a selected ticket.
 */
export function useTicketLink() {
  const [params] = useSearchParams();
  const selectedId = params.get('ticket');

  // Filters without the selected ticket: switching tickets must not change the links of the other cards.
  const base = new URLSearchParams(params);
  base.delete('ticket');
  const baseQuery = base.toString();

  const searchFor = useCallback(
    (id: string) => {
      const next = new URLSearchParams(baseQuery);
      next.set('ticket', id);
      return `?${next.toString()}`;
    },
    [baseQuery],
  );

  const closeTo = { search: baseQuery ? `?${baseQuery}` : '' };

  return { selectedId, searchFor, closeTo };
}
