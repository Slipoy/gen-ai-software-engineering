export interface FieldError {
  field: string;
  message: string;
}

/**
 * An error that already knows which HTTP response it should become.
 * Code anywhere in the app can `throw new NotFoundError(...)`; the error handler turns it into JSON.
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly error: string,
    message?: string,
    readonly details?: FieldError[],
  ) {
    super(message ?? error);
    this.name = 'HttpError';
  }
}

export class ValidationError extends HttpError {
  constructor(details: FieldError[]) {
    super(400, 'Validation failed', 'Validation failed', details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends HttpError {
  constructor(message: string) {
    super(404, 'Not found', message);
    this.name = 'NotFoundError';
  }
}
