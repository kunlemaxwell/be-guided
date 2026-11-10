import type { ContentMode, RequestStatus, RequestType } from '../../../shared/api-types';

/** Plain-language wording used across the admin. */
export const CONTENT_MODE_OPTIONS: { value: ContentMode; label: string; hint: string }[] = [
  { value: 'text', label: 'Text only', hint: 'Update the written steps and explanations.' },
  { value: 'text+screens', label: 'Text + screenshots', hint: 'Update the writing and retake the screenshots.' },
  { value: 'video', label: 'Video only', hint: 'Record the walkthrough video again.' },
  { value: 'all', label: 'Everything', hint: 'Text, screenshots and video.' },
];

export const MODE_LABEL: Record<ContentMode, string> = {
  text: 'Text only',
  'text+screens': 'Text + screenshots',
  video: 'Video only',
  all: 'Everything (text, screenshots and video)',
};

export const REQUEST_TYPE_LABEL: Record<RequestType, string> = {
  'check-updates': 'Check for updates',
  'make-video': 'Make a video',
  'refresh-page': 'Refresh a page',
  'new-page': 'Write a new page',
  'new-product': 'Add a new product',
  'new-module': 'Add a new module',
};

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  queued: 'Waiting',
  'in-progress': 'In progress',
  done: 'Done',
  cancelled: 'Cancelled',
};

export const MODULE_GROUP_OPTIONS = [
  { value: 'start', label: 'Getting started' },
  { value: 'run', label: 'Everyday work' },
  { value: 'approve', label: 'Approvals' },
  { value: 'administer', label: 'Setup and administration' },
] as const;

export const VIDEO_NOTE = 'Videos are always real click-throughs of the app.';
export const MODE_CAPTION = 'Anything with video is recorded as a real click-through of the app.';

export function formatDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}
