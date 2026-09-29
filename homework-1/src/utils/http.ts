import type { Response } from 'express';
import type { FieldError } from '../validators/transactionValidator.js';

export function sendValidationError(res: Response, details: FieldError[]) {
  return res.status(400).json({ error: 'Validation failed', details });
}

export function sendNotFound(res: Response, message: string) {
  return res.status(404).json({ error: 'Not found', message });
}
