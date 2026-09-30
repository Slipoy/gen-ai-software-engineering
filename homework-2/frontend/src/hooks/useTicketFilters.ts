import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { CATEGORIES, PRIORITIES, STATUSES, type Category, type Priority, type Status, type TicketFilters } from '../api/types';

/** `?status=any` means "no status filter", as opposed to a missing parameter, which means "use the page default". */
const ANY = 'any';

type ListKey = 'category' | 'priority' | 'status';
const ALLOWED: Record<ListKey, readonly string[]> = { category: CATEGORIES, priority: PRIORITIES, status: STATUSES };

/** Reads a comma-separated list from the URL, dropping values the API would reject (e.g. a hand-edited typo). */
function readList<T extends string>(params: URLSearchParams, key: ListKey): T[] | undefined {
  const raw = params.get(key);
  if (raw === null) return undefined;
  if (raw === ANY) return [];
  return raw.split(',').filter((value): value is T => ALLOWED[key].includes(value));
}

export interface FilterState {
  category: Category[];
  priority: Priority[];
  status: Status[];
  search: string;
}

/**
 * Ticket filters stored in the URL query string, so a filtered view can be bookmarked, shared and navigated
 * with Back/Forward. Returns the values for the UI and the matching `TicketFilters` for the API.
 */
export function useTicketFilters({ defaultStatus = [] as Status[] } = {}) {
  const [params, setParams] = useSearchParams();
  // A string is compared by value, so a new array with the same items on every render does not re-run the memos.
  const defaultKey = defaultStatus.join(',');

  const values: FilterState = useMemo(
    () => ({
      category: readList<Category>(params, 'category') ?? [],
      priority: readList<Priority>(params, 'priority') ?? [],
      status: readList<Status>(params, 'status') ?? (defaultKey ? (defaultKey.split(',') as Status[]) : []),
      search: params.get('search') ?? '',
    }),
    [params, defaultKey],
  );

  /** Only non-empty filters go to the API: an empty list means "any". */
  const apiFilters: TicketFilters = useMemo(
    () => ({
      ...(values.category.length > 0 && { category: values.category }),
      ...(values.priority.length > 0 && { priority: values.priority }),
      ...(values.status.length > 0 && { status: values.status }),
      ...(values.search.trim() && { search: values.search.trim() }),
    }),
    [values],
  );

  const update = useCallback(
    (change: (next: URLSearchParams) => void) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          change(next);
          return next;
        },
        // Typing in search should not add a history entry per keystroke.
        { replace: true },
      );
    },
    [setParams],
  );

  const setList = useCallback(
    (key: ListKey, list: string[]) =>
      update((next) => {
        if (list.length > 0) next.set(key, list.join(','));
        // Clearing the status on a page with a default status means "show all", which needs the sentinel.
        else if (key === 'status' && defaultKey) next.set(key, ANY);
        else next.delete(key);
      }),
    [update, defaultKey],
  );

  const setSearch = useCallback(
    (search: string) => update((next) => (search ? next.set('search', search) : next.delete('search'))),
    [update],
  );

  const clear = useCallback(
    () => update((next) => ['category', 'priority', 'status', 'search'].forEach((key) => next.delete(key))),
    [update],
  );

  const isDefault =
    values.category.length === 0 &&
    values.priority.length === 0 &&
    values.search === '' &&
    values.status.join(',') === defaultKey;

  return { values, apiFilters, setList, setSearch, clear, isDefault };
}
