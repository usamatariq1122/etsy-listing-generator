import { deleteSetting, getSetting, setSetting } from './db.js';
import { currentUserId } from './requestContext.js';

// A setting can be global (shared with everyone and with the pre-account portal)
// or scoped to one account. Reads try the account's own value first, then fall
// back to the shared one, so a solo owner keeps using the key they saved before
// accounts existed and only a user who pastes their own value diverges. Writes
// land on the current account when there is one, otherwise the shared row.

const scopedKey = (base, userId) => (userId ? `user:${userId}:${base}` : base);

/**
 * { value, scope } for a base key, where scope is 'user' (this account's own),
 * 'shared' (the global value it falls back on), or null (nothing saved).
 */
export async function readScoped(base) {
  const userId = currentUserId();
  if (userId) {
    const own = await getSetting(scopedKey(base, userId));
    if (own != null) return { value: own, scope: 'user' };
  }
  const shared = await getSetting(base);
  return { value: shared, scope: shared != null ? 'shared' : null };
}

export async function readOwn(base) {
  const userId = currentUserId();
  if (!userId) return null;
  return getSetting(scopedKey(base, userId));
}

export async function writeScoped(base, value) {
  await setSetting(scopedKey(base, currentUserId()), value);
}

export async function clearScoped(base) {
  await deleteSetting(scopedKey(base, currentUserId()));
}
