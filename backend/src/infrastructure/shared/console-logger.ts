import type { Logger } from '../../application/ports';

/**
 * Structured JSON log lines (one object per line). Callers pass opaque ids
 * and counts only: never tokens, keys, message contents or personal data.
 */
export const consoleLogger: Logger = {
  info: (message, fields) => console.log(JSON.stringify({ level: 'info', message, ...fields })),
  warn: (message, fields) => console.warn(JSON.stringify({ level: 'warn', message, ...fields })),
  error: (message, fields) => console.error(JSON.stringify({ level: 'error', message, ...fields })),
};

export const silentLogger: Logger = { info: () => undefined, warn: () => undefined, error: () => undefined };
