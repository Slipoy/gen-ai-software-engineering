import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/api/client';
import { ApiStatus } from '../src/components/ApiStatus';
import { ConfidenceRing } from '../src/components/ConfidenceRing';
import { FilterBar } from '../src/components/FilterBar';
import { MultiSelect } from '../src/components/MultiSelect';
import { EmptyState, ErrorState, LoadingState } from '../src/components/QueryState';
import { CategoryTag, PriorityBadge, StatusTag } from '../src/components/Tag';
import { TicketCard } from '../src/components/TicketCard';
import { useIncrementalList } from '../src/hooks/useIncrementalList';
import { useTicketFilters } from '../src/hooks/useTicketFilters';
import { useTicketLink } from '../src/hooks/useTicketLink';
import { useToast } from '../src/hooks/useToast';
import { makeTicket, mockApi, on, renderWithProviders } from './utils';

const inRouter = (path: string) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>;
  };

describe('useTicketFilters', () => {
  it('reads filters from the URL and drops values the API would reject', () => {
    const { result } = renderHook(() => useTicketFilters(), {
      wrapper: inRouter('/?category=billing_question,nonsense&priority=urgent&search=refund'),
    });
    expect(result.current.values).toEqual({ category: ['billing_question'], priority: ['urgent'], status: [], search: 'refund' });
    expect(result.current.apiFilters).toEqual({ category: ['billing_question'], priority: ['urgent'], search: 'refund' });
    expect(result.current.isDefault).toBe(false);
  });

  it('uses the page default status, and "any" when the user clears it', () => {
    const { result } = renderHook(
      () => ({ filters: useTicketFilters({ defaultStatus: ['new', 'in_progress'] }), location: useLocation() }),
      { wrapper: inRouter('/') },
    );
    expect(result.current.filters.values.status).toEqual(['new', 'in_progress']);
    expect(result.current.filters.isDefault).toBe(true);

    act(() => result.current.filters.setList('status', []));
    expect(result.current.location.search).toBe('?status=any');
    expect(result.current.filters.apiFilters).toEqual({});

    act(() => result.current.filters.setList('category', ['bug_report']));
    act(() => result.current.filters.setSearch('crash'));
    expect(result.current.location.search).toBe('?status=any&category=bug_report&search=crash');

    act(() => result.current.filters.setList('category', []));
    act(() => result.current.filters.setSearch(''));
    act(() => result.current.filters.clear());
    expect(result.current.location.search).toBe('');
  });
});

describe('useTicketLink', () => {
  it('builds links that keep the filters, and a link that closes the ticket', () => {
    const { result } = renderHook(() => useTicketLink(), { wrapper: inRouter('/?category=other&ticket=old') });
    expect(result.current.selectedId).toBe('old');
    expect(result.current.searchFor('new')).toBe('?category=other&ticket=new');
    expect(result.current.closeTo).toEqual({ search: '?category=other' });
  });

  it('closes to an empty query when there are no filters', () => {
    const { result } = renderHook(() => useTicketLink(), { wrapper: inRouter('/?ticket=x') });
    expect(result.current.closeTo).toEqual({ search: '' });
  });
});

describe('useIncrementalList', () => {
  it('shows one page, grows per call and resets when the key changes', () => {
    const items = Array.from({ length: 7 }, (_, i) => i);
    const { result, rerender } = renderHook(({ key }) => useIncrementalList(items, 3, key), { initialProps: { key: 'a' } });

    expect(result.current.visible).toEqual([0, 1, 2]);
    expect(result.current.hidden).toBe(4);
    act(() => result.current.showMore());
    expect(result.current.visible).toHaveLength(6);
    act(() => result.current.showMore());
    expect(result.current.hidden).toBe(0);

    rerender({ key: 'b' });
    expect(result.current.visible).toHaveLength(3);
  });
});

describe('small components', () => {
  it('renders tags with readable labels', () => {
    render(
      <>
        <PriorityBadge priority="urgent" />
        <CategoryTag category="billing_question" />
        <StatusTag status="waiting_customer" />
      </>,
    );
    expect(screen.getByText('Urgent')).toHaveAttribute('data-priority', 'urgent');
    expect(screen.getByText('Billing')).toBeInTheDocument();
    expect(screen.getByText('Waiting')).toBeInTheDocument();
  });

  it.each([
    [0.95, 'high'],
    [0.6, 'medium'],
    [0.2, 'low'],
    [1.7, 'high'],
  ])('shows confidence %s at level %s, clamped to 0..1', (value, level) => {
    const { container } = render(<ConfidenceRing value={value} />);
    expect(container.firstChild).toHaveAttribute('data-level', level);
    expect(screen.getByText(Math.min(value, 1).toFixed(2))).toBeInTheDocument();
  });

  it('shows loading, error (with retry) and empty states', async () => {
    const retry = vi.fn();
    render(
      <>
        <LoadingState />
        <ErrorState error={new ApiError(0, 'Network error', 'Cannot reach the server.')} onRetry={retry} />
        <ErrorState error={new Error('boom')} />
        <EmptyState title="Nothing">hint</EmptyState>
      </>,
    );
    expect(screen.getByText('Loading tickets…')).toBeInTheDocument();
    expect(screen.getByText('Cannot reach the server.')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong while loading the data.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.getByText('Nothing')).toBeInTheDocument();
  });

  it('renders a ticket card as a link that keeps the query string', () => {
    const ticket = makeTicket({ subject: 'Card subject', assigned_to: 'agent.smith', classification: null });
    render(
      <MemoryRouter>
        <TicketCard ticket={ticket} selected search="?ticket=abc" />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: /Card subject/ });
    expect(link).toHaveAttribute('href', '/?ticket=abc');
    expect(link).toHaveAttribute('aria-current', 'true');
    expect(screen.getByText('agent.smith')).toBeInTheDocument();
    expect(screen.queryByText(/conf/)).not.toBeInTheDocument();
  });
});

