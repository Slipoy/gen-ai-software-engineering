import { useSearchParams } from 'react-router';

/**
 * The selected ticket lives in the URL as `?ticket=<id>`, next to the filters, so a view with an open ticket
 * can be shared. `linkTo(id)` builds a link to the current page with that ticket selected and the filters kept;
 * `closeTo` is the same link without a selected ticket.
 */
export function useTicketLink() {
  const [params] = useSearchParams();
  const selectedId = params.get('ticket');

  const linkTo = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('ticket', id);
    return { search: `?${next.toString()}` };
  };

  const closeParams = new URLSearchParams(params);
  closeParams.delete('ticket');
  const closeQuery = closeParams.toString();
  const closeTo = { search: closeQuery ? `?${closeQuery}` : '' };

  return { selectedId, linkTo, closeTo };
}
