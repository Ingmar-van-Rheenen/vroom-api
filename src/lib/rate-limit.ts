import type { MiddlewareHandler } from 'hono';
import { errors } from './errors.js';

interface Bucket {
  count: number;
  resetAt: number;
}

const store = new Map<string, Bucket>();

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyPrefix: string;
}

/**
 * Eenvoudige fixed-window in-memory rate limiter. Voldoende voor een
 * single-instance deploy (PM2 fork-mode). Bij meerdere instances zou je
 * dit naar Redis of de database moeten verplaatsen.
 */
export function rateLimit(opts: RateLimitOptions): MiddlewareHandler {
  return async (c, next) => {
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
    const key = `${opts.keyPrefix}:${ip}`;
    const now = Date.now();
    const bucket = store.get(key);

    if (!bucket || bucket.resetAt <= now) {
      store.set(key, { count: 1, resetAt: now + opts.windowMs });
    } else {
      bucket.count += 1;
      if (bucket.count > opts.max) {
        const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
        c.header('Retry-After', String(retryAfter));
        throw errors.tooManyRequests('Te veel verzoeken, probeer het later opnieuw');
      }
    }

    await next();
  };
}

/** Wis alle buckets - bedoeld voor gebruik in tests. */
export function resetRateLimits(): void {
  store.clear();
}
