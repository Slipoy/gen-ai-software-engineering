import { useEffect, useRef, useState } from 'react';
import { CATEGORIES, PRIORITIES, STATUSES, type Category, type Priority, type Status } from '../api/types';
import type { FilterState } from '../hooks/useTicketFilters';
import { CATEGORY_LABELS, PRIORITY_LABELS, STATUS_LABELS } from '../lib/labels';
import styles from './FilterBar.module.css';
import { MultiSelect } from './MultiSelect';

const categoryOptions = CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] }));
const priorityOptions = PRIORITIES.map((value) => ({ value, label: PRIORITY_LABELS[value] }));
const statusOptions = STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] }));
const SEARCH_DELAY_MS = 300;

interface FilterBarProps {
  values: FilterState;
  onListChange: (key: 'category' | 'priority' | 'status', values: string[]) => void;
  onSearchChange: (search: string) => void;
  onClear: () => void;
  canClear: boolean;
  /** The board groups by priority, so it hides the priority filter. */
  showPriority?: boolean;
  /** Short summary on the right, e.g. "42 tickets · 9 urgent". */
  summary?: string;
}

export function FilterBar({ values, onListChange, onSearchChange, onClear, canClear, showPriority = true, summary }: FilterBarProps) {
  // The input updates on every keystroke; the URL (and so the request) only once typing pauses for 300 ms.
  const [search, setSearch] = useState(values.search);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const onType = (text: string) => {
    setSearch(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onSearchChange(text), SEARCH_DELAY_MS);
  };

  // When the URL changes from elsewhere (Reset filters, Back/Forward), show that in the input too.
  // Adjusting state during render is React's recommended pattern for "reset state when a prop changes".
  const [syncedSearch, setSyncedSearch] = useState(values.search);
  if (values.search !== syncedSearch) {
    setSyncedSearch(values.search);
    setSearch(values.search);
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div className={styles.bar} role="search">
      <label className={styles.search}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <span className="visually-hidden">Search tickets</span>
        <input type="search" value={search} placeholder="Search subject or description" onChange={(e) => onType(e.target.value)} />
      </label>

      <MultiSelect<Category> label="Category" options={categoryOptions} selected={values.category} onChange={(v) => onListChange('category', v)} />
      {showPriority && (
        <MultiSelect<Priority> label="Priority" options={priorityOptions} selected={values.priority} onChange={(v) => onListChange('priority', v)} />
      )}
      <MultiSelect<Status> label="Status" options={statusOptions} selected={values.status} onChange={(v) => onListChange('status', v)} />

      {canClear && (
        <button type="button" className={styles.clear} onClick={onClear}>
          Reset filters
        </button>
      )}
      <div className={styles.spacer} />
      {summary && (
        <span className={styles.summary} aria-live="polite">
          {summary}
        </span>
      )}
    </div>
  );
}
