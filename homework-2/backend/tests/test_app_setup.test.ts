import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.js';
import { HttpError, NotFoundError, ValidationError } from '../src/errors.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

describe('loadConfig', () => {
  it('defaults to port 3000', () => {
    expect(loadConfig({})).toEqual({ port: 3000 });
  });

  it('reads PORT from the environment', () => {
    expect(loadConfig({ PORT: '4000' })).toEqual({ port: 4000 });
  });

  it.each(['abc', '0', '70000', '3000.5'])('rejects PORT=%s', (port) => {
    expect(() => loadConfig({ PORT: port })).toThrow(/PORT must be an integer/);
  });
});

describe('errorHandler', () => {
  afterEach(() => vi.restoreAllMocks());

  /** A throwaway app with one route that throws the given error. */
  function appThrowing(error: unknown) {
    const app = express();
    app.get('/boom', () => {
      throw error;
    });
    app.use(errorHandler);
    return app;
  }

  it('renders a ValidationError with its field details', async () => {
    const res = await request(appThrowing(new ValidationError([{ field: 'email', message: 'Invalid email' }]))).get('/boom');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Validation failed', details: [{ field: 'email', message: 'Invalid email' }] });
  });

  it('renders a NotFoundError with its message', async () => {
    const res = await request(appThrowing(new NotFoundError('Ticket 42 not found'))).get('/boom');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found', message: 'Ticket 42 not found' });
  });

  it('renders a custom HttpError', async () => {
    const res = await request(appThrowing(new HttpError(409, 'Conflict'))).get('/boom');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Conflict' });
  });

  it('maps a too-large body to 413', async () => {
    const res = await request(appThrowing({ type: 'entity.too.large' })).get('/boom');
    expect(res.status).toBe(413);
  });

  it('hides unexpected errors behind a generic 500', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(appThrowing(new Error('database password is hunter2'))).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
    expect(log).toHaveBeenCalledOnce();
  });
});
