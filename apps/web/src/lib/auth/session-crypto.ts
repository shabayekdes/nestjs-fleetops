// Deliberately NOT `server-only`: Playwright (e2e/support/session.ts) imports
// this file to forge session cookies, and it depends only on node:crypto and
// zod. The rest of the session code (session.ts) is server-only.
import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto';
import { z } from 'zod';

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HKDF_INFO = 'fleetops-web/session/v1';

/** Name of the cookie; also used as AAD so a value cannot move to another cookie. */
export const SESSION_COOKIE = 'fleetops_session';

export type SessionPayload = { accessToken: string; expiresAt: number };

const payloadSchema = z.object({
  accessToken: z.string().min(1),
  expiresAt: z.number().finite(),
});

const keyCache = new Map<string, Buffer>();

function deriveKey(secret: string): Buffer {
  let key = keyCache.get(secret);
  if (!key) {
    key = Buffer.from(hkdfSync('sha256', secret, '', HKDF_INFO, 32));
    keyCache.set(secret, key);
  }
  return key;
}

export function encryptSession(
  payload: SessionPayload,
  secret: string,
): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, deriveKey(secret), iv);
  cipher.setAAD(Buffer.from(SESSION_COOKIE));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, ciphertext, tag]
    .map((part) =>
      typeof part === 'string' ? part : part.toString('base64url'),
    )
    .join('.');
}

const BASE64URL = /^[A-Za-z0-9_-]+$/;

/** Returns the payload, or null for any failure. Never throws. */
export function decryptSession(
  value: string,
  secret: string,
): SessionPayload | null {
  try {
    const parts = value.split('.');
    if (parts.length !== 4 || parts[0] !== VERSION) return null;
    if (!parts.slice(1).every((part) => BASE64URL.test(part))) return null;
    const iv = Buffer.from(parts[1], 'base64url');
    const ciphertext = Buffer.from(parts[2], 'base64url');
    const tag = Buffer.from(parts[3], 'base64url');
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) return null;

    const decipher = createDecipheriv(ALGORITHM, deriveKey(secret), iv);
    decipher.setAAD(Buffer.from(SESSION_COOKIE));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');

    const parsed = payloadSchema.safeParse(JSON.parse(plaintext));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
