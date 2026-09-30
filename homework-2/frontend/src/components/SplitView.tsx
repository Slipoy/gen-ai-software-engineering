import type { ReactNode } from 'react';
import { useTicketLink } from '../hooks/useTicketLink';
import styles from './SplitView.module.css';
import { TicketPanel } from './TicketPanel';

/** Page content on the left, and the selected ticket's panel on the right when `?ticket=<id>` is set. */
export function SplitView({ children }: { children: ReactNode }) {
  const { selectedId } = useTicketLink();
  return (
    <div className={styles.split}>
      <div className={styles.content}>{children}</div>
      {selectedId && <TicketPanel key={selectedId} ticketId={selectedId} />}
    </div>
  );
}
