import { createMiddleware } from 'hono/factory';
import { tooManyRequests } from '../lib/http.js';
import type { AppEnv } from '../types.js';

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/**
 * Per-isolate rate limiter. Suitable for abuse protection on a Worker; the
 * authoritative enforcement point for sensitive flows (login / OTP) is also
 * backed by D1 attempt counters.
 */
export function rateLimit(options: {
  limit: number;
  windowMs: number;
  key?: (c: never) => string;
}) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const key =
      options.key?.(c as never) ??
      c.req.header('cf-connecting-ip') ??
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
      'anonymous';
    const bucketKey = `${options.limit}:${options.windowMs}:${key}`;
    const now = Date.now();
    const existing = buckets.get(bucketKey);

    if (!existing || existing.resetAt <= now) {
      buckets.set(bucketKey, { count: 1, resetAt: now + options.windowMs });
    } else {
      existing.count += 1;
      if (existing.count > options.limit) {
        const retryAfter = Math.ceil((existing.resetAt - now) / 1000);
        c.header('Retry-After', String(retryAfter));
        throw tooManyRequests();
      }
    }

    // Keep the map bounded.
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) {
        if (v.resetAt <= now) buckets.delete(k);
      }
    }

    await next();
  });
}

export const authRateLimit = rateLimit({ limit: 20, windowMs: 60_000 });
export const otpRateLimit = rateLimit({ limit: 8, windowMs: 60_000 });
export const writeRateLimit = rateLimit({ limit: 120, windowMs: 60_000 });
