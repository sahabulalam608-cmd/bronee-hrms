import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../types.js';

/**
 * CORS — the web client is served from Cloudflare Pages, the API from a
 * Worker, so cross-origin requests are expected. Credentials are allowed and
 * the allowed origins are pinned via the `ALLOWED_ORIGINS` var (comma list).
 */
export const cors = createMiddleware<AppEnv>(async (c, next) => {
  const allowed = (c.env as unknown as { ALLOWED_ORIGINS?: string }).ALLOWED_ORIGINS?.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const origin = c.req.header('origin');

  const isAllowed =
    !origin ||
    !allowed?.length ||
    allowed.includes(origin) ||
    origin.includes('localhost') ||
    origin.endsWith('.pages.dev') ||
    origin.endsWith('.workers.dev');

  if (origin && isAllowed) {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Vary', 'Origin');
    c.header('Access-Control-Allow-Credentials', 'true');
    c.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');
    c.header('Access-Control-Max-Age', '86400');
  }

  if (c.req.method === 'OPTIONS') {
    return c.body(null, 204);
  }
  await next();
});
