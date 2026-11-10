import type { RateLimiter } from '../../application/ports';

/**
 * Fixed-window rate limiter in memory.
 * PROTOTYPE: on Cloudflare each isolate has its own memory, so the limit is
 * per isolate, not global. Production: Cloudflare's Rate Limiting binding or
 * a WAF rate-limit rule on /api/v1/chat.
 */
export class MemoryRateLimiter implements RateLimiter {
  private readonly hits = new Map<string, { windowStart: number; count: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  take(key: string): boolean {
    const t = this.now();
    const entry = this.hits.get(key);
    if (!entry || t - entry.windowStart >= this.windowMs) {
      this.hits.set(key, { windowStart: t, count: 1 });
      if (this.hits.size > 10_000) this.prune(t);
      return true;
    }
    entry.count++;
    return entry.count <= this.limit;
  }

  private prune(t: number): void {
    for (const [k, v] of this.hits) if (t - v.windowStart >= this.windowMs) this.hits.delete(k);
  }
}
