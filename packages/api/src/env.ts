/**
 * Worker environment bindings.
 */
export interface Env {
  DB: D1Database;
  FILES: R2Bucket;

  APP_NAME: string;
  APP_URL: string;
  SIGNUP_EMAIL_DOMAIN: string;
  OFFICE_LATITUDE: string;
  OFFICE_LONGITUDE: string;
  OFFICE_GEOFENCE_METERS: string;
  MAX_GPS_ACCURACY_METERS: string;
  VERIFICATION_WINDOW_MINUTES: string;
  PRE_CLOCK_IN_MINUTES: string;
  EMAIL_PROVIDER: string;
  EMAIL_FROM: string;
  EMAIL_REPLY_TO: string;
  SESSION_COOKIE_NAME: string;
  SESSION_TTL_DAYS: string;
  TASK_SHEET_ID: string;
  HRMS_SHEET_ID: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL: string;
  GOOGLE_PRIVATE_KEY: string;

  /** Secrets (wrangler secret put) */
  SESSION_SECRET?: string;
  RESEND_API_KEY?: string;

  /** Local development only — set through `[dev.vars]`, never deployed. */
  CLIENT_IP_FALLBACK?: string;
  ENVIRONMENT?: string;
}

export const OFFICE_IP_ALLOWLIST = 'office.ip.allowlist';

export function getSessionSecret(env: Env): string {
  // A per-deploy fallback keeps local development frictionless; production
  // deployments MUST set SESSION_SECRET via `wrangler secret put`.
  return env.SESSION_SECRET || 'bronee-dev-secret-change-me-in-production';
}

export function officeConfig(env: Env) {
  return {
    latitude: Number(env.OFFICE_LATITUDE ?? '23.7809'),
    longitude: Number(env.OFFICE_LONGITUDE ?? '90.4125'),
    geofenceMeters: Number(env.OFFICE_GEOFENCE_METERS ?? '50'),
    maxAccuracyMeters: Number(env.MAX_GPS_ACCURACY_METERS ?? '100'),
  };
}

export function verificationWindowMinutes(env: Env): number {
  return Number(env.VERIFICATION_WINDOW_MINUTES ?? '1');
}

export function preClockInMinutes(env: Env): number {
  return Number(env.PRE_CLOCK_IN_MINUTES ?? '15');
}
