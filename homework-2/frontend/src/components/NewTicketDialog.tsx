import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useCreateTicket } from '../api/queries';
import { useToast } from '../hooks/useToast';
import { CATEGORY_LABELS, PRIORITY_LABELS } from '../lib/labels';
import { EMPTY_FORM, toNewTicket, type TicketFormValues } from '../lib/validation';
import styles from './NewTicketDialog.module.css';
import { TicketForm } from './TicketForm';

/**
 * "New ticket" as a modal built on the native <dialog> element: showModal() traps focus inside,
 * dims the page, and closes on Escape, with no extra code or library.
 * On success the new ticket opens in the panel of the current page.
 */
export function NewTicketDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const create = useCreateTicket();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [autoClassify, setAutoClassify] = useState(true);
  const { reset } = create; // stable across renders, so it is safe as an effect dependency

  // Keep the native dialog in sync with the `open` prop; clear the previous error when it opens.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      reset();
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open, reset]);

  const submit = (values: TicketFormValues) =>
    create.mutate(
      { ticket: toNewTicket(values), autoClassify },
      {
        onSuccess: (ticket) => {
          const how = ticket.classification && !ticket.manual_override ? ' and classified as ' : ' as ';
          toast.show(`Ticket created${how}${CATEGORY_LABELS[ticket.category]} · ${PRIORITY_LABELS[ticket.priority]}.`);
          onClose();
          const params = new URLSearchParams(location.search);
          params.set('ticket', ticket.id);
          navigate({ pathname: location.pathname === '/import' ? '/' : location.pathname, search: `?${params}` });
        },
      },
    );

  return (
    <dialog ref={dialogRef} className={styles.dialog} onClose={onClose} aria-labelledby="new-ticket-title">
      <div className={styles.header}>
        <h2 id="new-ticket-title" className={styles.title}>
          New ticket
        </h2>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      {/* Mounted only while open, so every opening starts with an empty form. */}
      {open && (
        <TicketForm
          mode="create"
          initialValues={EMPTY_FORM}
          submitLabel="Create ticket"
          submitting={create.isPending}
          serverError={create.error}
          onSubmit={submit}
          onCancel={onClose}
          footer={
            <label className={styles.checkbox}>
              <input type="checkbox" checked={autoClassify} onChange={(e) => setAutoClassify(e.target.checked)} />
              <span>
                Auto-classify after creating
                <span className={styles.checkboxHint}>A category or priority you choose above is kept as a manual choice.</span>
              </span>
            </label>
          }
        />
      )}
    </dialog>
  );
}