describe('MultiSelect', () => {
  const options = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta' },
    { value: 'c', label: 'Gamma' },
  ] as const;

  it('summarises the selection and toggles options', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<MultiSelect label="Letters" options={options} selected={[]} onChange={onChange} />);
    expect(screen.getByText('Any')).toBeInTheDocument();

    await userEvent.click(screen.getByText('Letters:'));
    await userEvent.click(screen.getByLabelText('Beta'));
    expect(onChange).toHaveBeenLastCalledWith(['b']);

    rerender(<MultiSelect label="Letters" options={options} selected={['a', 'b']} onChange={onChange} />);
    expect(screen.getByText('Alpha, Beta')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Alpha'));
    expect(onChange).toHaveBeenLastCalledWith(['b']);

    rerender(<MultiSelect label="Letters" options={options} selected={['a', 'b', 'c']} onChange={onChange} />);
    expect(screen.getByText('3 selected')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show all' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('closes on Escape (without letting Escape reach the page) and on a click outside', async () => {
    const onPageEscape = vi.fn();
    document.addEventListener('keydown', onPageEscape);
    const { container } = render(
      <div>
        <MultiSelect label="Letters" options={options} selected={[]} onChange={() => {}} />
        <p>outside</p>
      </div>,
    );
    const details = container.querySelector('details')!;

    await userEvent.click(screen.getByText('Letters:'));
    expect(details.open).toBe(true);
    fireEvent.keyDown(screen.getByLabelText('Alpha'), { key: 'Escape' });
    expect(details.open).toBe(false);
    expect(onPageEscape).not.toHaveBeenCalled();

    fireEvent.keyDown(screen.getByLabelText('Alpha'), { key: 'a' });
    await userEvent.click(screen.getByText('Letters:'));
    fireEvent.pointerDown(screen.getByText('outside'));
    expect(details.open).toBe(false);
    document.removeEventListener('keydown', onPageEscape);
  });
});

describe('FilterBar', () => {
  const values = { category: [], priority: [], status: [], search: '' };

  it('sends the search text only after typing pauses', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onSearchChange = vi.fn();
    render(<FilterBar values={values} onListChange={vi.fn()} onSearchChange={onSearchChange} onClear={vi.fn()} canClear={false} />);

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.type(screen.getByRole('searchbox'), 'crash');
    expect(onSearchChange).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(300));
    expect(onSearchChange).toHaveBeenCalledTimes(1);
    expect(onSearchChange).toHaveBeenCalledWith('crash');
  });

  it('shows the input text from the URL when it changes from outside, and offers a reset', async () => {
    const onClear = vi.fn();
    const onListChange = vi.fn();
    const { rerender } = render(
      <FilterBar values={values} onListChange={onListChange} onSearchChange={vi.fn()} onClear={onClear} canClear summary="3 tickets" />,
    );
    rerender(
      <FilterBar values={{ ...values, search: 'from url' }} onListChange={onListChange} onSearchChange={vi.fn()} onClear={onClear} canClear summary="3 tickets" />,
    );
    expect(screen.getByRole('searchbox')).toHaveValue('from url');
    expect(screen.getByText('3 tickets')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(onClear).toHaveBeenCalled();
    await userEvent.click(screen.getByText('Priority:'));
    await userEvent.click(screen.getByLabelText('High'));
    expect(onListChange).toHaveBeenCalledWith('priority', ['high']);
  });

  it('hides the priority filter when asked (the board groups by priority)', () => {
    render(<FilterBar values={values} onListChange={vi.fn()} onSearchChange={vi.fn()} onClear={vi.fn()} canClear={false} showPriority={false} />);
    expect(screen.queryByText('Priority:')).not.toBeInTheDocument();
  });
});

describe('toasts', () => {
  function Buttons() {
    const toast = useToast();
    return (
      <>
        <button onClick={() => toast.show('Saved it')}>ok</button>
        <button onClick={() => toast.show('It broke', 'error')}>fail</button>
      </>
    );
  }

  it('shows success briefly and keeps errors until dismissed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithProviders(<Buttons />);

    await user.click(screen.getByText('ok'));
    await user.click(screen.getByText('fail'));
    expect(screen.getByText('Saved it')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('It broke');

    act(() => vi.advanceTimersByTime(4100));
    expect(screen.queryByText('Saved it')).not.toBeInTheDocument();
    expect(screen.getByText('It broke')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('It broke')).not.toBeInTheDocument();
  });

  it('refuses to work outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Buttons />)).toThrow('useToast must be used inside <ToastProvider>');
  });
});

describe('ApiStatus', () => {
  it('shows online when /health answers', async () => {
    mockApi(on('GET', '/health', () => ({ body: { status: 'ok' } })));
    renderWithProviders(<ApiStatus />);
    expect(await screen.findByText('API online')).toBeInTheDocument();
  });

  it('shows offline when the backend cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    renderWithProviders(<ApiStatus />);
    await waitFor(() => expect(screen.getByText('API offline')).toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveAttribute('title', expect.stringMatching(/Start the backend/));
  });
});
