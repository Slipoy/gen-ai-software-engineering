import { useState } from 'react';

/**
 * Renders a long list in pages: the first `pageSize` items, then `pageSize` more per "Show more".
 * Drawing thousands of cards at once blocks the page for about a second; nobody scrolls through
 * them all, and filters narrow the list faster than scrolling does.
 * The count resets to one page when `resetKey` changes (for example when the filters change).
 */
export function useIncrementalList<T>(items: readonly T[], pageSize: number, resetKey: string) {
  const [limit, setLimit] = useState(pageSize);
  const [keyForLimit, setKeyForLimit] = useState(resetKey);

  // Reset during render when the key changes: React's pattern for "reset state when a prop changes".
  let current = limit;
  if (resetKey !== keyForLimit) {
    setKeyForLimit(resetKey);
    setLimit(pageSize);
    current = pageSize;
  }

  return {
    visible: items.length > current ? items.slice(0, current) : items,
    hidden: Math.max(items.length - current, 0),
    showMore: () => setLimit((value) => value + pageSize),
  };
}
