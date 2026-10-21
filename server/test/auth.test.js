import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// auth.js keeps its state in the settings table and reads `config.deployed`;
// both are replaced with in-memory stand-ins so the tests never touch a
// database, the network or server/.env. The account layer (Phase 2) talks to the
// users/sessions/verifications tables and to email.js, so those get the same
// in-memory treatment.
const settings = new Map();
const users = new Map();
const sessions = new Map();
const verifications = new Map();
mock.module('../src/db.js', {
  namedExports: {
    getSetting: async (key) => settings.get(key) ?? null,
    setSetting: async (key, value) => { settings.set(key, value); },
    createUser: async ({ id, email, name, role, passwordHash }) => {
      const user = { id, email, name, role, password_hash: passwordHash, verified_at: null, generation_count: 0 };
      users.set(id, user);
      return user;
    },
    getUserByEmail: async (email) => [...users.values()].find((u) => u.email === email) ?? null,
    getUserById: async (id) => users.get(id) ?? null,
    updateUser: async (id, fields) => {
      const user = users.get(id);
      if (user) Object.assign(user, fields);
      return user ?? null;
    },
    countUsers: async () => users.size,
    createSessionRow: async ({ id, userId, expiresAt }) => { sessions.set(id, { id, user_id: userId, expires_at: expiresAt }); },
    getSessionUser: async (sessionId) => {
      const s = sessions.get(sessionId);
      if (!s || s.expires_at <= Date.now()) return null;
      const u = users.get(s.user_id);
      return u ? { session_id: s.id, ...u } : null;
    },
    deleteSessionRow: async (id) => { sessions.delete(id); },
    deleteSessionsForUser: async (userId) => {
      for (const [id, s] of sessions) if (s.user_id === userId) sessions.delete(id);
    },
    storeVerification: async ({ id, userId, kind, tokenHash, expiresAt }) => {
      verifications.set(tokenHash, { id, user_id: userId, kind, token_hash: tokenHash, expires_at: expiresAt });
    },
    consumeVerification: async (tokenHash, kind) => {
      const v = verifications.get(tokenHash);
      if (!v || v.kind !== kind || v.expires_at <= Date.now()) return null;
      verifications.delete(tokenHash);
      return v;
    },
  },
});
mock.module('../src/config.js', {
  namedExports: { config: { deployed: false, databaseUrl: '', inNetlify: false, mail: { apiKey: '' }, siteUrl: '' } },
});
mock.module('../src/email.js', {
  namedExports: {
    emailProblem: (email) => (String(email || '').includes('@') ? null : 'Enter a valid email address.'),
    sendVerification: async () => true,
    mailReady: () => false,
  },
});

const {
  passwordProblem,
  setPassword,
  passwordConfigured,
  verifyPassword,
  createSession,
  validSession,
  readSession,
  sessionCookie,
  noteFailure,
  lockedFor,
  clearFailures,
  signUp,
  signInAccount,
  resolveAccount,
  readAccount,
  accountCookie,
  verifyAccountToken,
  resetPassword,
  needsBootstrap,
} = await import('../src/auth.js');

test('passwordProblem enforces length bounds without touching anything', () => {
  assert.equal(passwordProblem(undefined), 'Enter a password.');
  assert.equal(passwordProblem('shorty7'), 'Use at least 8 characters.');
  assert.equal(passwordProblem('x'.repeat(401)), 'That password is too long (max 400 characters).');
  assert.equal(passwordProblem('good password'), null);
  assert.equal(passwordProblem('x'.repeat(8)), null);
});

test('setPassword stores a scrypt hash and verifyPassword accepts only the right password', async () => {
  assert.equal(await passwordConfigured(), false);
  await setPassword('correct horse battery');
  assert.equal(await passwordConfigured(), true);
  assert.match(settings.get('auth.password'), /^scrypt\$32768\$/);
  assert.ok(!settings.get('auth.password').includes('correct horse'));
  assert.equal(await verifyPassword('correct horse battery'), true);
  assert.equal(await verifyPassword('wrong battery horse'), false);
});

test('changing the password invalidates the signing secret and the lock', async () => {
  settings.clear();
  await setPassword('first password');
  const token = await createSession();
  assert.equal(await validSession(token), true);
  await setPassword('second password');
  assert.equal(await validSession(token), false, 'old sessions stop working after a password change');
});

test('createSession produces an HMAC-signed payload that validSession accepts or rejects', async () => {
  settings.clear();
  const token = await createSession();
  assert.equal(token.split('.').length, 2);
  assert.equal(await validSession(token), true);
  assert.equal(await validSession(`${token}x`), false);
  assert.equal(await validSession(''), false);
  assert.equal(await validSession('no-dot'), false);
  const [payload, sig] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ exp: Date.now() + 864e5 * 365, nonce: 'zz' })).toString('base64url');
  assert.equal(await validSession(`${forged}.${sig}`), false, 'payload cannot be swapped');
  assert.equal(await validSession(`${payload}.${sig.slice(0, -4)}xxxx`), false);
});

