/**
 * BRONEE HRMS — API entry point.
 *
 * `VITE_API_MODE=local` (default) runs the complete in-browser implementation
 * seeded with real BRONEE data. `VITE_API_MODE=http` points the identical UI
 * at the Cloudflare Worker backed by D1.
 */

import type { ApiClient } from './contract';
import { createLocalAdapter } from './local';
import { createHttpAdapter } from './http';

const MODE = (import.meta.env.VITE_API_MODE as string | undefined) ?? 'local';

export const api: ApiClient = MODE === 'http' ? createHttpAdapter() : createLocalAdapter();

export const API_MODE = MODE;
export const IS_DEMO = MODE === 'local';

export type { ApiClient };
export * from './contract';
