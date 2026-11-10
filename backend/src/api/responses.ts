import type { z } from 'zod';
import { envelopeSchema, errorEnvelopeSchema, type ApiErrorCode } from '../../../admin/shared/api-types';
import { API_ERROR_STATUS } from '../../../admin/shared/api-types';

/** The success envelope body. */
export function ok<T>(data: T, message = 'OK'): { success: true; message: string; data: T } {
  return { success: true, message, data };
}

/** OpenAPI response entry for a success envelope around `schema`. */
export function okResponse<T extends z.ZodTypeAny>(schema: T, description: string) {
  return { description, content: { 'application/json': { schema: envelopeSchema(schema) } } } as const;
}

const ERROR_DESCRIPTIONS: Record<number, string> = {
  400: 'Bad path (BAD_PATH)',
  401: 'No or invalid identity (UNAUTHENTICATED)',
  403: 'Role does not allow this, unknown person, or wrong origin (FORBIDDEN, FORBIDDEN_ORIGIN)',
  404: 'Not found (NOT_FOUND)',
  409: 'Already exists or conflicts (ALREADY_EXISTS, CONFLICT, NOTHING_TO_PUBLISH)',
  413: 'Too large (FILE_TOO_LARGE)',
  415: 'File type not allowed (UNSUPPORTED_FILE)',
  422: 'Validation failed (INVALID) — see issues',
  429: 'Too many requests (RATE_LIMITED)',
  500: 'Unexpected failure (SERVER_ERROR, PUBLISH_FAILED) — never includes internals',
  501: 'Not available in this mode (NOT_SUPPORTED)',
  503: 'Feature not configured (NOT_CONFIGURED)',
};

/** Error responses a route can return; 401/403/500 are added for every non-public route. */
export function errorResponses(...statuses: number[]) {
  const out: Record<number, { description: string; content: { 'application/json': { schema: typeof errorEnvelopeSchema } } }> = {};
  for (const s of statuses) out[s] = { description: ERROR_DESCRIPTIONS[s] ?? 'Error', content: { 'application/json': { schema: errorEnvelopeSchema } } };
  return out;
}

export function codesFor(status: number): ApiErrorCode[] {
  return (Object.keys(API_ERROR_STATUS) as ApiErrorCode[]).filter((c) => API_ERROR_STATUS[c] === status);
}
