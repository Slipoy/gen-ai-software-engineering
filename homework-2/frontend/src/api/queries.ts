import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ticketsApi } from './tickets';
import type { NewTicket, Ticket, TicketFilters, TicketUpdate } from './types';

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

/** Creates a ticket, then refetches every list so it shows up on the board and in the table. */
export function useCreateTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ticket, autoClassify }: { ticket: NewTicket; autoClassify: boolean }) =>
      ticketsApi.create(ticket, { autoClassify }),
    onSuccess: (created) => {
      queryClient.setQueryData(ticketKeys.detail(created.id), created);
      void queryClient.invalidateQueries({ queryKey: ticketKeys.lists });
      void queryClient.invalidateQueries({ queryKey: ticketKeys.history(created.id) });
    },
  });
}

export function useUpdateTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: TicketUpdate }) => ticketsApi.update(id, changes),
    onSuccess: (updated) => {
      queryClient.setQueryData(ticketKeys.detail(updated.id), updated);
      void queryClient.invalidateQueries({ queryKey: ticketKeys.lists });
      // Changing category/priority by hand adds an entry to the decision log.
      void queryClient.invalidateQueries({ queryKey: ticketKeys.history(updated.id) });
    },
  });
}

/**
 * Deletes a ticket and refetches the lists. The deleted ticket's own cache entries are left alone on purpose:
 * removing them while its panel is still on screen makes the panel fetch it again (a needless 404). Once the
 * panel closes they are unused and TanStack Query garbage-collects them; if the user goes Back to the ticket,
 * the refetch correctly shows "Ticket not found".
 */
export function useDeleteTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ticketsApi.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ticketKeys.lists });
    },
  });
}

