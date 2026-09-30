import type { ErrorRequestHandler, RequestHandler } from 'express';
import multer from 'multer';
import { HttpError } from '../errors.js';

/** Responds 404 for any route that no router handled. Registered after all routers. */
export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: 'Not found', message: `Route ${req.method} ${req.path} does not exist` });
};

/**
 * Last middleware in the chain: converts any thrown error into a consistent JSON response.
 * Express recognises it as an error handler because it takes four arguments.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({
      error: err.error,
      ...(err.message !== err.error && { message: err.message }),
      ...(err.details && { details: err.details }),
    });
  }

  // Errors raised by express.json() carry a `type` field.
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: 'Validation failed',
      details: [{ field: 'body', message: 'Request body must be valid JSON' }],
    });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Payload too large' });
  }

  // Upload errors from multer (file too big, unexpected field name, ...).
  if (err instanceof multer.MulterError) {
    const tooLarge = err.code === 'LIMIT_FILE_SIZE';
    return res.status(tooLarge ? 413 : 400).json({
      error: tooLarge ? 'Payload too large' : 'Invalid upload',
      message: tooLarge ? 'The file is larger than the 5 MB limit' : err.message,
    });
  }

  // Anything else is a bug: log the details, but never leak them to the client.
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
};
