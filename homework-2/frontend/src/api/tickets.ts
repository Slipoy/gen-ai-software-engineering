import { request, toQueryString } from './client';
import type {
  AutoClassifyOutcome,
  ClassificationDecision,
  ImportSummary,
  NewTicket,
  Ticket,
  TicketFilters,
  TicketUpdate,
} from './types';

/** One function per backend endpoint. Components never call fetch() directly. */
export const ticketsApi = {
  health: () => request<{ status: string }>('/health'),

  list: (filters: TicketFilters = {}) =>
    request<Ticket[]>(`/tickets${toQueryString({ ...filters })}`),

  get: (id: string) => request<Ticket>(`/tickets/${encodeURIComponent(id)}`),

  create: (ticket: NewTicket, { autoClassify = false } = {}) =>
    request<Ticket>(`/tickets${toQueryString({ auto_classify: autoClassify })}`, {
      method: 'POST',
      body: JSON.stringify(ticket),
    }),

  update: (id: string, changes: TicketUpdate) =>
    request<Ticket>(`/tickets/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(changes) }),

  remove: (id: string) => request<void>(`/tickets/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  autoClassify: (id: string, { force = false } = {}) =>
    request<AutoClassifyOutcome>(`/tickets/${encodeURIComponent(id)}/auto-classify${toQueryString({ force })}`, {
      method: 'POST',
    }),

  classificationHistory: (id: string) =>
    request<ClassificationDecision[]>(`/tickets/${encodeURIComponent(id)}/classifications`),

  importFile: (file: File, { autoClassify = false } = {}) => {
    const form = new FormData();
    form.append('file', file);
    return request<ImportSummary>(`/tickets/import${toQueryString({ auto_classify: autoClassify })}`, {
      method: 'POST',
      body: form,
    });
  },
};
