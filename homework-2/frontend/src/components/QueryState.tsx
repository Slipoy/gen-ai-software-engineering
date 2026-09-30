import type { ReactNode } from 'react';
import { ApiError } from '../api/client';
import styles from './QueryState.module.css';

/** What a screen shows while its data is loading, failed, or came back empty. */
export function LoadingState({ label = 'Loading tickets…' }: { label?: string }) {
  return (
    <div className={styles.state} role="status">
      <span className={styles.spinner} aria-hidden="true" />
      {label}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof ApiError ? error.message : 'Something went wrong while loading the data.';
  return (
    <div className={styles.state} role="alert">
      <strong className={styles.title}>Could not load tickets</strong>
      <span>{message}</span>
      {onRetry && (
        <button type="button" className={styles.button} onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className={styles.state}>
      <strong className={styles.title}>{title}</strong>
      {children}
    </div>
  );
}
