import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { ImportSummary } from '../src/api/types';
import { fakeBackend } from './fakeBackend';
import { makeTicket, mockApi, on, renderApp } from './utils';

describe('All tickets page', () => {
  it('lists tickets of every status, filters through the URL and opens one', async () => {
    const backend = fakeBackend([
      makeTicket({ id: 'x', subject: 'Open crash', priority: 'urgent', category: 'technical_issue' }),
      makeTicket({ id: 'y', subject: 'Closed invoice', priority: 'low', status: 'closed', category: 'billing_question' }),
    ]);
    const { router } = renderApp('/tickets');

    const table = await screen.findByRole('table', { name: 'Tickets' });
    expect(within(table).getByText('Open crash')).toBeInTheDocument();
    expect(within(table).getByText('Closed invoice')).toBeInTheDocument();
    expect(screen.getByText('2 tickets')).toBeInTheDocument();

    await userEvent.click(screen.getByText('Priority:'));
    await userEvent.click(screen.getByLabelText('Urgent'));
    await waitFor(() => expect(within(table).queryByText('Closed invoice')).not.toBeInTheDocument());
    expect(router.state.location.search).toBe('?priority=urgent');
    expect(backend.requests.at(-1)!.query.get('priority')).toBe('urgent');

    await userEvent.click(within(table).getByText('Open crash'));
    expect(await screen.findByRole('complementary', { name: 'Open crash' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('?priority=urgent&ticket=x');
  });

  it('shows 50 rows at a time', async () => {
    fakeBackend(Array.from({ length: 55 }, (_, i) => makeTicket({ subject: `Row ${i}` })));
    renderApp('/tickets');
    await screen.findByText('Row 0');
    expect(screen.getAllByRole('row')).toHaveLength(51); // header + 50
    await userEvent.click(screen.getByRole('button', { name: /Show 5 more/ }));
    expect(screen.getAllByRole('row')).toHaveLength(56);
  });

  it('shows empty and error states', async () => {
    fakeBackend([]);
    const { unmount } = renderApp('/tickets');
    expect(await screen.findByText('No tickets match these filters')).toBeInTheDocument();
    unmount();

    mockApi(on('GET', '/health', () => ({ body: {} })), on('GET', '/tickets', () => ({ status: 500, body: { error: 'Boom', message: 'Database is down' } })));
    renderApp('/tickets');
    expect(await screen.findByText('Database is down')).toBeInTheDocument();
  });
});

describe('New ticket dialog', () => {
  const fill = async (fields: Record<string, string>) => {
    for (const [label, value] of Object.entries(fields)) {
      const input = screen.getByLabelText(new RegExp(`^${label}`));
      await userEvent.clear(input);
      if (value) await userEvent.type(input, value);
    }
  };

  it('validates on submit, focuses the first problem, then creates and opens the ticket', async () => {
    const backend = fakeBackend([]);
    const { router } = renderApp('/');
    await screen.findByText('No tickets match these filters');

    await userEvent.click(screen.getByRole('button', { name: 'New ticket' }));
    const dialog = screen.getByRole('dialog', { name: 'New ticket' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create ticket' }));

    expect(within(dialog).getByText('Name is required')).toBeInTheDocument();
    expect(within(dialog).getByText('Description is required')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Name')).toHaveFocus();
    expect(backend.requests.some((r) => r.method === 'POST')).toBe(false);

    await fill({
      Name: 'Olga Tanaka',
      Email: 'olga.tanaka@example.com',
      'Customer ID': 'UI-1',
      Subject: 'Refund please',
      Description: 'I was charged twice, please refund ASAP.',
      Tags: 'Billing, VIP',
    });
    expect(within(dialog).getByText('13/200')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create ticket' }));

    expect(await screen.findByText('Ticket created and classified as Billing · High.')).toBeInTheDocument();
    const create = backend.requests.find((r) => r.method === 'POST')!;
    expect(create.query.get('auto_classify')).toBe('true');
    expect(create.body).toMatchObject({ customer_email: 'olga.tanaka@example.com', tags: ['billing', 'vip'] });
    expect(create.body).not.toHaveProperty('category');
    expect(router.state.location.search).toBe('?ticket=new-1');
    await waitFor(() => expect(dialog).not.toHaveAttribute('open'));
  });

  it('shows validation errors as the user leaves a field, and server errors under their fields', async () => {
    mockApi(
      on('GET', '/health', () => ({ body: {} })),
      on('GET', '/tickets', () => ({ body: [] })),
      on('POST', '/tickets', () => ({
        status: 400,
        body: { error: 'Validation failed', details: [{ field: 'metadata.browser', message: 'Browser is not allowed here' }] },
      })),
    );
    renderApp('/');
    await userEvent.click(await screen.findByRole('button', { name: 'New ticket' }));
    const dialog = screen.getByRole('dialog');

    await userEvent.type(within(dialog).getByLabelText('Email'), 'nope');
    await userEvent.tab();
    expect(within(dialog).getByText('Enter an email like name@example.com')).toBeInTheDocument();

    await fill({ Name: 'A', Email: 'a@example.com', 'Customer ID': 'C', Subject: 'S', Description: 'Long enough text', Browser: 'X' });
    await userEvent.selectOptions(within(dialog).getByLabelText('Category'), 'bug_report');
    await userEvent.click(within(dialog).getByLabelText(/Auto-classify/));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create ticket' }));

    const browserError = await within(dialog).findByText('Browser is not allowed here');
    expect(within(dialog).getByLabelText(/^Browser/)).toHaveAttribute('aria-describedby', browserError.id);
    // Editing the field hides the server error until the next submit.
    await userEvent.type(within(dialog).getByLabelText(/^Browser/), 'Y');
    expect(within(dialog).queryByText('Browser is not allowed here')).not.toBeInTheDocument();
  });

  it('shows a general message for errors that do not belong to a field', async () => {
    mockApi(
      on('GET', '/health', () => ({ body: {} })),
      on('GET', '/tickets', () => ({ body: [] })),
      on('POST', '/tickets', () => ({ status: 413, body: { error: 'Payload too large', message: 'The request is too big' } })),
    );
    renderApp('/');
    await userEvent.click(await screen.findByRole('button', { name: 'New ticket' }));
    await fill({ Name: 'A', Email: 'a@example.com', 'Customer ID': 'C', Subject: 'S', Description: 'Long enough text' });
    await userEvent.click(screen.getByRole('button', { name: 'Create ticket' }));
    expect(await screen.findByText('The request is too big')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('dialog', { hidden: true })).not.toHaveAttribute('open');
  });
});

describe('Editing and deleting', () => {
  it('saves only changed fields and says which ones became a manual choice', async () => {
    const backend = fakeBackend([makeTicket({ id: 'e', subject: 'Edit me', priority: 'medium' })]);
    renderApp('/?ticket=e');
    const panel = await screen.findByRole('complementary', { name: 'Edit me' });

    await userEvent.click(within(panel).getByRole('button', { name: 'Edit' }));
    expect(within(panel).getByRole('heading', { name: 'Edit ticket' })).toHaveFocus();
    await userEvent.selectOptions(within(panel).getByLabelText('Priority'), 'urgent');
    await userEvent.type(within(panel).getByLabelText('Assignee'), 'agent.garcia');
    await userEvent.click(within(panel).getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Saved. The priority you chose will not be overwritten by the classifier.')).toBeInTheDocument();
    expect(backend.requests.find((r) => r.method === 'PUT')!.body).toEqual({ priority: 'urgent', assigned_to: 'agent.garcia' });
    expect(await within(panel).findByText(/An agent changed it to Other · Urgent/)).toBeInTheDocument();
  });

  it('does not send a request when nothing changed, and Escape leaves edit mode first', async () => {
    const backend = fakeBackend([makeTicket({ id: 'n', subject: 'No change' })]);
    renderApp('/?ticket=n');
    const panel = await screen.findByRole('complementary', { name: 'No change' });

    await userEvent.click(within(panel).getByRole('button', { name: 'Edit' }));
    await userEvent.keyboard('{Escape}');
    expect(within(panel).getByRole('button', { name: 'Edit' })).toBeInTheDocument();

    await userEvent.click(within(panel).getByRole('button', { name: 'Edit' }));
    await userEvent.click(within(panel).getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('No changes to save.')).toBeInTheDocument();
    expect(backend.requests.some((r) => r.method === 'PUT')).toBe(false);
  });

  it('saves a non-classification change with a plain message', async () => {
    fakeBackend([makeTicket({ id: 'p', subject: 'Plain' })]);
    renderApp('/?ticket=p');
    const panel = await screen.findByRole('complementary', { name: 'Plain' });
    await userEvent.click(within(panel).getByRole('button', { name: 'Edit' }));
    await userEvent.selectOptions(within(panel).getByLabelText('Status'), 'in_progress');
    await userEvent.click(within(panel).getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Ticket saved.')).toBeInTheDocument();
  });

  it('deletes after a second confirmation and closes the panel', async () => {
    const backend = fakeBackend([makeTicket({ id: 'del', subject: 'Delete me' })]);
    const { router } = renderApp('/?ticket=del');
    const panel = await screen.findByRole('complementary', { name: 'Delete me' });

    await userEvent.click(within(panel).getByRole('button', { name: 'Edit' }));
    await userEvent.click(within(panel).getByRole('button', { name: 'Delete ticket…' }));
    await userEvent.click(within(panel).getByRole('button', { name: 'Keep it' }));
    expect(backend.tickets.has('del')).toBe(true);

    await userEvent.click(within(panel).getByRole('button', { name: 'Delete ticket…' }));
    expect(within(panel).getByText(/cannot be undone/)).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('button', { name: 'Delete ticket' }));

    expect(await screen.findByText('Ticket deleted.')).toBeInTheDocument();
    expect(backend.tickets.has('del')).toBe(false);
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('reports a failed delete', async () => {
    const ticket = makeTicket({ id: 'f', subject: 'Cannot delete' });
    mockApi(
      on('GET', '/health', () => ({ body: {} })),
      on('GET', '/tickets', () => ({ body: [ticket] })),
      on('GET', '/tickets/:id/classifications', () => ({ body: [] })),
      on('GET', '/tickets/:id', () => ({ body: ticket })),
      on('DELETE', '/tickets/:id', () => ({ status: 409, body: { error: 'Conflict', message: 'Ticket is locked' } })),
    );
    renderApp('/?ticket=f');
    const panel = await screen.findByRole('complementary', { name: 'Cannot delete' });
    await userEvent.click(within(panel).getByRole('button', { name: 'Edit' }));
    await userEvent.click(within(panel).getByRole('button', { name: 'Delete ticket…' }));
    await userEvent.click(within(panel).getByRole('button', { name: 'Delete ticket' }));
    expect(await screen.findByText('Could not delete: Ticket is locked')).toBeInTheDocument();
  });
});

describe('Import page', () => {
  const summary = (overrides: Partial<ImportSummary> = {}): ImportSummary => ({
    format: 'csv',
    total: 3,
    successful: 2,
    failed: 1,
    created_ids: ['a', 'b'],
    failures: [
      { record: 3, location: 'line 4', errors: [{ field: 'customer_email', message: 'bad email' }, { field: 'subject', message: 'required' }] },
    ],
    ...overrides,
  });
  const csv = (name = 'tickets.csv', content = 'customer_id\nC-1') => new File([content], name, { type: 'text/csv' });

  it('uploads a chosen file and shows the summary with per-row errors', async () => {
    const requests = mockApi(on('GET', '/health', () => ({ body: {} })), on('POST', '/tickets/import', () => ({ body: summary() })));
    renderApp('/import');

    await userEvent.upload(await screen.findByLabelText('Ticket file'), csv());
    expect(screen.getByText('tickets.csv')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Import tickets' }));

    expect(await screen.findByText('Imported 2 of 3 tickets; 1 need fixing.')).toBeInTheDocument();
    const result = screen.getByRole('region', { name: 'Import finished' });
    expect(within(result).getByText('line 4')).toBeInTheDocument();
    expect(within(result).getByText('bad email')).toBeInTheDocument();
    expect(within(result).getByRole('link', { name: 'See them in the queue' })).toHaveAttribute('href', '/');
    expect(requests.find((r) => r.path === '/tickets/import')!.query.get('auto_classify')).toBe('true');
  });

  it('accepts a dropped file, reports full success and can import without classification', async () => {
    const requests = mockApi(
      on('GET', '/health', () => ({ body: {} })),
      on('POST', '/tickets/import', () => ({ body: summary({ total: 2, successful: 2, failed: 0, failures: [] }) })),
    );
    renderApp('/import');
    const zone = (await screen.findByText('Drop a file here')).closest('div')!;

    fireEvent.dragOver(zone);
    expect(zone).toHaveAttribute('data-dragging', 'true');
    fireEvent.dragLeave(zone);
    fireEvent.drop(zone, { dataTransfer: { files: [csv('export.json', '[]')] } });
    await userEvent.click(screen.getByLabelText(/Auto-classify imported tickets/));
    await userEvent.click(screen.getByRole('button', { name: 'Import tickets' }));

    expect(await screen.findByText('Imported all 2 tickets.')).toBeInTheDocument();
    expect(requests.find((r) => r.path === '/tickets/import')!.query.has('auto_classify')).toBe(false);
  });

  it('checks the file before uploading', async () => {
    mockApi(on('GET', '/health', () => ({ body: {} })));
    renderApp('/import');
    const input = await screen.findByLabelText('Ticket file');

    await userEvent.upload(input, new File(['x'], 'notes.txt'), { applyAccept: false });
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a .csv, .json or .xml file.');
    expect(screen.getByRole('button', { name: 'Import tickets' })).toBeDisabled();

    await userEvent.upload(input, new File([''], 'empty.csv'));
    expect(screen.getByRole('alert')).toHaveTextContent('The file is empty.');

    const big = new File(['x'], 'big.xml');
    Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 });
    await userEvent.upload(input, big);
    expect(screen.getByRole('alert')).toHaveTextContent('The file is 6.0 MB; the limit is 5 MB.');

    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.queryByText('big.xml')).not.toBeInTheDocument();
  });

  it('shows why the server rejected the whole file', async () => {
    mockApi(
      on('GET', '/health', () => ({ body: {} })),
      on('POST', '/tickets/import', () => ({ status: 400, body: { error: 'Invalid import file', message: 'Could not read CSV file: Quote Not Closed' } })),
    );
    renderApp('/import');
    await userEvent.upload(await screen.findByLabelText('Ticket file'), csv('broken.csv', '"unclosed'));
    await userEvent.click(screen.getByRole('button', { name: 'Import tickets' }));

    expect(await screen.findByText('Invalid import file')).toBeInTheDocument();
    expect(screen.getAllByText('Could not read CSV file: Quote Not Closed').length).toBeGreaterThan(0);
  });

  it('limits a very long list of failures', async () => {
    const failures = Array.from({ length: 205 }, (_, i) => ({ record: i + 1, location: `line ${i + 2}`, errors: [{ field: 'subject', message: 'required' }] }));
    mockApi(
      on('GET', '/health', () => ({ body: {} })),
      on('POST', '/tickets/import', () => ({ body: summary({ total: 205, successful: 0, failed: 205, created_ids: [], failures }) })),
    );
    renderApp('/import');
    await userEvent.upload(await screen.findByLabelText('Ticket file'), csv('bad.csv', 'x'.repeat(2048)));
    await userEvent.click(screen.getByRole('button', { name: 'Import tickets' }));

    expect(await screen.findByText('Showing the first 200 of 205 failed records.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'See them in the queue' })).not.toBeInTheDocument();
    expect(screen.getByText('2.0 KB', { exact: false })).toBeInTheDocument();
  });
});

describe('App shell', () => {
  it('navigates between screens and shows a 404 for unknown addresses', async () => {
    fakeBackend([]);
    const { router } = renderApp('/nowhere');
    expect(await screen.findByText('Page not found')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: 'Go to the queue' }));
    expect(router.state.location.pathname).toBe('/');
    expect(screen.getByRole('link', { name: 'Queue' })).toHaveAttribute('aria-current', 'page');

    await userEvent.click(screen.getByRole('link', { name: 'Import' }));
    expect(await screen.findByRole('heading', { name: 'Import tickets' })).toBeInTheDocument();
  });
});
