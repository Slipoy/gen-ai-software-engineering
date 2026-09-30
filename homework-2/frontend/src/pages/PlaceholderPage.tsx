import styles from './PlaceholderPage.module.css';

/** Temporary page body for screens that later steps fill in (B2–B5). */
export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <section className={styles.page}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.description}>{description}</p>
    </section>
  );
}
