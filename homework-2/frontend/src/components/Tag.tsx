import type { Category, Priority, Status } from '../api/types';
import { CATEGORY_LABELS, PRIORITY_LABELS, STATUS_LABELS } from '../lib/labels';
import styles from './Tag.module.css';

/** Small label chips used on cards, rows and the detail panel. Colour comes from data-* attributes in CSS. */
export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={styles.priority} data-priority={priority}>
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

export function CategoryTag({ category }: { category: Category }) {
  return <span className={styles.tag}>{CATEGORY_LABELS[category]}</span>;
}

export function StatusTag({ status }: { status: Status }) {
  return (
    <span className={styles.tag} data-status={status}>
      {STATUS_LABELS[status]}
    </span>
  );
}
