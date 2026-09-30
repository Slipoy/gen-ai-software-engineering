import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ApiError } from '../api/client';
import { CATEGORIES, DEVICE_TYPES, PRIORITIES, SOURCES, STATUSES } from '../api/types';
import { CATEGORY_LABELS, PRIORITY_LABELS, SOURCE_LABELS, STATUS_LABELS } from '../lib/labels';
import { LIMITS, validateTicketForm, type FormErrors, type TicketFormValues } from '../lib/validation';
import styles from './TicketForm.module.css';

type FieldName = keyof TicketFormValues;

/** Fields in the order they appear on screen, to find the first one with an error. */
const FIELD_ORDER: FieldName[] = [
  'customer_name', 'customer_email', 'customer_id', 'subject', 'description',
  'category', 'priority', 'status', 'assigned_to', 'tags', 'source', 'device_type', 'browser',
];

/** Maps a server error field ("metadata.browser", "tags[2]") to the form input that shows it. */
function formFieldFor(serverField: string): FieldName | undefined {
  const name = serverField.replace(/^metadata\./, '').replace(/\[\d+\]$/, '');
  return name in LIMITS || ['customer_email', 'category', 'priority', 'status', 'source', 'device_type', 'tags'].includes(name)
    ? (name as FieldName)
    : undefined;
}

interface TicketFormProps {
  mode: 'create' | 'edit';
  initialValues: TicketFormValues;
  submitLabel: string;
  submitting: boolean;
  /** The last error from the server, if the previous submit failed. */
  serverError: unknown;
  onSubmit: (values: TicketFormValues) => void;
  onCancel: () => void;
  /** Extra controls under the fields (the auto-classify checkbox, the delete button). */
  footer?: ReactNode;
}

export function TicketForm({ mode, initialValues, submitLabel, submitting, serverError, onSubmit, onCancel, footer }: TicketFormProps) {
  const [values, setValues] = useState(initialValues);
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const id = useId();

  const clientErrors = validateTicketForm(values);

  // Server errors are shown under their fields until the user edits that field again.
  const [dismissedServerFields, setDismissedServerFields] = useState<Set<FieldName>>(new Set());
  const serverErrors: FormErrors = {};
  let serverMessage: string | undefined;
  if (serverError instanceof ApiError) {
    let shownUnderAField = false;
    for (const detail of serverError.details) {
      const field = formFieldFor(detail.field);
      if (!field) continue;
      shownUnderAField = true;
      if (!dismissedServerFields.has(field)) serverErrors[field] ??= detail.message;
    }
    // A general message only when no error belongs to an input (e.g. 413, or an unknown field),
    // decided before dismissals, so fixing a field does not turn its error into a banner.
    if (!shownUnderAField) serverMessage = serverError.message;
  } else if (serverError) {
    serverMessage = 'Saving failed. Check your connection and try again.';
  }

  const errorFor = (field: FieldName) =>
    (touched[field] || submitted ? clientErrors[field] : undefined) ?? serverErrors[field];

  const set = (field: FieldName) => (event: { target: { value: string } }) => {
    setValues((current) => ({ ...current, [field]: event.target.value }));
    if (serverErrors[field]) setDismissedServerFields((current) => new Set(current).add(field));
  };
  const blur = (field: FieldName) => () => setTouched((current) => ({ ...current, [field]: true }));

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    setDismissedServerFields(new Set());
    const firstInvalid = FIELD_ORDER.find((name) => clientErrors[name]);
    if (firstInvalid) {
      // Take keyboard and screen-reader users straight to the first problem. The error attributes
      // appear on the next render, so the field is looked up by id rather than by aria-invalid.
      formRef.current?.querySelector<HTMLElement>(`#${CSS.escape(`${id}-${firstInvalid}`)}`)?.focus();
      return;
    }
    onSubmit(values);
  };

  /** Props shared by every input: id, value, change/blur handlers and the ARIA wiring for its error. */
  const inputProps = (field: FieldName) => ({
    id: `${id}-${field}`,
    name: field,
    value: values[field],
    onChange: set(field),
    onBlur: blur(field),
    'aria-invalid': Boolean(errorFor(field)),
    'aria-describedby': errorFor(field) ? `${id}-${field}-error` : undefined,
  });

  const field = (name: FieldName, label: string, control: ReactNode, hint?: string, wide = false) => (
    <div className={wide ? `${styles.field} ${styles.wide}` : styles.field}>
      <label htmlFor={`${id}-${name}`} className={styles.label}>
        {label}
        {hint && <span className={styles.hint}>{hint}</span>}
      </label>
      {control}
      {errorFor(name) && (
        <span id={`${id}-${name}-error`} className={styles.error}>
          {errorFor(name)}
        </span>
      )}
    </div>
  );

  const counter = (name: 'subject' | 'description') => `${values[name].trim().length}/${LIMITS[name].max}`;

  return (
    <form ref={formRef} className={styles.form} onSubmit={handleSubmit} noValidate>
      {serverMessage && (
        <p className={styles.formError} role="alert">
          {serverMessage}
        </p>
      )}

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Customer</legend>
        {field('customer_name', 'Name', <input {...inputProps('customer_name')} autoComplete="name" />)}
        {field('customer_email', 'Email', <input {...inputProps('customer_email')} type="email" autoComplete="email" />)}
        {field('customer_id', 'Customer ID', <input {...inputProps('customer_id')} className="mono" />)}
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Request</legend>
        {field('subject', 'Subject', <input {...inputProps('subject')} />, counter('subject'), true)}
        {field('description', 'Description', <textarea {...inputProps('description')} rows={5} />, counter('description'), true)}
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Triage</legend>
        {field(
          'category',
          'Category',
          <select {...inputProps('category')}>
            {mode === 'create' && <option value="">Let the classifier decide</option>}
            {CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {CATEGORY_LABELS[value]}
              </option>
            ))}
          </select>,
        )}
        {field(
          'priority',
          'Priority',
          <select {...inputProps('priority')}>
            {mode === 'create' && <option value="">Let the classifier decide</option>}
            {PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {PRIORITY_LABELS[value]}
              </option>
            ))}
          </select>,
        )}
        {field(
          'status',
          'Status',
          <select {...inputProps('status')}>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {STATUS_LABELS[value]}
              </option>
            ))}
          </select>,
        )}
        {field('assigned_to', 'Assignee', <input {...inputProps('assigned_to')} placeholder="Unassigned" />)}
        {field('tags', 'Tags', <input {...inputProps('tags')} placeholder="login, vip" />, 'comma-separated', true)}
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Channel</legend>
        {field(
          'source',
          'Source',
          <select {...inputProps('source')}>
            {SOURCES.map((value) => (
              <option key={value} value={value}>
                {SOURCE_LABELS[value]}
              </option>
            ))}
          </select>,
        )}
        {field(
          'device_type',
          'Device',
          <select {...inputProps('device_type')}>
            <option value="">Unknown</option>
            {DEVICE_TYPES.map((value) => (
              <option key={value} value={value}>
                {value[0]!.toUpperCase() + value.slice(1)}
              </option>
            ))}
          </select>,
        )}
        {field('browser', 'Browser', <input {...inputProps('browser')} placeholder="Chrome 128" />, undefined, true)}
      </fieldset>

      {footer}

      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className={styles.primary} disabled={submitting}>
          {submitting ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
