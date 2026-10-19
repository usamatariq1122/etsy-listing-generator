import crypto from 'node:crypto';
import { config } from './config.js';
import { listSettings, setSetting } from './db.js';

// API keys saved through Settings live in the settings table, so they are
// encrypted at rest with AES-256-GCM. The key comes from the ENCRYPTION_KEY
// environment variable and is never stored next to the data it protects.
//
// A stored value carries a version tag, which makes the format self-describing:
//   v1:<iv>.<tag>.<cipher>        encrypted
//   anything else                 written before encryption existed
// Old rows keep working until they are rewritten, so setting ENCRYPTION_KEY
// later never locks anyone out of a portal that was already running.

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';

const isEncrypted = (value) => String(value ?? '').startsWith(`${VERSION}:`);

/** 64 hex digits are used as-is; any other phrase is stretched into 32 bytes. */
function cipherKey() {
  const raw = String(config.encryptionKey ?? '').trim();
  if (!raw) return null;
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');
  return crypto.scryptSync(raw, 'digital-listing-studio', 32);
}

function noKey() {
  const err = new Error(
    'Saved API keys are encrypted and ENCRYPTION_KEY is not set. Run `node -e "console.log(require(\"crypto\").randomBytes(32).toString(\"hex\"))\"`, put the result in server/.env locally and in Netlify site secrets, then redeploy.',
  );
  err.status = 503;
  err.code = 'missing_encryption_key';
  throw err;
}

/** The ciphertext envelope for a key. Refuses to write a key in the clear. */
export function encryptSecret(plaintext) {
  const key = cipherKey();
  if (!key) noKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const cipherText = Buffer.concat([cipher.update(String(plaintext ?? ''), 'utf8'), cipher.final()]);
  return `${VERSION}:${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${cipherText.toString('base64url')}`;
}

/** The key back again. Values written before encryption existed pass through. */
export function decryptSecret(stored) {
  if (stored == null) return stored;
  if (!isEncrypted(stored)) return stored;
  const key = cipherKey();
  if (!key) noKey();
  const [iv, tag, cipherText] = String(stored).slice(VERSION.length + 1).split('.');
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(cipherText, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    // A wrong ENCRYPTION_KEY looks identical to tampered data, so it is reported
    // as the one thing the owner can actually fix.
    noKey();
  }
}

/**
 * Rewrites any stored keys that are still plaintext. Runs on every cold start,
 * so turning on encryption needs no manual step: set ENCRYPTION_KEY, redeploy,
 * and the next request seals what is on file.
 */
export async function encryptStoredKeys(prefix = 'api_key.') {
  if (!cipherKey()) return 0;
  const rows = await listSettings(prefix);
  const plain = rows.filter((row) => !isEncrypted(row.setting_value));
  await Promise.all(
    plain.map((row) => setSetting(row.setting_key, encryptSecret(row.setting_value))),
  );
  return plain.length;
}
