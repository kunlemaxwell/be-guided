import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';
import { AppError, httpStatus, issuesFromZod } from '../../domain/errors';
import type { BaseEnv } from '../context';

/**
 * Maps every failure to the error envelope `{ success:false, code, message, issues? }`.
 * Unexpected errors are logged (name + correlation id only) and answered with
 * a generic SERVER_ERROR: no stack traces, SQL or internals ever leave.
 */
export function onError<E extends BaseEnv>(error: Error, c: Context<E>): Response {
  if (error instanceof AppError) {
    const body = { success: false as const, code: error.code, message: error.message, ...(error.issues?.length ? { issues: error.issues } : {}) };
    return c.json(body, httpStatus(error.code) as 400);
  }
  if (error instanceof ZodError) {
    const issues = issuesFromZod(error);
    return c.json({ success: false as const, code: 'INVALID' as const, message: `This can't be saved yet: ${issues.map((i) => i.message).join('; ')}.`, issues }, 422);
  }
  if (error instanceof HTTPException && error.status === 413) {
    return c.json({ success: false as const, code: 'FILE_TOO_LARGE' as const, message: 'That is too much to send in one go.' }, 413);
  }
  // A body that is not valid JSON (the request validator rejects it before the route runs).
  if ((error instanceof HTTPException && error.status === 400) || error instanceof SyntaxError) {
    return c.json({ success: false as const, code: 'BAD_REQUEST' as const, message: 'The request body is not valid JSON.' }, 400);
  }
  let logger: { error: (m: string, f?: Record<string, unknown>) => void } = console;
  try {
    logger = c.get('services').logger;
  } catch {
    /* services not set yet */
  }
  logger.error('request.failed', { correlationId: c.get('correlationId'), error: error.name, path: c.req.path });
  return c.json({ success: false as const, code: 'SERVER_ERROR' as const, message: 'Something went wrong. Nothing was changed. Try again.' }, 500);
}

export function notFound<E extends BaseEnv>(c: Context<E>): Response {
  return c.json({ success: false as const, code: 'NOT_FOUND' as const, message: 'That address is not part of the API.' }, 404);
}
