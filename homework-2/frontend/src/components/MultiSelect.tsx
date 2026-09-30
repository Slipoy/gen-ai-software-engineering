import { useEffect, useId, useRef } from 'react';
import styles from './MultiSelect.module.css';

export interface Option<T extends string> {
  value: T;
  label: string;
}

interface MultiSelectProps<T extends string> {
  label: string;
  options: readonly Option<T>[];
  selected: T[];
  onChange: (selected: T[]) => void;
  /** Text on the button when nothing is selected. */
  anyLabel?: string;
}

/**
 * A filter "pill" that opens a list of checkboxes. Built on <details>/<summary>, so it opens with
 * Enter/Space and is announced correctly by screen readers without extra ARIA. Closes on Escape
 * and on a click outside.
 */
export function MultiSelect<T extends string>({ label, options, selected, onChange, anyLabel = 'Any' }: MultiSelectProps<T>) {
  const ref = useRef<HTMLDetailsElement>(null);
  const id = useId();

  useEffect(() => {
    const details = ref.current;
    if (!details) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== 'Escape') return;
      if (event instanceof PointerEvent && details.contains(event.target as Node)) return;
      if (details.open && event instanceof KeyboardEvent) details.querySelector('summary')?.focus();
      details.open = false;
    };
    document.addEventListener('pointerdown', close);
    details.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      details.removeEventListener('keydown', close);
    };
  }, []);

  const summary =
    selected.length === 0
      ? anyLabel
      : selected.length <= 2
        ? options.filter((o) => selected.includes(o.value)).map((o) => o.label).join(', ')
        : `${selected.length} selected`;

  const toggle = (value: T) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);

  return (
    <details ref={ref} className={styles.root} data-active={selected.length > 0 || undefined}>
      <summary className={styles.pill}>
        <span className={styles.label}>{label}:</span> {summary}
        <svg className={styles.chevron} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <fieldset className={styles.menu}>
        <legend className="visually-hidden">{label}</legend>
        {options.map((option) => (
          <label key={option.value} className={styles.option} htmlFor={`${id}-${option.value}`}>
            <input
              id={`${id}-${option.value}`}
              type="checkbox"
              checked={selected.includes(option.value)}
              onChange={() => toggle(option.value)}
            />
            {option.label}
          </label>
        ))}
        {selected.length > 0 && (
          <button type="button" className={styles.reset} onClick={() => onChange([])}>
            Show all
          </button>
        )}
      </fieldset>
    </details>
  );
}
