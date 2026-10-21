import crypto from 'node:crypto';
import { config } from './config.js';
import { deleteSetting, getSetting, setSetting } from './db.js';
import { decryptSecret, encryptSecret } from './secrets.js';
import { HttpError } from './httperror.js';

// Etsy Open API v3, for the seller's own shop: putting a finished listing package
// in as a DRAFT, and — only when the seller presses Publish — making that draft
// live. Publishing sends `state: active`, which is a normal `listings_w` update.
// What this file still cannot do is delete: `listings_d` is never requested, so no
// code path here can take a listing down. That half of the guardrail stays.
//
// The tokens are the seller's own shop access, so they are stored in the
// settings table encrypted with the same envelope as the API keys
// (see secrets.js) and are never returned to the browser or written to a log.

// Both hosts serve the same API - `openapi.etsy.com` is the one the OpenAPI spec
// declares, `api.etsy.com` is the one Etsy's own examples use, including for the
// token endpoint - so the documented example host is what this calls.
const BASE = 'https://api.etsy.com';
const AUTHORIZE = 'https://www.etsy.com/oauth/connect';
const TOKEN_PATH = '/v3/public/oauth/token';
const SCOPES = ['listings_w'];

// A token is good for an hour. Refreshing a minute early means a slow request
// still has a live token when it reaches Etsy.
const REFRESH_EARLY_MS = 60_000;

const keys = {
  pending: 'etsy.pending',
  access: 'etsy.access_token',
  refresh: 'etsy.refresh_token',
  expires: 'etsy.expires_at',
  userId: 'etsy.user_id',
  shopId: 'etsy.shop_id',
  shopName: 'etsy.shop_name',
};

/** Credentials present *and* the flag on. Off, the UI shows nothing of this. */
export function etsyReady() {
  const { enabled, keystring, sharedSecret } = config.etsy;
  return Boolean(enabled && keystring && sharedSecret);
}

function requireCredentials() {
  if (etsyReady()) return;
  throw new HttpError(
    'Etsy is not switched on. Set ETSY_ENABLED, ETSY_KEYSTRING and ETSY_SHARED_SECRET, then restart.',
    503,
  );
}

const read = async (key) => decryptSecret(await getSetting(key));

/** The numeric user id Etsy puts in front of the access token. */
const tokenUserId = (token) => String(token).split('.')[0];

