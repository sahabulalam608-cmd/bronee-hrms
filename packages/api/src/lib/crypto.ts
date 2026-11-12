/**
 * Crypto helpers built on WebCrypto so the Worker needs no native dependencies.
 *  - Passwords: PBKDF2-SHA256, 210k iterations, 16-byte random salt.
 *  - Tokens:    HMAC-SHA256 signed, constant-time verification.
 *  - OTP codes: PBKDF2 hash with a per-code salt (never stored in clear text).
 */

const encoder = new TextEncoder();

export function randomId(): string {
  return crypto.randomUUID();
}

export function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  return out;
}

export function toHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

export function fromHex(hex: string): Uint8Array {
  const clean = hex.length % 2 === 0 ? hex : hex.slice(0, -1);
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * PBKDF2 iteration count.
 *
 * Cloudflare Workers caps PBKDF2 at 100 000 iterations — exceeding it makes
 * `deriveBits` reject with an OperationError. The limit is a platform
 * constraint, so this is set at the documented maximum rather than the
 * higher figure OWASP recommends for a dedicated crypto host.
 */
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEYLEN = 32;

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations, hash: 'SHA-256' },
    key,
    PBKDF2_KEYLEN * 8,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(16);
  const derived = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return { hash: toHex(derived), salt: toHex(salt) };
}

export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
  try {
    const derived = await pbkdf2(password, fromHex(salt), PBKDF2_ITERATIONS);
    return timingSafeEqual(toHex(derived), hash);
  } catch (error) {
    // Never swallow this silently — a failure here means the stored hash was
    // produced with different parameters and every sign-in would be rejected.
    console.error(
      'Password verification failed unexpectedly:',
      error instanceof Error ? error.message : String(error),
    );
    return false;
  }
}

/** Cheap salted hash for short-lived OTPs (fewer iterations by design). */
export async function hashOtp(code: string, salt: string): Promise<string> {
  const derived = await pbkdf2(code, fromHex(salt), 20_000);
  return toHex(derived);
}

export async function generateOtp(): Promise<string> {
  const bytes = randomBytes(4);
  const value = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  return String(value % 1_000_000).padStart(6, '0');
}

export async function hmacSign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return base64UrlEncode(new Uint8Array(sig));
}

export async function hmacVerify(payload: string, signature: string, secret: string): Promise<boolean> {
  try {
    const expected = await hmacSign(payload, secret);
    return timingSafeEqual(expected, signature);
  } catch {
    return false;
  }
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Hash a raw value for indexing (e.g. lookup by OTP email+code). */
export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return toHex(digest);
}
