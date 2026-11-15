/**
 * BRONEE HRMS — password hashing and token helpers.
 * PBKDF2-SHA256 through Web Crypto, so the identical implementation runs in
 * the browser (demo adapter) and inside Cloudflare Workers (production API).
 */

const PBKDF2_ITERATIONS = 100_000;
const KEY_LENGTH_BITS = 256;

const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function randomSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toBase64(bytes);
}

/** Hash a password into `pbkdf2$<iterations>$<salt>$<hash>` format. */
export async function hashPassword(password: string, salt?: string): Promise<string> {
  const usedSalt = salt ?? randomSalt();
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode(usedSalt),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    KEY_LENGTH_BITS,
  );
  return `pbkdf2$${PBKDF2_ITERATIONS}$${usedSalt}$${toBase64(new Uint8Array(bits))}`;
}

/** Constant-time-ish verification of a stored hash against a candidate password. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const [, iterations, salt, hash] = parts;
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
      iterations: Number(iterations),
      hash: 'SHA-256',
    },
    keyMaterial,
    KEY_LENGTH_BITS,
  );
  const candidate = new Uint8Array(bits);
  const expected = fromBase64(hash);
  if (candidate.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i += 1) diff |= candidate[i] ^ expected[i];
  return diff === 0;
}

/** URL-safe random token used for sessions, OTP codes and signed file URLs. */
export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return toBase64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Six digit OTP code. */
export function randomOtp(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(100000 + (buf[0] % 900000));
}