function pkcePair() {
  // 43-128 characters of the unreserved set; base64url of 32 bytes is 43.
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

/** Starts the flow: a random state tied to a one-use PKCE verifier, both kept
 *  for the few minutes between the redirect and the callback. */
export async function authorizeUrl() {
  requireCredentials();
  if (!config.etsy.redirectUri) {
    throw new HttpError('Set ETSY_REDIRECT_URI to the exact callback URL registered for the app.', 503);
  }
  const { verifier, challenge } = pkcePair();
  const state = crypto.randomBytes(16).toString('base64url');
  await setSetting(keys.pending, encryptSecret(JSON.stringify({ state, verifier, at: Date.now() })));

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.etsy.keystring,
    redirect_uri: config.etsy.redirectUri,
    scope: SCOPES.join(' '),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return `${AUTHORIZE}?${params}`;
}

/** Trades the code for tokens. Called once, by the callback route. */
export async function completeConnect({ code, state }) {
  requireCredentials();
  const pending = await read(keys.pending);
  await deleteSetting(keys.pending);
  if (!pending) throw new HttpError('That sign-in request has already been used. Start again.', 400);
  const saved = JSON.parse(pending);
  if (!state || state !== saved.state) throw new HttpError('Etsy sent back a different request. Try connecting again.', 400);
  if (Date.now() - Number(saved.at) > 10 * 60_000) throw new HttpError('That sign-in request expired. Start again.', 400);

  const tokens = await postToken({
    grant_type: 'authorization_code',
    client_id: config.etsy.keystring,
    code,
    code_verifier: saved.verifier,
    redirect_uri: config.etsy.redirectUri,
  });
  await storeTokens(tokens);
  await linkShop(tokens.access_token);
  return connection();
}

async function postToken(form) {
  const response = await fetch(`${BASE}${TOKEN_PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-api-key': apiKeyHeader() },
    body: new URLSearchParams(form),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new HttpError(plainError(response.status, payload, 'Etsy refused to connect the shop.'), 502);
  }
  return payload;
}

async function storeTokens(tokens) {
  await setSetting(keys.access, encryptSecret(tokens.access_token));
  if (tokens.refresh_token) await setSetting(keys.refresh, encryptSecret(tokens.refresh_token));
  await setSetting(keys.expires, String(Date.now() + Number(tokens.expires_in || 3600) * 1000));
}

/** A Bearer token that is definitely still valid, refreshing the stored one if
 *  it is close to expiry. The old refresh token is replaced only when Etsy
 *  hands back a new one. */
export async function accessToken() {
  requireCredentials();
  const [token, expires, refresh] = await Promise.all([read(keys.access), getSetting(keys.expires), read(keys.refresh)]);
  if (!token) throw new HttpError('Connect your Etsy shop first.', 401);
  if (Date.now() < Number(expires || 0) - REFRESH_EARLY_MS) return token;
  if (!refresh) throw new HttpError('Connect your Etsy shop again — the saved sign-in can no longer be renewed.', 401);

  const fresh = await postToken({
    grant_type: 'refresh_token',
    client_id: config.etsy.keystring,
    refresh_token: refresh,
  });
  await storeTokens(fresh);
  return fresh.access_token;
}

const apiKeyHeader = () => `${config.etsy.keystring}:${config.etsy.sharedSecret}`;

/**
 * One call to Etsy with the key header and, when asked for, the seller's token.
 * Returns the parsed body; anything other than 2xx becomes a sentence the seller
 * can act on, with no token and no raw response in it.
 */
async function call(path, { method = 'GET', params, form, body, auth = true } = {}) {
  const url = new URL(`${BASE}${path}`);
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  const headers = { 'x-api-key': apiKeyHeader(), accept: 'application/json' };
  if (auth) headers.authorization = `Bearer ${await accessToken()}`;
  if (form) headers['content-type'] = 'application/x-www-form-urlencoded';

  const response = await fetch(url, {
    method,
    headers,
    body: form ? new URLSearchParams(form) : body ?? undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new HttpError(plainError(response.status, payload), 502);
  return payload;
}

// The seller taxonomy, the shop record and nothing else is public. Kept separate
// so an unauthenticated call can never pick up a token by accident.
export const publicCall = (path, params) => call(path, { params, auth: false });

export async function createDraftListing(shopId, fields) {
  // The listing is created as a draft: `state` is left out, so it stays private
  // until the seller publishes it — either in Etsy, or through the Publish action
  // below. A draft is the safe default; nothing is made live by accident.
  return call(`/v3/application/shops/${shopId}/listings`, {
    method: 'POST',
    form: formFields(fields),
  });
}

export const updateListing = (shopId, listingId, fields) =>
  call(`/v3/application/shops/${shopId}/listings/${listingId}`, {
    method: 'PATCH',
    form: formFields(fields),
  });

/** Makes an existing draft live. Only ever reached from the seller pressing
 *  Publish; the draft path never sends this on its own. */
export const publishListing = (shopId, listingId) =>
  updateListing(shopId, listingId, { state: 'active' });

export const getListing = (listingId, includes) =>
  call(`/v3/application/listings/${listingId}`, { params: { includes } });

/** Etsy caps the file name shown to the buyer at 50 characters and takes the
 *  bytes as multipart, same as an HTML form upload. */
export function uploadListingImage(shopId, listingId, { bytes, name, type, rank, altText }) {
  const form = new FormData();
  form.append('image', new Blob([bytes], { type: type || 'image/png' }), name);
  form.append('rank', String(rank));
  // The same slot is uploaded again after a replace, so the old copy has to go.
  form.append('overwrite', 'true');
  if (altText) form.append('alt_text', String(altText).slice(0, 500));
  return call(`/v3/application/shops/${shopId}/listings/${listingId}/images`, { method: 'POST', body: form });
}

export function uploadListingFile(shopId, listingId, { bytes, name, rank }) {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'application/pdf' }), name);
  form.append('name', name.slice(0, 50));
  form.append('rank', String(rank));
  return call(`/v3/application/shops/${shopId}/listings/${listingId}/files`, { method: 'POST', body: form });
}

/** Which shop this connection controls. Etsy only ever gives the user id from
 *  the code exchange, and a user can have more than one shop, so more than one
 *  match is refused rather than guessed at. */
async function linkShop(token) {
  const userId = tokenUserId(token.access_token);
  await setSetting(keys.userId, userId);
  const shops = await call(`/v3/application/users/${userId}/shops`, { auth: false });
  const list = Array.isArray(shops) ? shops : shops?.results ?? [];
  if (!list.length) throw new HttpError('Etsy found no shop for this account. Open your shop once on etsy.com, then connect again.', 502);
  if (list.length > 1) throw new HttpError('This Etsy account has more than one shop, so the portal cannot choose one. Ask for a connection to a single shop.', 502);
  await setSetting(keys.shopId, String(list[0].shop_id));
  await setSetting(keys.shopName, String(list[0].shop_name || ''));
}

/** What the interface is allowed to know: that a shop is connected, and its name. */
export async function connection() {
  // `enabled` is the only thing the interface asks about when nothing is
  // connected, so it has to answer truthfully without pulling the switch on.
  if (!etsyReady()) return { enabled: false, connected: false, shopName: null };
  const [shopIdValue, shopName] = await Promise.all([getSetting(keys.shopId), getSetting(keys.shopName)]);
  const token = await getSetting(keys.access);
  return { enabled: true, connected: Boolean(shopIdValue && token), shopName: shopName || null };
}

export async function shopId() {
  const id = await getSetting(keys.shopId);
  if (!id) throw new HttpError('Connect your Etsy shop first.', 401);
  return id;
}

export async function disconnect() {
  await Promise.all([keys.access, keys.refresh, keys.expires, keys.userId, keys.shopId, keys.shopName, keys.pending]
    .map((key) => deleteSetting(key)));
  return connection();
}

const formFields = (fields) =>
  Object.fromEntries(
    Object.entries(fields)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      // Etsy takes these lists as one comma-separated string, so the intent is
      // written out rather than left to how a URLSearchParams happens to
      // stringify an array.
      .map(([key, value]) => [key, Array.isArray(value) ? value.join(',') : String(value)]),
  );

// Etsy's own error strings are developer-facing, so they get a short translation
// layer for the ones that actually happen, and the rest are passed through
// trimmed. Never include the request, which carries the token.
function plainError(status, payload, fallback = 'Etsy refused that request.') {
  const said = [payload?.errors, payload?.error].flat(2).filter(Boolean).map(String).join(' ');
  if (status === 401) return 'Etsy no longer recognises this connection. Connect your shop again.';
  if (status === 403) {
    return 'Etsy would not allow that. Your app key has to be approved by Etsy and given the listings permission.';
  }
  if (status === 429) return 'Etsy is limiting requests right now. Wait a minute and try again.';
  if (status === 404) return 'Etsy could not find that shop or listing.';
  if (said) return `${fallback} Etsy said: ${said.slice(0, 300)}`;
  return `${fallback} (HTTP ${status})`;
}
