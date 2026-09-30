import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ticketsApi } from './tickets';
import type { Ticket, TicketFilters } from './types';

/**
 * Query keys in one place. Everything under ['tickets'] is ticket data, so after any change
 * (create, update, import) one `invalidateQueries({ queryKey: ticketKeys.all })` refreshes every list.
 */
export const ticketKeys = {
  all: ['tickets'] as const,
  lists: ['tickets', 'list'] as const,
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

/** Finds a ticket in any list already in the cache, so the detail panel can open instantly. */
function ticketFromLists(queryClient: QueryClient, id: string): Ticket | undefined {
  for (const [, tickets] of queryClient.getQueriesData<Ticket[]>({ queryKey: ticketKeys.lists })) {
    const found = tickets?.find((ticket) => ticket.id === id);
    if (found) return found;
  }
  return undefined;
}

/**
 * One ticket. Shows the copy from the list right away (placeholder) and fetches the fresh version
 * in the background, so opening the panel never shows a spinner for a ticket already on screen.
 */
export function useTicket(id: string | null) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ticketKeys.detail(id ?? ''),
    queryFn: () => ticketsApi.get(id!),
    enabled: id !== null,
    placeholderData: () => (id ? ticketFromLists(queryClient, id) : undefined),
  });
}

export function useClassificationHistory(id: string | null) {
  return useQuery({
    queryKey: ticketKeys.history(id ?? ''),
    queryFn: () => ticketsApi.classificationHistory(id!),
    enabled: id !== null,
  });
}

/**
 * Runs the classifier on a ticket. On success the returned ticket replaces the cached one immediately,
 * and lists and the decision log are refetched (the ticket may now belong in another column).
 */
export function useAutoClassify() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, force = false }: { id: string; force?: boolean }) => ticketsApi.autoClassify(id, { force }),
    onSuccess: (outcome) => {
      queryClient.setQueryData(ticketKeys.detail(outcome.ticket_id), outcome.ticket);
      void queryClient.invalidateQueries({ queryKey: ticketKeys.lists });
      void queryClient.invalidateQueries({ queryKey: ticketKeys.history(outcome.ticket_id) });
    },
  });
}
