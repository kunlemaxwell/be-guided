import path from 'node:path';

/**
 * Build-time configuration. Read once; everything environment-specific lives
 * here so moving from local → staging → production is a settings change only.
 */
export type HelpEnv = 'local' | 'staging' | 'production';

function readEnv(): HelpEnv {
  const v = process.env.NEXT_PUBLIC_HELP_ENV;
  return v === 'staging' || v === 'production' ? v : 'local';
}

export const config = {
  env: readEnv(),
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
  contentDir: path.resolve(process.cwd(), process.env.CONTENT_DIR ?? './content'),
  includePrivate: process.env.INCLUDE_PRIVATE_PRODUCTS === 'true',
} as const;
