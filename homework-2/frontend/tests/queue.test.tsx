import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fakeBackend } from './fakeBackend';
import { makeTicket, mockApi, on, renderApp } from './utils';

const sample = () => [
  makeTicket({ id: 'a', subject: 'Cannot log in', category: 'account_access', priority: 'urgent' }),
  makeTicket({ id: 'b', subject: 'Charged twice', category: 'billing_question', priority: 'high', assigned_to: 'agent.jones' }),
  makeTicket({ id: 'c', subject: 'Dark mode please', category: 'feature_request', priority: 'low' }),
  makeTicket({ id: 'd', subject: 'Old closed one', priority: 'medium', status: 'closed' }),
];

const column = (name: string) => screen.getByRole('region', { name: new RegExp(`^${name}`, 'i') });

describe('Queue page (priority board)', () => {
  it('groups open tickets into priority columns and asks the API for open statuses only', async () => {
    const backend = fakeBackend(sample());
    renderApp('/');

    expect(await screen.findByText('Cannot log in')).toBeInTheDocument();
    expect(within(column('Urgent')).getByText('Cannot log in')).toBeInTheDocument();
    expect(within(column('High')).getByText('Charged twice')).toBeInTheDocument();
    expect(within(column('Low')).getByText('Dark mode please')).toBeInTheDocument();
    expect(within(column('Medium')).getByText('Nothing here')).toBeInTheDocument();
    expect(screen.queryByText('Old closed one')).not.toBeInTheDocument();
    expect(screen.getByText('3 tickets · 1 urgent')).toBeInTheDocument();

    const listRequest = backend.requests.find((r) => r.path === '/tickets')!;
    expect(listRequest.query.get('status')).toBe('new,in_progress,waiting_customer');
  });

  it('ignores a priority filter left in the URL, since columns already split by priority', async () => {
    const backend = fakeBackend(sample());
    renderApp('/?priority=urgent');
    await screen.findByText('Charged twice');
    expect(backend.requests.find((r) => r.path === '/tickets')!.query.has('priority')).toBe(false);
  });

  it('shows an empty state and an error state', async () => {
    fakeBackend([]);
    const { unmount } = renderApp('/');
    expect(await screen.findByText('No tickets match these filters')).toBeInTheDocument();
    unmount();

    mockApi(on('GET', '/health', () => ({ body: {} })), on('GET', '/tickets', () => ({ status: 500, body: { error: 'Internal server error' } })));
    renderApp('/');
    expect(await screen.findByText('Could not load tickets')).toBeInTheDocument();
  });

  it('shows 50 cards per column and more on request', async () => {
    fakeBackend(Array.from({ length: 60 }, (_, i) => makeTicket({ subject: `Bulk ${i}`, priority: 'urgent' })));
    renderApp('/');
    await screen.findByText('Bulk 0');
    expect(within(column('Urgent')).getAllByRole('link')).toHaveLength(50);

    await userEvent.click(screen.getByRole('button', { name: /Show 10 more/ }));
    expect(within(column('Urgent')).getAllByRole('link')).toHaveLength(60);
  });

  it('switches the visible column with the priority tabs (used on phones)', async () => {
    fakeBackend(sample());
    renderApp('/');
    await screen.findByText('Cannot log in');

    const tabs = within(screen.getByRole('group', { name: 'Priority' }));
    expect(tabs.getByRole('button', { name: /Urgent/ })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(tabs.getByRole('button', { name: /Low/ }));
    expect(tabs.getByRole('button', { name: /Low/ })).toHaveAttribute('aria-pressed', 'true');
    expect(column('Low')).toHaveAttribute('data-active-on-phone', 'true');
    expect(column('Urgent')).not.toHaveAttribute('data-active-on-phone');
  });
});

describe('Ticket panel', () => {
  it('opens a ticket from the board, shows its details and closes with Escape', async () => {
    fakeBackend(sample());
    const { router } = renderApp('/');
    await userEvent.click(await screen.findByText('Charged twice'));

    const panel = await screen.findByRole('complementary', { name: 'Charged twice' });
    expect(router.state.location.search).toBe('?ticket=b');
    expect(within(panel).getByText('agent.jones')).toBeInTheDocument();
    expect(within(panel).getByText('This ticket has not been classified yet.')).toBeInTheDocument();
    expect(await within(panel).findByText('No decisions yet.')).toBeInTheDocument();
    expect(within(panel).getByRole('heading', { name: 'Charged twice' })).toHaveFocus();

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('complementary')).not.toBeInTheDocument());
    expect(router.state.location.search).toBe('');
  });

  it('classifies a ticket and updates the panel, the board and the decision log', async () => {
    fakeBackend(sample());
    renderApp('/?ticket=c');
    const panel = await screen.findByRole('complementary', { name: 'Dark mode please' });

    await userEvent.click(within(panel).getByRole('button', { name: 'Classify' }));
    expect(await within(panel).findByText('Classified as Billing · High.')).toBeInTheDocument();
    expect(within(panel).getByText('0.90')).toBeInTheDocument();
    expect(within(panel).getByText('refund')).toBeInTheDocument();
    expect(await within(panel).findByText(/Classifier set Billing · High/)).toBeInTheDocument();
    await waitFor(() => expect(within(column('High')).getByText('Dark mode please')).toBeInTheDocument());
  });

  it('keeps a manual choice and applies the suggestion only when asked', async () => {
    fakeBackend([makeTicket({ id: 'm', subject: 'Manual one', category: 'other', priority: 'low', manual_override: true })]);
    renderApp('/?ticket=m');
    const panel = await screen.findByRole('complementary', { name: 'Manual one' });

    await userEvent.click(within(panel).getByRole('button', { name: 'Classify' }));
    expect(await within(panel).findByText('The classifier suggests Billing · High, but the manual choice was kept.')).toBeInTheDocument();
    expect(within(panel).getByText(/An agent set this ticket to Other · Low/)).toBeInTheDocument();
    expect(await within(panel).findByText(/manual choice kept/)).toBeInTheDocument();

    await userEvent.click(within(panel).getByRole('button', { name: 'Apply suggestion' }));
    expect(await within(panel).findByText('Classified as Billing · High.')).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: 'Apply suggestion' })).not.toBeInTheDocument();
  });

  it('says so when the classifier agrees with a manual choice', async () => {
    fakeBackend([makeTicket({ id: 'g', subject: 'Agrees', category: 'billing_question', priority: 'high', manual_override: true })]);
    renderApp('/?ticket=g');
    const panel = await screen.findByRole('complementary', { name: 'Agrees' });
    await userEvent.click(within(panel).getByRole('button', { name: 'Classify' }));
    expect(await within(panel).findByText('The classifier agrees with the current Billing · High.')).toBeInTheDocument();
    expect(await within(panel).findByText(/Classifier agreed with Billing · High/)).toBeInTheDocument();
  });

  it('shows full details for a resolved ticket without optional data', async () => {
    fakeBackend([
      makeTicket({
        id: 'r',
        subject: 'Resolved one',
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        tags: ['login', 'vip'],
        metadata: { source: 'phone', browser: null, device_type: null },
      }),
    ]);
    renderApp('/tickets?ticket=r');
    const panel = await screen.findByRole('complementary', { name: 'Resolved one' });
    // Both the status badge and the "Resolved" date row are there.
    expect(within(panel).getAllByText('Resolved')).toHaveLength(2);
    expect(within(panel).getByText('Phone')).toBeInTheDocument();
    expect(within(panel).getByText('Unknown')).toBeInTheDocument();
    expect(within(panel).getByText('login, vip')).toBeInTheDocument();
  });

  it('explains a ticket that no longer exists, and a server failure', async () => {
    fakeBackend([]);
    const { unmount } = renderApp('/tickets?ticket=gone');
    expect(await screen.findByText('Ticket not found')).toBeInTheDocument();
    expect(screen.getByText('It may have been deleted.')).toBeInTheDocument();
    unmount();

    mockApi(
      on('GET', '/health', () => ({ body: {} })),
      on('GET', '/tickets', () => ({ body: [] })),
      on('GET', '/tickets/:id/classifications', () => ({ status: 500, body: { error: 'Boom' } })),
      on('GET', '/tickets/:id', () => ({ status: 500, body: { error: 'Internal server error', message: 'Database is down' } })),
    );
    renderApp('/tickets?ticket=x');
    expect(await screen.findByText('Could not load the ticket')).toBeInTheDocument();
    expect(screen.getByText('Database is down')).toBeInTheDocument();
  });

  it('shows a classification error and a failed decision log', async () => {
    const ticket = makeTicket({ id: 'e', subject: 'Errors' });
    mockApi(
      on('GET', '/health', () => ({ body: {} })),
      on('GET', '/tickets', () => ({ body: [ticket] })),
      on('GET', '/tickets/:id/classifications', () => ({ status: 500, body: { error: 'Boom' } })),
      on('GET', '/tickets/:id', () => ({ body: ticket })),
      on('POST', '/tickets/:id/auto-classify', () => ({ status: 503, body: { error: 'Unavailable', message: 'Classifier is offline' } })),
    );
    renderApp('/?ticket=e');
    const panel = await screen.findByRole('complementary', { name: 'Errors' });
    expect(await within(panel).findByText('Could not load the decision log.')).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('button', { name: 'Classify' }));
    expect(await within(panel).findByText('Classifier is offline')).toBeInTheDocument();
  });
});
