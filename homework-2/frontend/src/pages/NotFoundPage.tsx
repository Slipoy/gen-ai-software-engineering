import { Link } from 'react-router';
import styles from './PlaceholderPage.module.css';

export function NotFoundPage() {
  return (
    <section className={styles.page}>
      <h1 className={styles.title}>Page not found</h1>
      <p className={styles.description}>
        This address does not match any screen. <Link to="/">Go to the queue</Link>
      </p>
    </section>
  );
}