test('validSession honours the expiry inside the payload', async () => {
  settings.clear();
  const token = await createSession();
  const exp = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString()).exp;
  assert.ok(exp > Date.now(), 'a fresh session is 30 days out');
  const realNow = Date.now;
  Date.now = () => exp + 1000;
  try {
    assert.equal(await validSession(token), false, 'expired session is rejected');
  } finally {
    Date.now = realNow;
  }
});

test('validSession is false before any secret exists', async () => {
  settings.clear();
  assert.equal(await validSession('abc.def'), false);
});

test('verifyPassword without a stored password is false', async () => {
  settings.clear();
  assert.equal(await verifyPassword('anything'), false);
});

test('readSession pulls the token out of a cookie header', () => {
  assert.equal(readSession(undefined), null);
  assert.equal(readSession('other=1; listing_session=abc.def; x=y'), 'abc.def');
  assert.equal(readSession('listing_session=a%20b'), 'a b');
  assert.equal(readSession('nothing=here'), null);
});

test('sessionCookie is HttpOnly, pathed and carries the token and max-age', () => {
  const cookie = sessionCookie('tok.en', 3600);
  assert.match(cookie, /^listing_session=tok\.en; /);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Max-Age=3600/);
  assert.ok(!/Secure/.test(cookie), 'no Secure flag on local http');
});

test('failed logins lock the portal after five attempts and clear on success', async () => {
  settings.clear();
  assert.equal(await lockedFor(), 0);
  for (let i = 1; i <= 4; i += 1) assert.equal(await noteFailure(), 0, `attempt ${i} is free`);
  assert.equal(await noteFailure(), 60, 'fifth attempt locks for 60s');
  assert.ok(await lockedFor() > 0);
  await clearFailures();
  assert.equal(await lockedFor(), 0);
});

// --- Accounts (Phase 2) --------------------------------------------------

test('the first account is the admin, the next is a plain user', async () => {
  users.clear();
  assert.equal(await needsBootstrap(), true);
  const { user: first } = await signUp({ email: 'Owner@Example.com', password: 'correct horse battery', name: ' Owner ' });
  assert.equal(first.role, 'admin');
  assert.equal(first.email, 'owner@example.com'); // lowercased and trimmed
  assert.equal(first.name, 'Owner');
  const { user: second } = await signUp({ email: 'second@example.com', password: 'another good pass' });
  assert.equal(second.role, 'user');
  assert.equal(await needsBootstrap(), false);
});

test('sign up refuses a duplicate address and a short password', async () => {
  users.clear();
  await signUp({ email: 'dup@example.com', password: 'correct horse battery' });
  await assert.rejects(() => signUp({ email: 'dup@example.com', password: 'another good pass' }), /already has an account/);
  await assert.rejects(() => signUp({ email: 'new@example.com', password: 'short' }), /at least 8/);
});

test('an account session resolves to its user and rejects an unknown token', async () => {
  users.clear();
  sessions.clear();
  const { user, token } = await signUp({ email: 'session@example.com', password: 'correct horse battery' });
  const account = await resolveAccount(token);
  assert.equal(account.email, 'session@example.com');
  assert.equal(account.role, 'admin');
  assert.equal(user.email, 'session@example.com');
  assert.equal(await resolveAccount('not-a-session'), null);
});

test('signInAccount returns the same answer for an unknown email and a wrong password', async () => {
  users.clear();
  await signUp({ email: 'real@example.com', password: 'correct horse battery' });
  await assert.rejects(() => signInAccount({ email: 'ghost@example.com', password: 'correct horse battery' }), /Wrong email or password/);
  await assert.rejects(() => signInAccount({ email: 'real@example.com', password: 'wrong wrong wrong' }), /Wrong email or password/);
  const { user } = await signInAccount({ email: 'real@example.com', password: 'correct horse battery' });
  assert.equal(user.email, 'real@example.com');
});

test('verifyAccountToken rejects a token that was never issued', async () => {
  assert.equal(await verifyAccountToken('deadbeef'), false);
});

test('readAccount pulls the account cookie out of a header', () => {
  assert.equal(readAccount(undefined), null);
  assert.equal(readAccount('listing_session=legacy.token; listora_account=sess-id'), 'sess-id');
  assert.equal(readAccount('listora_account=a%20b'), 'a b');
  assert.equal(readAccount('nothing=here'), null);
});

test('accountCookie is HttpOnly, pathed and carries the token and max-age', () => {
  const cookie = accountCookie('sess.id', 60);
  assert.match(cookie, /^listora_account=sess\.id; /);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Max-Age=60/);
  assert.ok(!/Secure/.test(cookie), 'no Secure flag on local http');
});
