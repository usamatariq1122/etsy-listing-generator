import crypto from 'node:crypto';
import { getSetting, setSetting } from './db.js';
import { onNetlify } from './files.js';

// One password, stored as a salted scrypt hash in the settings table, guards
// every endpoint. The portal spends your model quota, so a hosted
// build must never be reachable by whoever finds the URL.

const PASSWORD = 'auth.password';
const SECRET = 'auth.secret';
const LOCK = 'auth.lock';

const MIN_LENGTH = 8;
const MAX_LENGTH = 400;
const SESSION_DAYS = 30;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 32;
const MAX_ATTEMPTS = 5;
const LOCK_SECONDS = 60;

const b64 = (value) => Buffer.from(value).toString('base64url');

const hash = (password, salt, cost) =>
  new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT_KEYLEN, { N: cost, r: SCRYPT_R, p: SCRYPT_P, maxmem: 256 * 1024 * 1024 }, (error, out) =>
      error ? reject(error) : resolve(out),
    );
  });

export function passwordProblem(password) {
  if (typeof password !== 'string') return 'Enter a password.';
  if (password.length < MIN_LENGTH) return `Use at least ${MIN_LENGTH} characters.`;
  if (password.length > MAX_LENGTH) return `That password is too long (max ${MAX_LENGTH} characters).`;
  return null;
}

/** Hashes and stores the password, and replaces the signing key so every
 *  session issued for the old password stops working. */
export async function setPassword(password) {
  const cost = 2 ** 15;
  const salt = crypto.randomBytes(16);
  const digest = await hash(password, salt, cost);
  await setSetting(PASSWORD, `scrypt$${cost}$${b64(salt)}$${b64(digest)}`);
  const secret = crypto.randomBytes(32).toString('hex');
  await setSetting(SECRET, secret);
  await setSetting(LOCK, '');
  return secret;
}

export async function passwordConfigured() {
  return Boolean(await getSetting(PASSWORD));
}

export async function verifyPassword(password) {
  const stored = await getSetting(PASSWORD);
  if (!stored) return false;
  const [, cost, salt, digest] = stored.split('$');
  if (!salt || !digest) return false;
  const candidate = await hash(password, Buffer.from(salt, 'base64url'), Number(cost));
  return crypto.timingSafeEqual(candidate, Buffer.from(digest, 'base64url'));
}

async function signingSecret() {
  const saved = await getSetting(SECRET);
  if (saved) return saved;
  const secret = crypto.randomBytes(32).toString('hex');
  await setSetting(SECRET, secret);
  return secret;
}

export async function createSession() {
  const secret = await signingSecret();
  const payload = b64(JSON.stringify({ exp: Date.now() + SESSION_DAYS * 864e5, nonce: crypto.randomBytes(8).toString('hex') }));
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export async function validSession(token) {
  if (!token || !token.includes('.')) return false;
  const secret = await getSetting(SECRET);
  if (!secret) return false;
  const [payload, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  const a = Buffer.from(sig ?? '');
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > Date.now();
  } catch {
    return false;
  }
}

const COOKIE = 'listing_session';

export function readSession(cookieHeader) {
  if (!cookieHeader) return null;
  for (const part of String(cookieHeader).split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE) return decodeURIComponent(rest.join('='));
  }
  return null;
}

/** HttpOnly, so the token is never readable from page script; SameSite=Lax
 *  keeps it off cross-site POSTs while still sending it with your own requests. */
export function sessionCookie(token, maxAgeSeconds = SESSION_DAYS * 86400) {
  return [
    `${COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    onNetlify() ? 'Secure' : null,
    `Max-Age=${maxAgeSeconds}`,
  ]
    .filter(Boolean)
    .join('; ');
}

export async function lockedFor() {
  const raw = await getSetting(LOCK);
  if (!raw) return 0;
  try {
    const lock = JSON.parse(raw);
    return lock.until > Date.now() ? Math.ceil((lock.until - Date.now()) / 1000) : 0;
  } catch {
    return 0;
  }
}

async function attempts() {
  const raw = await getSetting(LOCK);
  try {
    return JSON.parse(raw)?.count ?? 0;
  } catch {
    return 0;
  }
}

export async function noteFailure() {
  const count = (await attempts()) + 1;
  await setSetting(LOCK, JSON.stringify({ count, until: count >= MAX_ATTEMPTS ? Date.now() + LOCK_SECONDS * 1000 : 0 }));
  return count >= MAX_ATTEMPTS ? LOCK_SECONDS : 0;
}

export async function clearFailures() {
  await setSetting(LOCK, '');
}
