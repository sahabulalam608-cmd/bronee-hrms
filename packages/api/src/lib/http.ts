import type { Context } from 'hono';
import type { ApiResponse } from '@bronee/shared';

export class HttpError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.name = 'HttpError';
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new HttpError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message = 'Authentication required') => new HttpError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'You do not have permission to perform this action') =>
  new HttpError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Resource not found') => new HttpError(404, 'NOT_FOUND', message);
export const conflict = (message: string, details?: unknown) => new HttpError(409, 'CONFLICT', message, details);
export const tooManyRequests = (message = 'Too many requests. Please slow down.') =>
  new HttpError(429, 'RATE_LIMITED', message);
export const serverError = (message = 'Something went wrong on our side') =>
  new HttpError(500, 'INTERNAL_ERROR', message);

export function ok<T>(c: Context, data: T, meta?: Record<string, unknown>) {
  const body: ApiResponse<T> = { ok: true, data };
  if (meta) body.meta = meta;
  return c.json(body, 200);
}

export function created<T>(c: Context, data: T) {
  const body: ApiResponse<T> = { ok: true, data };
  return c.json(body, 201);
}

export function fail(c: Context, status: number, code: string, message: string, details?: unknown) {
  const body: ApiResponse<never> = { ok: false, error: { code, message, details } };
  return c.json(body, status as 400);
}
