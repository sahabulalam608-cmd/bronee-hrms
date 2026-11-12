import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import {
  ALLOWED_UPLOAD_MIME,
  MAX_UPLOAD_BYTES,
  fileMetaSchema,
} from '@bronee/shared';
import { files } from '../db/schema.js';
import { badRequest, forbidden, notFound, ok } from '../lib/http.js';
import { randomId } from '../lib/crypto.js';
import { requireAuth } from '../middleware/auth.js';
import { canAccessFile, findFile } from '../lib/queries.js';
import { requestMeta, writeAudit } from '../lib/audit.js';
import type { AppEnv } from '../types.js';
export const fileRoutes = new Hono<AppEnv>();

fileRoutes.use('*', requireAuth);

const SAFE_NAME = /[^a-zA-Z0-9._-]/g;

/**
 * Upload a file to the private R2 bucket.
 * Only metadata is stored in D1 — never a public URL.
 */
fileRoutes.post('/upload', async (c) => {
  const db = c.get('db');
  const env = c.get('env');
  const session = c.get('session');

  const form = await c.req.parseBody();
  const file = form['file'];
  const purpose = String(form['purpose'] ?? 'general');

  if (!(file instanceof File)) {
    throw badRequest('Attach a file to upload.');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw badRequest(`Files must be ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))}MB or smaller.`);
  }
  if (!ALLOWED_UPLOAD_MIME.includes(file.type)) {
    throw badRequest('This file type is not allowed.');
  }

  const safeName = file.name.replace(SAFE_NAME, '_').slice(-120);
  const key = `${session.id}/${purpose}/${randomId()}-${safeName}`;

  const buffer = await file.arrayBuffer();
  await env.FILES.put(key, buffer, {
    httpMetadata: { contentType: file.type },
    customMetadata: { ownerId: session.id, purpose },
  });

  const record = {
    id: randomId(),
    key,
    name: file.name,
    mimeType: file.type,
    size: file.size,
    ownerId: session.id,
    purpose,
    createdAt: new Date().toISOString(),
  };
  await db.insert(files).values(record);

  const meta = requestMeta(c);
  await writeAudit(db, {
    actorId: session.id,
    actorName: session.fullName,
    action: 'file.uploaded',
    entityType: 'file',
    entityId: record.id,
    after: { key, name: record.name, size: record.size, purpose },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return ok(c, { file: { ...record, url: `/api/files/${record.id}/content` } });
});

/** File metadata for a key owned by (or shared with) the caller. */
fileRoutes.get('/:id', async (c) => {
  const db = c.get('db');
  const session = c.get('session');
  const id = c.req.param('id');

  const rows = await db.select().from(files).where(eq(files.id, id)).limit(1);
  const file = rows[0];
  if (!file) throw notFound('File not found.');
  if (!canAccessFile(file, session)) throw forbidden('You do not have access to this file.');

  return ok(c, { file: { ...file, url: `/api/files/${file.id}/content` } });
});

/**
 * Stream a file after a fresh permission check. The bucket stays private —
 * no public URLs are ever generated or stored.
 */
fileRoutes.get('/:id/content', async (c) => {
  const db = c.get('db');
  const env = c.get('env');
  const session = c.get('session');
  const id = c.req.param('id');

  const rows = await db.select().from(files).where(eq(files.id, id)).limit(1);
  const file = rows[0];
  if (!file) throw notFound('File not found.');
  if (!canAccessFile(file, session)) throw forbidden('You do not have access to this file.');

  const object = await env.FILES.get(file.key);
  if (!object) throw notFound('The stored file could not be retrieved.');

  const disposition = c.req.query('download') === '1' ? 'attachment' : 'inline';

  return new Response(object.body, {
    headers: {
      'Content-Type': file.mimeType,
      'Content-Length': String(object.size),
      'Content-Disposition': `${disposition}; filename="${file.name.replace(/"/g, '')}"`,
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});

/** Files owned by the caller. */
fileRoutes.get('/', async (c) => {
  const db = c.get('db');
  const session = c.get('session');
  const rows = await db
    .select()
    .from(files)
    .where(eq(files.ownerId, session.id))
    .orderBy(eq(files.createdAt, files.createdAt));
  return ok(c, { items: rows.map((f) => ({ ...f, url: `/api/files/${f.id}/content` })) });
});
