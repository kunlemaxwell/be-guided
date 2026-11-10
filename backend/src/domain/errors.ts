import type { ZodError } from 'zod';
import { API_ERROR_STATUS, type ApiErrorCode, type FieldIssue } from '../../../admin/shared/api-types';

/**
 * A failure the API turns into a typed, plain-language response
 * `{ success: false, code, message, issues? }`. Thrown anywhere below the API
 * layer; mapped to an HTTP status in exactly one place (api/middleware/errors).
 */
export class AppError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly issues?: FieldIssue[],
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function httpStatus(code: ApiErrorCode): number {
  return API_ERROR_STATUS[code];
}

const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  summary: 'Summary',
  name: 'Name',
  email: 'Email',
  role: 'Role',
  slug: 'Web address name',
  updated: 'Updated date',
  order: 'Order',
  author: 'Author',
  visibility: 'Who can see it',
  'video.src': 'Video file',
  'video.poster': 'Cover picture',
  appUrl: 'App address',
  messages: 'The conversation',
  theme: 'Theme',
  siteName: 'Site name',
  localPath: 'Folder on this computer',
  defaultMode: 'Light or dark to start with',
  themeCustom: 'Theme customizer',
  'video.display': 'Video display',
  status: 'Status',
  audience: 'Who it’s for',
  prerequisites: 'Do these first',
  appRoutes: 'App screens',
  group: 'Section',
  active: 'Active',
};

function humanize(segment: string): string {
  const words = segment.replace(/([a-z])([A-Z0-9])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function fieldLabel(path: string): string {
  const last = path.split('.').filter((p) => !/^\d+$/.test(p)).pop() ?? '';
  if (FIELD_LABELS[path]) return FIELD_LABELS[path];
  const parts = path.split('.').filter((p) => !/^\d+$/.test(p));
  if (parts.length > 1) return parts.map((p, i) => (i === 0 ? FIELD_LABELS[p] ?? humanize(p) : humanize(p))).join(' › ');
  return FIELD_LABELS[last] ?? (path ? humanize(path) : 'Value');
}

/** Turns schema errors into "Title is required"-style field issues. */
export function issuesFromZod(error: ZodError): FieldIssue[] {
  return error.issues.map((i) => {
    const field = i.path.join('.');
    const raw = i.message === 'Required' ? 'is required' : i.message;
    const message = raw.replace(/^String must contain at least 1 character\(s\)$/, 'is required');
    return { field, message: `${fieldLabel(field)} ${message.charAt(0).toLowerCase()}${message.slice(1)}` };
  });
}

/** INVALID error with one issue per field. `what` is e.g. "page" → "This page can't be saved yet: …". */
export function invalid(error: ZodError, what: string): AppError {
  const issues = issuesFromZod(error);
  return new AppError('INVALID', `This ${what} can't be saved yet: ${issues.map((i) => i.message).join('; ')}.`, issues);
}
