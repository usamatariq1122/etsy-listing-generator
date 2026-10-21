import crypto from 'node:crypto';
import {
  consumeVerification,
  countUsers,
  createSessionRow,
  createUser,
  deleteSessionRow,
  deleteSessionsForUser,
  getSessionUser,
  getSetting,
  getUserByEmail,
  getUserById,
  setSetting,
  storeVerification,
  updateUser,
} from './db.js';
import { config } from './config.js';
import { emailProblem, mailReady, sendVerification } from './email.js';

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

/** Whether the portal must demand a signed-in session: a stored password, or a
 *  deploy on the open internet with no password yet. `netlify dev` and the
 *  standalone server stay open so local work needs no login. */
export async function portalLocked() {
  return (await passwordConfigured()) || config.deployed;
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
    // Only a deploy is served over https; `netlify dev` is plain http on
    // localhost, where a Secure cookie would never come back.
    config.deployed ? 'Secure' : null,
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

// --- Named accounts (Phase 2) -------------------------------------------
//
// One shared password becomes many accounts, each owning its listings, settings
// and files. Account sessions are opaque database rows under a separate cookie,
// so the legacy portal-password gate below stays exactly as it was. The first
// account to exist is the admin — and, on a deployed build with no portal
// password yet, the way in — which is what keeps a fresh deployment reachable
// without ever locking the owner out.

const ACCOUNT_COOKIE = 'listora_account';
const ACCOUNT_SESSION_DAYS = 30;
const VERIFY_DAYS = 3;

export const needsBootstrap = () => countUsers().then((n) => n === 0);

export async function signUp({ email, password, name }) {
  const problem = emailProblem(email);
  if (problem) throw accountError(problem, 400);
  const passwordIssue = passwordProblem(password);
  if (passwordIssue) throw accountError(passwordIssue, 400);
  const normalised = String(email).trim().toLowerCase();
  if (await getUserByEmail(normalised)) throw accountError('That email already has an account. Sign in instead.', 409);
  const id = crypto.randomUUID();
  const role = (await countUsers()) === 0 ? 'admin' : 'user';
  const user = await createUser({ id, email: normalised, name: String(name ?? '').trim() || null, passwordHash: await hashToStorage(password), role });
  await issueVerification(id, 'verify');
  const { token, expiresAt } = await createAccountSession(id);
  return { user, token, expiresAt };
}

export async function signInAccount({ email, password }) {
  const user = await getUserByEmail(String(email ?? '').trim().toLowerCase());
  // The same reply whether the address is unknown or the password is wrong, so
  // the screen cannot be used to list who has an account.
  if (!user || !(await matchesPassword(password, user.password_hash))) {
    throw accountError('Wrong email or password.', 401);
  }
  const { token, expiresAt } = await createAccountSession(user.id);
  return { user, token, expiresAt };
}

export async function signOutAccount(token) {
  const session = await getSessionUser(token);
  if (session?.session_id) await deleteSessionRow(session.session_id);
}

export const resolveAccount = (token) => getSessionUser(token);

export function readAccount(cookieHeader) {
  if (!cookieHeader) return null;
  for (const part of String(cookieHeader).split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === ACCOUNT_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return null;
}

/** HttpOnly like the portal cookie; SameSite=Lax so it rides on the account's own
 *  navigations (including the verification link) but not on cross-site posts. */
export function accountCookie(token, maxAgeSeconds = ACCOUNT_SESSION_DAYS * 86400) {
  return [
    `${ACCOUNT_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    config.deployed ? 'Secure' : null,
    `Max-Age=${maxAgeSeconds}`,
  ]
    .filter(Boolean)
    .join('; ');
}

export async function verifyAccountToken(token) {
  if (!token) return false;
  const record = await consumeVerification(sha256(token), 'verify');
  if (!record) return false;
  await updateUser(record.user_id, { verified_at: new Date().toISOString() });
  return true;
}

/** Starts a password reset. The token is always minted, so the flow works even
 *  where no mail is configured: on a local build the caller gets the token back
 *  and can open the link directly. On a deployed build a token with no mailbox
 *  to send it to is useless, so the caller only reports what the user was told —
 *  and never receives a live reset token. An unknown address simply yields
 *  nothing to send, and the caller answers the same either way. */
export async function issueReset(email) {
  const user = await getUserByEmail(String(email ?? '').trim().toLowerCase());
  if (!user) return { sent: false, token: null };
  const token = await mintVerification(user.id, 'reset');
  if (mailReady()) {
    await sendVerification(user.email, token, 'reset');
    return { sent: true, token: null };
  }
  // No mailbox. A local build can hand the link straight to the person using it.
  if (!config.deployed) return { sent: false, token };
  return { sent: false, token: null };
}

/** Consumes a reset token and installs a new password. Needs the address the link
 *  was sent to as well, so a leaked token alone is not enough to take a
 *  password, and every old session is dropped once it is used. */
export async function resetPassword({ email, token, password }) {
  const user = await getUserByEmail(String(email ?? '').trim().toLowerCase());
  if (!user) throw accountError('That reset link is no longer valid.', 400);
  const problem = passwordProblem(password);
  if (problem) throw accountError(problem, 400);
  const record = await consumeVerification(sha256(token), 'reset');
  if (!record || record.user_id !== user.id) throw accountError('That reset link is no longer valid.', 400);
  await updateUser(user.id, { password_hash: await hashToStorage(password) });
  await deleteSessionsForUser(user.id);
  return true;
}

async function issueVerification(userId, kind) {
  // With no mail configured there is nothing to deliver, so no token is minted
  // and no row is left sitting undeliverable in the table.
  if (!mailReady()) return null;
  const token = await mintVerification(userId, kind);
  const user = await getUserById(userId);
  if (user) await sendVerification(user.email, token, kind);
  return token;
}

/** Mints a single-use token, stores only its hash, and returns the plaintext for
 *  delivery. Shared by the emailed verification and the local reset link. */
async function mintVerification(userId, kind) {
  const token = crypto.randomBytes(32).toString('hex');
  await storeVerification({
    id: crypto.randomUUID(),
    userId,
    kind,
    tokenHash: sha256(token),
    expiresAt: Date.now() + VERIFY_DAYS * 864e5,
  });
  return token;
}

function accountError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

async function hashToStorage(password) {
  const cost = 2 ** 15;
  const salt = crypto.randomBytes(16);
  const digest = await hash(password, salt, cost);
  return `scrypt$${cost}$${b64(salt)}$${b64(digest)}`;
}

async function matchesPassword(password, stored) {
  if (!stored) return false;
  const [, cost, salt, digest] = String(stored).split('$');
  if (!salt || !digest) return false;
  const candidate = await hash(password, Buffer.from(salt, 'base64url'), Number(cost));
  return crypto.timingSafeEqual(candidate, Buffer.from(digest, 'base64url'));
}

async function createAccountSession(userId) {
  const id = crypto.randomUUID();
  const expiresAt = Date.now() + ACCOUNT_SESSION_DAYS * 864e5;
  await createSessionRow({ id, userId, expiresAt });
  return { token: id, expiresAt };
}
