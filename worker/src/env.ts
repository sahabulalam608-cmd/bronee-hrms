/**
 * BRONEE HRMS — Worker bindings.
 */

export interface Env {
  /** D1 primary database. */
  DB: D1Database;
  /** Private R2 bucket for uploaded files. */
  FILES: R2Bucket;
  /** Outbound email binding (Cloudflare Email Workers). */
  EMAIL?: { send: (message: unknown) => Promise<void> };
  /** HMAC secret for session tokens. */
  SESSION_SECRET: string;
  /** Display timezone. */
  TZ: string;
  /** Allowed browser origin for CORS. */
  APP_ORIGIN: string;
  /** Google service account credentials for Sheets sync (JSON string). */
  GOOGLE_SERVICE_ACCOUNT?: string;
  /** Google Sheets ids (defaults come from the shared registry). */
  TASK_SPREADSHEET_ID?: string;
  MAIN_SPREADSHEET_ID?: string;
}

export interface AuthContext {
  employeeId: string;
  role: string;
  email: string;
}
