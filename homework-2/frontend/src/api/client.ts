import type { FieldError } from './types';

/** All API calls go through the dev-server proxy (vite.config.ts) or nginx in production. */
export const API_BASE = '/api';

/**
 * Every failed API call becomes an ApiError, so UI code handles one shape:
 * `status` (0 = the server could not be reached), a short `title`, a readable `message`
 * and, for validation errors, per-field `details` to show next to form inputs.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly title: string;
  readonly details: FieldError[];

  constructor(status: number, title: string, message: string, details: FieldError[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.title = title;
    this.details = details;
  }

  /** The message for one form field, if the server rejected it. */
  fieldMessage(field: string): string | undefined {
    return this.details.find((detail) => detail.field === field)?.message;
  }
}

interface ErrorBody {
  error?: string;
  message?: string;
  details?: FieldError[];
}

async function toApiError(response: Response): Promise<ApiError> {
  let body: ErrorBody = {};
  try {
    body = (await response.json()) as ErrorBody;
  } catch {
    // Not JSON (e.g. a proxy error page): fall back to the status text below.
  }
  const title = body.error ?? (response.statusText || 'Request failed');
  const message = body.message ?? (body.details?.length ? body.details.map((d) => d.message).join('; ') : title);
  return new ApiError(response.status, title, message, body.details ?? []);
}

/**
 * fetch() wrapper: prefixes the base path, sends and parses JSON, and throws ApiError
 * for network failures and non-2xx responses. Returns `undefined` for 204 No Content.
 */
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  // FormData (file upload) sets its own multipart Content-Type with a boundary; never override it.
  if (init.body !== undefined && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('Accept', 'application/json');

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, 'Network error', 'Cannot reach the server. Check that the backend is running.');
  }

  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Builds `?a=1&b=x,y` from an object, skipping empty values. Arrays become comma-separated lists. */
export function toQueryString(params: Record<string, string | string[] | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '' || value === false) continue;
    if (Array.isArray(value)) {
      if (value.length > 0) search.set(key, value.join(','));
    } else {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}
