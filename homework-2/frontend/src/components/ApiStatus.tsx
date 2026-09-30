import { useQuery } from '@tanstack/react-query';
import { ticketsApi } from '../api/tickets';
import styles from './ApiStatus.module.css';

/**
 * Small indicator in the header: is the backend reachable?
 * Polls /health every 15 s, so it turns red within seconds when the backend stops.
 */
export function ApiStatus() {
  const { isSuccess, isError, isPending } = useQuery({
    queryKey: ['health'],
    queryFn: ticketsApi.health,
    refetchInterval: 15_000,
    retry: false,
  });

  const state = isPending ? 'checking' : isSuccess ? 'online' : 'offline';
  const label = { checking: 'Connecting…', online: 'API online', offline: 'API offline' }[state];

  return (
    <span className={styles.status} data-state={state} role="status" title={isError ? 'Start the backend: npm run dev in backend/' : undefined}>
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.label}>{label}</span>
    </span>
  );
}
