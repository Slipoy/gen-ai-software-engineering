import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ticketsApi } from './tickets';
import type { TicketFilters } from './types';

/**
 * Query keys in one place. Everything under ['tickets'] is ticket data, so after any change
 * (create, update, import) one `invalidateQueries({ queryKey: ticketKeys.all })` refreshes every list.
 */
export const ticketKeys = {
  all: ['tickets'] as const,
  list: (filters: TicketFilters) => ['tickets', 'list', filters] as const,
  detail: (id: string) => ['tickets', 'detail', id] as const,
  history: (id: string) => ['tickets', 'history', id] as const,
};

/** Tickets matching the filters. While new filters load, the previous result stays on screen instead of flashing empty. */
export function useTickets(filters: TicketFilters) {
  return useQuery({
    queryKey: ticketKeys.list(filters),
    queryFn: () => ticketsApi.list(filters),
    placeholderData: keepPreviousData,
  });
}
