import { describe, expect, it, vi } from 'vitest';
import { ApiError, request, toQueryString } from '../src/api/client';
import { ticketsApi } from '../src/api/tickets';
import { makeTicket, mockApi, on } from './utils';

describe('request()', () => {
  it('prefixes /api, sends JSON and parses the response', async () => {
    const requests = mockApi(on('POST', '/echo', (req) => ({ status: 201, body: { got: req.body } })));

    await expect(request('/echo', { method: 'POST', body: JSON.stringify({ a: 1 }) })).resolves.toEqual({ got: { a: 1 } });
    expect(requests[0]).toMatchObject({ method: 'POST', path: '/echo' });
    expect(vi.mocked(fetch).mock.calls[0]![0]).toBe('/api/echo');
    const headers = vi.mocked(fetch).mock.calls[0]![1]!.headers as Headers;
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('does not set a Content-Type for FormData uploads (the browser adds the multipart boundary)', async () => {
    mockApi(on('POST', '/upload', () => ({ body: {} })));
    await request('/upload', { method: 'POST', body: new FormData() });
    const headers = vi.mocked(fetch).mock.calls[0]![1]!.headers as Headers;
    expect(headers.get('Content-Type')).toBeNull();
  });

  it('returns undefined for 204 No Content', async () => {
    mockApi(on('DELETE', '/x', () => ({ status: 204 })));
    await expect(request('/x', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('turns an error response into ApiError with title, message and field details', async () => {
    mockApi(
      on('POST', '/tickets', () => ({
        status: 400,
        body: { error: 'Validation failed', details: [{ field: 'customer_email', message: 'bad email' }, { field: 'subject', message: 'required' }] },
      })),
    );

    const error = await request('/tickets', { method: 'POST', body: '{}' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, title: 'Validation failed', message: 'bad email; required' });
    expect((error as ApiError).fieldMessage('subject')).toBe('required');
    expect((error as ApiError).fieldMessage('nope')).toBeUndefined();
  });

  it('copes with an error body that is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Bad gateway</html>', { status: 502, statusText: 'Bad Gateway' })));
    await expect(request('/x')).rejects.toMatchObject({ status: 502, title: 'Bad Gateway', message: 'Bad Gateway' });
  });

  it('reports a network failure as status 0', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    await expect(request('/x')).rejects.toMatchObject({ status: 0, title: 'Network error' });
  });
});

describe('toQueryString()', () => {
  it('skips empty values, joins arrays with commas and encodes text', () => {
    expect(toQueryString({ a: undefined, b: '', c: false, d: [], e: ['x', 'y'], f: true, g: 'a b' })).toBe('?e=x%2Cy&f=true&g=a+b');
    expect(toQueryString({})).toBe('');
  });
});

describe('ticketsApi', () => {
  it('calls the right endpoint for every operation', async () => {
    const ticket = makeTicket({ id: 'abc' });
    const requests = mockApi(
      on('GET', '/health', () => ({ body: { status: 'ok' } })),
      on('GET', '/tickets', () => ({ body: [ticket] })),
      on('GET', '/tickets/:id', () => ({ body: ticket })),
      on('POST', '/tickets', () => ({ status: 201, body: ticket })),
      on('PUT', '/tickets/:id', () => ({ body: ticket })),
      on('DELETE', '/tickets/:id', () => ({ status: 204 })),
      on('POST', '/tickets/:id/auto-classify', () => ({ body: { ticket_id: 'abc', ticket } })),
      on('GET', '/tickets/:id/classifications', () => ({ body: [] })),
      on('POST', '/tickets/import', () => ({ body: { total: 1 } })),
    );

    await ticketsApi.health();
    await ticketsApi.list({ priority: ['urgent', 'high'], search: 'crash' });
    await ticketsApi.get('abc');
    await ticketsApi.create({ customer_id: 'c', customer_email: 'e@x.io', customer_name: 'n', subject: 's', description: 'dddddddddd' }, { autoClassify: true });
    await ticketsApi.update('abc', { status: 'closed' });
    await ticketsApi.remove('abc');
    await ticketsApi.autoClassify('abc', { force: true });
    await ticketsApi.classificationHistory('abc');
    await ticketsApi.importFile(new File(['x'], 'a.csv'), { autoClassify: true });

    expect(requests.map((r) => `${r.method} ${r.path}?${r.query}`)).toEqual([
      'GET /health?',
      'GET /tickets?priority=urgent%2Chigh&search=crash',
      'GET /tickets/abc?',
      'POST /tickets?auto_classify=true',
      'PUT /tickets/abc?',
      'DELETE /tickets/abc?',
      'POST /tickets/abc/auto-classify?force=true',
      'GET /tickets/abc/classifications?',
      'POST /tickets/import?auto_classify=true',
    ]);
    expect(requests[4]!.body).toEqual({ status: 'closed' });
    expect(requests[8]!.body).toBeInstanceOf(FormData);
  });
});
