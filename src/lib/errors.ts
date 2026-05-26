import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';

export class AppError extends HTTPException {
  readonly code: string;

  constructor(status: 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500, code: string, message: string) {
    super(status, { message });
    this.code = code;
  }
}

export const errors = {
  unauthorized: (msg = 'Niet ingelogd') => new AppError(401, 'unauthorized', msg),
  forbidden: (msg = 'Geen toegang') => new AppError(403, 'forbidden', msg),
  notFound: (msg = 'Niet gevonden') => new AppError(404, 'not_found', msg),
  badRequest: (msg = 'Ongeldige aanvraag') => new AppError(400, 'bad_request', msg),
  conflict: (msg = 'Conflict') => new AppError(409, 'conflict', msg),
  tooManyRequests: (msg = 'Te veel verzoeken') => new AppError(429, 'too_many_requests', msg),
};

export function errorHandler(err: Error, c: Context): Response {
  if (err instanceof AppError) {
    return c.json({ error: { code: err.code, message: err.message } }, err.status);
  }
  if (err instanceof HTTPException) {
    return c.json({ error: { code: 'http_error', message: err.message } }, err.status);
  }
  if (err instanceof ZodError) {
    return c.json(
      { error: { code: 'validation_error', message: 'Validatie mislukt', details: err.flatten() } },
      400,
    );
  }

  console.error('[unhandled]', err);
  return c.json({ error: { code: 'internal_error', message: 'Er ging iets mis' } }, 500);
}
