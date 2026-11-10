/**
 * Minimal structural types for the Cloudflare bindings this app uses, so
 * the code type-checks without the global @cloudflare/workers-types (which
 * clash with DOM types) and tests can pass simple fakes.
 */
export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  all<T = unknown>(): Promise<{ results: T[] }>;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<{ meta: { changes?: number } }>;
}

export interface D1DatabaseLike {
  prepare(sql: string): D1PreparedStatementLike;
  batch(statements: D1PreparedStatementLike[]): Promise<unknown[]>;
}

export interface R2ObjectBodyLike {
  body: ReadableStream<Uint8Array>;
  size: number;
}

export interface R2BucketLike {
  head(key: string): Promise<{ size: number } | null>;
  get(key: string): Promise<R2ObjectBodyLike | null>;
  put(key: string, value: Uint8Array, options?: { httpMetadata?: { contentType?: string }; onlyIf?: { etagDoesNotMatch?: string } }): Promise<unknown | null>;
  list(options: { prefix: string; cursor?: string; limit?: number }): Promise<{ objects: { key: string }[]; truncated: boolean; cursor?: string }>;
}

export interface AssetsLike {
  fetch(request: Request): Promise<Response>;
}

/** Everything wrangler.toml binds plus the variables/secrets set in Cloudflare. */
export interface WorkerEnv {
  DB: D1DatabaseLike;
  /** Absent until R2 is switched on for the account (uploads are then refused). */
  MEDIA?: R2BucketLike;
  ASSETS?: AssetsLike;
  [key: string]: unknown;
}
