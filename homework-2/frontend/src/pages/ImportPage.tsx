import { useId, useRef, useState, type DragEvent } from 'react';
import { Link } from 'react-router';
import { ApiError } from '../api/client';
import { useImportTickets } from '../api/queries';
import type { ImportSummary } from '../api/types';
import { useToast } from '../hooks/useToast';
import styles from './ImportPage.module.css';

/** Same limit as the backend (MAX_IMPORT_FILE_BYTES), checked here first to fail fast without an upload. */
const MAX_BYTES = 5 * 1024 * 1024;
const FORMATS = ['csv', 'json', 'xml'] as const;
/** Show at most this many failed records; a huge broken file should not freeze the page. */
const MAX_FAILURES_SHOWN = 200;

function extensionOf(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Why this file cannot be uploaded, or undefined when it looks fine. */
function checkFile(file: File): string | undefined {
  if (!(FORMATS as readonly string[]).includes(extensionOf(file.name))) return 'Choose a .csv, .json or .xml file.';
  if (file.size > MAX_BYTES) return `The file is ${formatBytes(file.size)}; the limit is 5 MB.`;
  if (file.size === 0) return 'The file is empty.';
  return undefined;
}

function Summary({ summary }: { summary: ImportSummary }) {
  const shown = summary.failures.slice(0, MAX_FAILURES_SHOWN);
  return (
    <section className={styles.result} aria-labelledby="import-result-title">
      <h2 id="import-result-title" className={styles.resultTitle}>
        Import finished
      </h2>
      <dl className={styles.stats}>
        <div>
          <dt>Records</dt>
          <dd>{summary.total}</dd>
        </div>
        <div data-kind="success">
          <dt>Imported</dt>
          <dd>{summary.successful}</dd>
        </div>
        <div data-kind={summary.failed > 0 ? 'error' : undefined}>
          <dt>Failed</dt>
          <dd>{summary.failed}</dd>
        </div>
      </dl>

      {summary.successful > 0 && (
        <p>
          <Link to="/">See them in the queue</Link> or <Link to="/tickets">in all tickets</Link>.
        </p>
      )}

      {summary.failed > 0 && (
        <>
          <h3 className={styles.failuresTitle}>Records that were not imported</h3>
          <p className={styles.muted}>Fix these in the file and import it again; the records above were already created.</p>
          <div className={styles.tableWrap}>
            <table className={styles.failures}>
              <thead>
                <tr>
                  <th scope="col">Where</th>
                  <th scope="col">Field</th>
                  <th scope="col">Problem</th>
                </tr>
              </thead>
              <tbody>
                {shown.flatMap((failure) =>
                  failure.errors.map((error, index) => (
                    <tr key={`${failure.record}-${error.field}-${index}`}>
                      {index === 0 && (
                        <td rowSpan={failure.errors.length} className="mono">
                          {failure.location}
                        </td>
                      )}
                      <td className="mono">{error.field}</td>
                      <td>{error.message}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
          {summary.failures.length > MAX_FAILURES_SHOWN && (
            <p className={styles.muted}>
              Showing the first {MAX_FAILURES_SHOWN} of {summary.failures.length} failed records.
            </p>
          )}
        </>
      )}
    </section>
  );
}

/** Bulk import: pick or drop a CSV, JSON or XML file, upload it, and see what was imported and what failed. */
export function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string>();
  const [autoClassify, setAutoClassify] = useState(true);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const importTickets = useImportTickets();
  const toast = useToast();
  const id = useId();

  const choose = (chosen: File | undefined) => {
    if (!chosen) return;
    importTickets.reset();
    setFile(chosen);
    setFileError(checkFile(chosen));
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    choose(event.dataTransfer.files[0]);
  };

  const upload = () => {
    if (!file || fileError) return;
    importTickets.mutate(
      { file, autoClassify },
      {
        onSuccess: (summary) =>
          toast.show(
            summary.failed === 0
              ? `Imported all ${summary.successful} tickets.`
              : `Imported ${summary.successful} of ${summary.total} tickets; ${summary.failed} need fixing.`,
            summary.failed === 0 ? 'success' : 'error',
          ),
        onError: (error) => toast.show(error instanceof ApiError ? error.message : 'The upload failed.', 'error'),
      },
    );
  };

  const serverError = importTickets.error instanceof ApiError ? importTickets.error : undefined;

  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <h1 className={styles.title}>Import tickets</h1>
        <p className={styles.muted}>
          Bring in tickets exported from another system. Valid records are created, invalid ones are listed with the reason, so
          one typo never blocks the whole file.
        </p>
      </header>

      <div
        className={styles.drop}
        data-dragging={dragging || undefined}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 15V4M7 9l5-5 5 5M5 20h14" />
        </svg>
        <p>
          <strong>Drop a file here</strong> or{' '}
          <button type="button" className={styles.linkButton} onClick={() => inputRef.current?.click()}>
            choose one
          </button>
        </p>
        <p className={styles.muted}>CSV, JSON or XML, up to 5 MB</p>
        <label htmlFor={`${id}-file`} className="visually-hidden">
          Ticket file
        </label>
        <input
          ref={inputRef}
          id={`${id}-file`}
          type="file"
          accept=".csv,.json,.xml,text/csv,application/json,application/xml,text/xml"
          className={styles.fileInput}
          onChange={(event) => {
            choose(event.target.files?.[0]);
            event.target.value = ''; // allow choosing the same file again after fixing it
          }}
        />
      </div>

      {file && (
        <div className={styles.chosen} data-invalid={fileError ? true : undefined}>
          <div className={styles.fileInfo}>
            <span className={styles.fileName}>{file.name}</span>
            <span className={`${styles.muted} mono`}>
              {extensionOf(file.name).toUpperCase()} · {formatBytes(file.size)}
            </span>
          </div>
          {fileError && (
            <p className={styles.fileError} role="alert">
              {fileError}
            </p>
          )}
          <label className={styles.checkbox}>
            <input type="checkbox" checked={autoClassify} onChange={(event) => setAutoClassify(event.target.checked)} />
            Auto-classify imported tickets
            <span className={styles.muted}>Categories and priorities already in the file are kept.</span>
          </label>
          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={() => setFile(null)} disabled={importTickets.isPending}>
              Remove
            </button>
            <button type="button" className={styles.primary} onClick={upload} disabled={Boolean(fileError) || importTickets.isPending}>
              {importTickets.isPending ? 'Importing…' : 'Import tickets'}
            </button>
          </div>
        </div>
      )}

      {serverError && (
        <div className={styles.serverError} role="alert">
          <strong>{serverError.title}</strong>
          <span>{serverError.message}</span>
        </div>
      )}

      {importTickets.data && <Summary summary={importTickets.data} />}

      <details className={styles.guide}>
        <summary>File format</summary>
        <p className={styles.muted}>
          Required fields: <code>customer_id</code>, <code>customer_email</code>, <code>customer_name</code>, <code>subject</code>,{' '}
          <code>description</code>. Optional: <code>category</code>, <code>priority</code>, <code>status</code>, <code>assigned_to</code>,
          tags and metadata.
        </p>
        <h3>CSV</h3>
        <pre>{`customer_id,customer_email,customer_name,subject,description,tags,metadata_source
C-1,jane@example.com,Jane Doe,Cannot log in,The login page rejects my password,login;vip,email`}</pre>
        <h3>JSON</h3>
        <pre>{`[{ "customer_id": "C-1", "customer_email": "jane@example.com", "customer_name": "Jane Doe",
   "subject": "Cannot log in", "description": "The login page rejects my password",
   "tags": ["login"], "metadata": { "source": "email" } }]`}</pre>
        <h3>XML</h3>
        <pre>{`<tickets>
  <ticket>
    <customer_id>C-1</customer_id> <customer_email>jane@example.com</customer_email>
    <customer_name>Jane Doe</customer_name> <subject>Cannot log in</subject>
    <description>The login page rejects my password</description>
    <tags><tag>login</tag></tags> <metadata><source>email</source></metadata>
  </ticket>
</tickets>`}</pre>
      </details>
    </div>
  );
}
