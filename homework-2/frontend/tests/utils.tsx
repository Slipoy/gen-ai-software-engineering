import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import type { Ticket } from '../src/api/types';
import { ToastProvider } from '../src/components/toast/ToastProvider';
import { routes } from '../src/router';

let sequence = 0;

/** A complete ticket as the API returns it; tests override what they care about. */
export function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  sequence += 1;
  return {
    id: `t-${sequence}`,
    customer_id: `CUST-${sequence}`,
    customer_email: `customer${sequence}@example.com`,
    customer_name: `Customer ${sequence}`,
    subject: `Ticket number ${sequence}`,
    description: 'The customer describes the problem in detail here.',
    category: 'other',
    priority: 'medium',
    status: 'new',
    created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    resolved_at: null,
    assigned_to: null,
    tags: [],
    metadata: { source: 'web_form', browser: 'Chrome 128', device_type: 'desktop' },
    classification: null,
    manual_override: false,
    ...overrides,
  };
}

export interface FakeRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
}

type Handler = (request: FakeRequest) => { status?: number; body?: unknown } | undefined;

/**
 * Replaces window.fetch with a tiny fake API. Each handler gets the parsed request and returns a response,
 * or undefined to let the next handler try. Unmatched requests answer 404, so a test sees a missing handler
 * as a visible error instead of a hang. Returns the list of requests made, for assertions.
 */
export function mockApi(...handlers: Handler[]) {
  const requests: FakeRequest[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input), 'http://localhost');
    const path = url.pathname.replace(/^\/api/, '');
    const raw = init.body;
    const body = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const request = { method: init.method ?? 'GET', path, query: url.searchParams, body };
    requests.push(request);

    const response = handlers.reduce<ReturnType<Handler>>((found, handler) => found ?? handler(request), undefined) ?? {
      status: 404,
      body: { error: 'Not found', message: `No test handler for ${request.method} ${path}` },
    };
    const status = response.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(response.body ?? {}), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return requests;
}

/** Handler helper: `on('GET', '/tickets', () => ({ body: [...] }))`. A path may contain `:id`. */
export function on(method: string, pattern: string, respond: (request: FakeRequest, params: Record<string, string>) => { status?: number; body?: unknown }): Handler {
  const regex = new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`);
  return (request) => {
    if (request.method !== method) return undefined;
    const match = regex.exec(request.path);
    return match ? respond(request, match.groups ?? {}) : undefined;
  };
}

function testQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } } });
}

/** The whole app (header, routes, providers) at `path`, as a user would see it. */
export function renderApp(path = '/') {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const queryClient = testQueryClient();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { ...view, router, queryClient };
}

/** A single component with the providers it may need, inside a router at `path`. */
export function renderWithProviders(ui: ReactElement, { path = '/' } = {}) {
  const router = createMemoryRouter([{ path: '*', element: ui }], { initialEntries: [path] });
  const queryClient = testQueryClient();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { ...view, router, queryClient };
}
