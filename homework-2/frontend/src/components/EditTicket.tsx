import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ApiError } from '../api/client';
import { useDeleteTicket, useUpdateTicket } from '../api/queries';
import type { Ticket } from '../api/types';
import { useTicketLink } from '../hooks/useTicketLink';
import { useToast } from '../hooks/useToast';
import { formFromTicket, toTicketUpdate, type TicketFormValues } from '../lib/validation';
import styles from './EditTicket.module.css';
import { TicketForm } from './TicketForm';

/**
 * The detail panel in edit mode: the same form as "New ticket", pre-filled, sending only the changed
 * fields. Deleting asks for a second click in place (the viewer never sees a browser confirm() box).
 */
export function EditTicket({ ticket, onDone }: { ticket: Ticket; onDone: () => void }) {
  const update = useUpdateTicket();
  const remove = useDeleteTicket();
  const toast = useToast();
  const navigate = useNavigate();
  const { closeTo } = useTicketLink();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const save = (values: TicketFormValues) => {
    const changes = toTicketUpdate(values, ticket);
    if (Object.keys(changes).length === 0) {
      toast.show('No changes to save.');
      onDone();
      return;
    }
    update.mutate(
      { id: ticket.id, changes },
      {
        onSuccess: () => {
          const chosen = [changes.category && 'category', changes.priority && 'priority'].filter(Boolean).join(' and ');
          toast.show(chosen ? `Saved. The ${chosen} you chose will not be overwritten by the classifier.` : 'Ticket saved.');
          onDone();
        },
      },
    );
  };

  const deleteTicket = () =>
    remove.mutate(ticket.id, {
      onSuccess: () => {
        toast.show('Ticket deleted.');
        navigate(closeTo);
      },
      onError: (error) =>
        toast.show(error instanceof ApiError ? `Could not delete: ${error.message}` : 'Could not delete the ticket.', 'error'),
    });

  return (
    <TicketForm
      mode="edit"
      initialValues={formFromTicket(ticket)}
      submitLabel="Save changes"
      submitting={update.isPending}
      serverError={update.error}
      onSubmit={save}
      onCancel={onDone}
      footer={
        <div className={styles.danger}>
          {confirmingDelete ? (
            <>
              <span className={styles.warning}>Delete this ticket for good? This cannot be undone.</span>
              <div className={styles.dangerActions}>
                <button type="button" className={styles.cancelDelete} onClick={() => setConfirmingDelete(false)} disabled={remove.isPending}>
                  Keep it
                </button>
                <button type="button" className={styles.delete} onClick={deleteTicket} disabled={remove.isPending}>
                  {remove.isPending ? 'Deleting…' : 'Delete ticket'}
                </button>
              </div>
            </>
          ) : (
            <button type="button" className={styles.deleteLink} onClick={() => setConfirmingDelete(true)}>
              Delete ticket…
            </button>
          )}
        </div>
      }
    />
  );
}
