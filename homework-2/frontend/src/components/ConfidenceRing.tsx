import type { CSSProperties } from 'react';
import styles from './ConfidenceRing.module.css';

/**
 * Circular 0–1 gauge for the classifier's confidence, drawn with a conic-gradient.
 * The number is real text inside, so screen readers get it as "0.95 confidence".
 */
export function ConfidenceRing({ value }: { value: number }) {
  const clamped = Math.min(Math.max(value, 0), 1);
  const level = clamped >= 0.75 ? 'high' : clamped >= 0.5 ? 'medium' : 'low';
  return (
    <div className={styles.ring} data-level={level} style={{ '--value': `${clamped * 100}%` } as CSSProperties}>
      <div className={styles.inner}>
        <span className={styles.number}>{clamped.toFixed(2)}</span>
        <span className={styles.caption}>confidence</span>
      </div>
    </div>
  );
}
