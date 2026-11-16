/**
 * BRONEE HRMS — Google Drive integration for the profile photo.
 *
 * A profile photo is stored in the company Drive, not in the browser and not
 * in a public bucket. Only the Drive file id is kept in D1.
 *
 * When a new photo is uploaded the previous one is removed from the drive,
 * so the drive never keeps an old copy of an employee picture.
 *
 * Auth uses the same Google service account as the Sheets integration
 * (JWT bearer flow), so no user session token is ever stored.
 */

import type { Env } from '../env';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
const FILES_URL = 'https://www.googleapis.com/drive/v3/files';

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64ToBytes(value: string): Uint8Array {
  const normalized = value.replace(/\n/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function accessToken(env: Env): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  if (!env.GOOGLE_SERVICE_ACCOUNT) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT is not configured. The drive upload is disabled.');
  }

  const account = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT) as ServiceAccount;
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64Url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claim = base64Url(
    new TextEncoder().encode(
      JSON.stringify({
        iss: account.client_email,
        scope: DRIVE_SCOPE,
        aud: account.token_uri ?? 'https://oauth2.googleapis.com/token',
        iat: issuedAt,
        exp: issuedAt + 3600,
      }),
    ),
  );

  const pkcs8 = base64ToBytes(account.private_key);
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pkcs8,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(`${header}.${claim}`),
  );

  const response = await fetch(account.token_uri ?? 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claim}.${base64Url(new Uint8Array(signature))}`,
    }),
  });
  if (!response.ok) throw new Error(`Google token request failed: ${response.status}`);
  const json = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

/**
 * Uploads a profile photo and returns the Drive file id.
 * The file lands in the folder configured by `GOOGLE_DRIVE_FOLDER_ID`.
 */
export async function uploadProfilePhoto(
  env: Env,
  input: { fileName: string; contentType: string; data: string },
): Promise<string> {
  const token = await accessToken(env);
  const metadata: Record<string, unknown> = {
    name: input.fileName,
    mimeType: input.contentType,
  };
  if (env.GOOGLE_DRIVE_FOLDER_ID) metadata.parents = [env.GOOGLE_DRIVE_FOLDER_ID];

  const boundary = 'bronee-profile-photo';
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\nContent-Type: ${input.contentType}\r\n\r\n`,
    base64ToBytes(input.data),
    `\r\n--${boundary}--`,
  ]);

  const response = await fetch(UPLOAD_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!response.ok) {
    throw new Error(`Google drive upload failed: ${response.status}`);
  }
  const json = (await response.json()) as { id?: string };
  if (!json.id) throw new Error('Google drive upload returned no file id.');
  return json.id;
}

/** Removes a file from the drive. */
export async function deleteDriveFile(env: Env, fileId: string): Promise<void> {
  const token = await accessToken(env);
  await fetch(`${FILES_URL}/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

/** Reads a file from the drive. */
export async function readDriveFile(
  env: Env,
  fileId: string,
): Promise<{ contentType: string; data: Uint8Array } | null> {
  const token = await accessToken(env);
  const meta = await fetch(`${FILES_URL}/${fileId}?fields=mimeType,name`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!meta.ok) return null;
  const info = (await meta.json()) as { mimeType?: string };

  const content = await fetch(`${FILES_URL}/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!content.ok) return null;
  const data = new Uint8Array(await content.arrayBuffer());
  return { contentType: info.mimeType ?? 'image/jpeg', data };
}
