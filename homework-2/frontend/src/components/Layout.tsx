import { useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import { ApiStatus } from './ApiStatus';
import { NewTicketDialog } from './NewTicketDialog';
import styles from './Layout.module.css';

const NAV_ITEMS = [
  { to: '/', label: 'Queue', end: true },
  { to: '/tickets', label: 'All tickets', end: false },
  { to: '/import', label: 'Import', end: false },
];

/** App shell: header with navigation, then the current page (rendered by <Outlet />). */
export function Layout() {
  const [creating, setCreating] = useState(false);
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <NavLink to="/" className={styles.brand} aria-label="Switchboard home">
          <span className={styles.brandDot} aria-hidden="true" />
          <span className={styles.brandName}>SWITCHBOARD</span>
        </NavLink>

        <nav aria-label="Main" className={styles.nav}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? `${styles.navLink} ${styles.active}` : styles.navLink)}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className={styles.spacer} />
        <ApiStatus />
        <button type="button" className={styles.newTicket} onClick={() => setCreating(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span className={styles.newTicketLabel}>New ticket</span>
        </button>
      </header>

      <NewTicketDialog open={creating} onClose={() => setCreating(false)} />

      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
