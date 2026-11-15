/**
 * BRONEE HRMS — local dataset store.
 *
 * The demo adapter persists the seeded dataset in localStorage so the app
 * behaves like a real system across reloads. All mutations go through
 * `mutate()`, which keeps the store and the UI in sync.
 */

import type { DbShape } from './db-types';
import { buildSeedDb } from '@/data/seed';

const DB_KEY = 'bronee.hrms.db.v1';
const SESSION_KEY = 'bronee.hrms.session';

let cache: DbShape | null = null;

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadDb(): DbShape {
  if (cache) return cache;
  const stored = safeParse<DbShape | null>(localStorage.getItem(DB_KEY), null);
  if (stored && Array.isArray(stored.employees) && stored.employees.length) {
    cache = stored;
    return cache;
  }
  cache = buildSeedDb();
  saveDb(cache);
  return cache;
}

export function saveDb(db: DbShape): void {
  cache = db;
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    // Storage full or unavailable — the in-memory cache still works for this session.
  }
}

/** Apply a mutation and persist the result. */
export function mutate<T>(fn: (db: DbShape) => T): T {
  const db = loadDb();
  const result = fn(db);
  saveDb(db);
  return result;
}

/** Rebuild the dataset from scratch (used by the "reset demo data" action). */
export function resetDb(): DbShape {
  cache = buildSeedDb();
  saveDb(cache);
  return cache;
}

export function getSessionToken(): string | null {
  return localStorage.getItem(SESSION_KEY);
}

export function setSessionToken(token: string | null): void {
  if (token) localStorage.setItem(SESSION_KEY, token);
  else localStorage.removeItem(SESSION_KEY);
}
