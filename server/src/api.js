import crypto from 'node:crypto';
import {
  clearProducts,
  createProduct,
  deleteProduct,
  getProduct,
  listProductImages,
  listProducts,
  updateProduct,
} from './db.js';
import { IMAGE_RULES } from './rules.js';
import { SLOTS, getSlot } from './slots.js';
import { dropImage, resolveImage, storeImage } from './uploads.js';
import { isSafeId, zipKey } from './paths.js';
import { contentTypeFor, deleteFile, deletePrefix, getFile, onNetlify } from './files.js';
import { TEXT_FILES } from './documents.js';
import { buildZip, documentBytes } from './zip.js';
import { startGeneration } from './generate.js';
import { keyCoverage, keyIssues, keyStatus, removeKey, removeModel, saveKey, saveModel } from './apikeys.js';
import { brandIssues, clearBrand, saveBrand } from './brand.js';
import { clearPrompt, promptIssues, promptSettings, savePrompt } from './content.js';
import {
  clearFailures,
  createSession,
  lockedFor,
  noteFailure,
  passwordConfigured,
  passwordProblem,
  readSession,
  sessionCookie,
  setPassword,
  validSession,
  verifyPassword,
} from './auth.js';

// One router, two runtimes: the local node:http server and a Netlify Function
// both hand it the same plain request shape and get the same plain response.

const json = (body, status = 200) => ({
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body),
});

const download = (bytes, contentType, filename) => ({
  status: 200,
  headers: {
    'content-type': contentType,
    'content-disposition': `attachment; filename="${filename}"`,
    'cache-control': 'no-store',
  },
  body: bytes,
});

const inline = (bytes, contentType) => ({
  status: 200,
  headers: { 'content-type': contentType, 'cache-control': 'no-store' },
  body: bytes,
});

class HttpError extends Error {
  constructor(message, status = 400, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

// A function invocation accepts about 6 MB, so a hosted build caps uploads
// below the 25 MB the desktop version will happily take from disk.
const maxUploadBytes = () => Math.min(IMAGE_RULES.maxBytes, onNetlify() ? 4 * 1024 * 1024 : IMAGE_RULES.maxBytes);

async function loadProduct(params) {
  const { id } = params;
  if (!isSafeId(id)) throw new HttpError('Invalid product id.');
  const product = await getProduct(id);
  if (!product) throw new HttpError('That product no longer exists. Start a new listing.', 404);
  return product;
}

function requireSlot(params) {
  const slot = getSlot(params.slotId);
  if (!slot) throw new HttpError('Unknown image slot.', 404);
  return slot;
}

/** A ZIP is only valid while its images are, so changing one removes the package. */
async function invalidatePackage(productId) {
  await updateProduct(productId, { zip_name: null, status: 'text' });
  await deleteFile(zipKey(productId));
}

async function publicView(product) {
  const images = await listProductImages(product.id);
  return {
    id: product.id,
    productName: product.product_name,
    status: product.status,
    file1Text: product.file1_text || '',
    file2Text: product.file2_text || '',
    mockupPrompts: product.mockup_prompts || [],
    infographicPrompts: product.infographic_prompts || [],
    slots: SLOTS,
    rules: { ...IMAGE_RULES, maxBytes: maxUploadBytes() },
    images: images.map((image) => ({
      slotId: image.slot_id,
      fileName: image.file_name,
      width: image.width,
      height: image.height,
      format: image.format,
      bytes: image.bytes,
      uploadedAt: image.uploaded_at,
      previewUrl: `/api/products/${product.id}/image/${image.slot_id}`,
    })),
    zipReady: Boolean(product.zip_name),
    downloadUrl: product.zip_name ? `/api/products/${product.id}/download` : null,
    warnings: product.warnings || {},
    textFiles: TEXT_FILES.map((file) => ({ key: file.key, name: file.name })),
    createdAt: product.created_at,
    updatedAt: product.updated_at,
  };
}

/** Waits for a generation to settle, then describes it the way the old single
 *  request used to, so nothing else has to learn a new shape. */
async function finished(id) {
  return publicView(await getProduct(id));
}

const routes = [
  // The only three ways in. Everything else needs the session cookie one of
  // them handed out, because every generation spends your API quota.
  { method: 'GET', pattern: '/auth/status', public: true, handler: async (ctx) => {
      const configured = await passwordConfigured();
      const checked = Boolean(ctx.session) && (await validSession(ctx.session));
      // An unlocked local build is simply signed in, so the studio behaves the
      // way it always did until a password exists or the portal goes online.
      return json({
        protected: configured,
        signedIn: configured || onNetlify() ? checked : true,
        lockedFor: await lockedFor(),
      });
    } },

  { method: 'POST', pattern: '/auth/login', public: true, handler: async (ctx) => {
      const waiting = await lockedFor();
      if (waiting) throw new HttpError(`Too many tries. Wait ${waiting} second${waiting === 1 ? '' : 's'} and try again.`, 429);
      if (!(await verifyPassword(String(ctx.body?.password ?? '')))) {
        const seconds = await noteFailure();
        throw new HttpError(seconds ? `Wrong password, and that was the last try for ${seconds} seconds.` : 'Wrong password.', 401);
      }
      await clearFailures();
      return { ...json({ signedIn: true }), cookie: sessionCookie(await createSession()) };
    } },

  { method: 'POST', pattern: '/auth/logout', public: true, handler: async () =>
      ({ ...json({ signedOut: true }), cookie: sessionCookie('', 0) }) },

  // Creates the password the first time (nothing to prove) and changes it after
  // that, which needs both the old password and a live session.
  { method: 'PUT', pattern: '/auth/password', public: true, handler: async (ctx) => {
      const firstTime = !(await passwordConfigured());
      if (!firstTime && !(await validSession(ctx.session))) throw new HttpError('Sign in before changing the password.', 401);
      if (!firstTime && !(await verifyPassword(String(ctx.body?.current ?? '')))) {
        throw new HttpError('That is not your current password.', 403);
      }
      const problem = passwordProblem(ctx.body?.next);
      if (problem) throw new HttpError(problem, 400);
      await setPassword(ctx.body.next);
      return {
        ...json({ saved: true, protected: true, ...(await keyStatus()), passwordSet: true }),
        cookie: sessionCookie(await createSession()),
      };
    } },

  { method: 'GET', pattern: '/health', handler: async () => {
      const { askedFirst, blocking } = await keyCoverage();
      return json({ ok: true, textProvider: askedFirst, missingProviders: blocking });
    } },

  { method: 'GET', pattern: '/products', handler: async () => {
      const rows = await listProducts();
      return json({
        products: rows.map((row) => ({
          id: row.id,
          productName: row.product_name,
          status: row.status,
          zipReady: Boolean(row.zip_name),
          downloadUrl: row.zip_name ? `/api/products/${row.id}/download` : null,
          createdAt: row.created_at,
        })),
      });
    } },

  { method: 'GET', pattern: '/products/slots', handler: async () =>
      json({ slots: SLOTS, rules: { ...IMAGE_RULES, maxBytes: maxUploadBytes() } }) },

  // Declared before /:id so the word "slots" is never read as a product id.
  { method: 'POST', pattern: '/products', handler: async (ctx) => {
      const productName = String(ctx.body?.productName || '').trim();
      if (productName.length < 3) throw new HttpError('Enter a product name or niche (at least 3 characters).');
      if (productName.length > 200) throw new HttpError('Product name is too long (max 200 characters).');

      const id = crypto.randomUUID();
      await createProduct({ id, productName, status: 'queued' });
      return json({ product: await finished(id) }, 201);
    } },

  // The local server runs the job in this process; hosted, this path belongs to
  // the background function and never reaches this router.
  { method: 'POST', pattern: '/run/:id', handler: async (ctx) => {
      const product = await loadProduct(ctx.params);
      await updateProduct(product.id, { status: 'queued' });
      startGeneration(product.id);
      return json({ started: true, id: product.id }, 202);
    } },

  { method: 'POST', pattern: '/products/:id/package', handler: async (ctx) => {
      const product = await loadProduct(ctx.params);
      if (!product.file1_text || !product.file2_text) {
        throw new HttpError('Listing text is missing. Generate the text before packaging.', 409);
      }
      const zip = await buildZip(product);
      const updated = await updateProduct(product.id, { zip_name: zip.name, status: 'packaged' });
      return json({
        product: await publicView(updated),
        zip: {
          name: zip.name,
          bytes: zip.bytes,
          images: zip.images,
          downloadUrl: `/api/products/${product.id}/download`,
        },
        contents: zip.entries,
      });
    } },

  { method: 'GET', pattern: '/products/:id', handler: async (ctx) => {
      const product = await loadProduct(ctx.params);
      return json({ product: await publicView(product) });
    } },

  { method: 'GET', pattern: '/products/:id/image/:slotId', handler: async (ctx) => {
      const product = await loadProduct(ctx.params);
      const slot = requireSlot(ctx.params);
      const found = await resolveImage(product.id, slot.id);
      if (!found) throw new HttpError(`No image uploaded for "${slot.label}" yet.`, 404);
      return inline(found.bytes, contentTypeFor(found.key));
    } },

  { method: 'POST', pattern: '/products/:id/image/:slotId', handler: async (ctx) => {
      const product = await loadProduct(ctx.params);
      const slot = requireSlot(ctx.params);
      if (!ctx.raw?.length) throw new HttpError('Send the image as the request body, not as JSON.');
      if (ctx.raw.length > maxUploadBytes()) {
        throw new HttpError(
          `That file is ${(ctx.raw.length / 1024 / 1024).toFixed(1)} MB. This host accepts listing images up to ${(maxUploadBytes() / 1024 / 1024).toFixed(0)} MB.`,
          413,
        );
      }
      const info = await storeImage(product, slot, Buffer.from(ctx.raw));
      if (!info.ok) throw new HttpError(info.message, 422);
      await invalidatePackage(product.id);
      return json({
        product: await publicView(await getProduct(product.id)),
        image: { slotId: slot.id, width: info.width, height: info.height, format: info.format, bytes: info.bytes },
      });
    } },

  { method: 'DELETE', pattern: '/products/:id/image/:slotId', handler: async (ctx) => {
      const product = await loadProduct(ctx.params);
      const slot = requireSlot(ctx.params);
      if (await dropImage(product, slot)) await invalidatePackage(product.id);
      return json({ product: await publicView(await getProduct(product.id)) });
    } },

  { method: 'GET', pattern: '/products/:id/download', handler: async (ctx) => {
      const product = await loadProduct(ctx.params);
      const bytes = await getFile(zipKey(product.id));
      if (!bytes) throw new HttpError('The ZIP has not been built yet. Click "Create ZIP" first.', 409);
      return download(bytes, 'application/zip', product.zip_name || 'etsy-listing-package.zip');
    } },

  { method: 'GET', pattern: '/products/:id/text/:fileKey', handler: async (ctx) => {
      const product = await loadProduct(ctx.params);
      const file = TEXT_FILES.find((f) => f.key === ctx.params.fileKey);
      if (!file) throw new HttpError('Unknown text file.', 404);
      if (!product[file.key]) throw new HttpError('That file has not been generated yet.', 409);
      const stored = await documentBytes(product, file.key);
      if (!stored.bytes) throw new HttpError('That PDF could not be rendered.', 500);
      return download(stored.bytes, 'application/pdf', file.name);
    } },

  { method: 'DELETE', pattern: '/products', handler: async () => {
      const count = await clearProducts();
      await deletePrefix('products/');
      return json({ cleared: count });
    } },

  { method: 'DELETE', pattern: '/products/:id', handler: async (ctx) => {
      const product = await loadProduct(ctx.params);
      await deleteProduct(product.id);
      await deletePrefix(`products/${product.id}/`);
      return { status: 204, headers: {}, body: null };
    } },

  { method: 'GET', pattern: '/settings', handler: async () =>
      json({ ...(await keyStatus()), passwordSet: await passwordConfigured() }) },

  { method: 'PUT', pattern: '/settings/key', handler: async (ctx) => {
      const provider = pickProvider(ctx);
      const issues = keyIssues(provider, ctx.body?.apiKey);
      if (issues.length) throw new HttpError(issues.join(' '), 400, { issues });
      return json({ saved: true, ...(await saveKey(provider, ctx.body.apiKey)) });
    } },

  { method: 'DELETE', pattern: '/settings/key', handler: async (ctx) => {
      const provider = pickProvider(ctx);
      return json({ removed: true, ...(await removeKey(provider)) });
    } },

  { method: 'PUT', pattern: '/settings/model', handler: async (ctx) => {
      const provider = pickProvider(ctx);
      return json({ saved: true, ...(await saveModel(provider, ctx.body?.model)) });
    } },

  { method: 'DELETE', pattern: '/settings/model', handler: async (ctx) => {
      const provider = pickProvider(ctx);
      return json({ removed: true, ...(await removeModel(provider)) });
    } },

  { method: 'PUT', pattern: '/settings/brand', handler: async (ctx) => {
      const issues = brandIssues(ctx.body?.brand);
      if (issues.length) throw new HttpError(issues.join(' '), 400, { issues });
      await saveBrand(ctx.body.brand);
      return json({ saved: true, ...(await keyStatus()) });
    } },

  { method: 'DELETE', pattern: '/settings/brand', handler: async () => {
      await clearBrand();
      return json({ removed: true, ...(await keyStatus()) });
    } },

  { method: 'GET', pattern: '/settings/prompt', handler: async () => json(await promptSettings()) },

  { method: 'PUT', pattern: '/settings/prompt', handler: async (ctx) => {
      const issues = promptIssues(ctx.body?.text);
      if (issues.length) throw new HttpError(issues.join(' '), 400, { issues });
      return json({ saved: true, ...(await savePrompt(ctx.body)) });
    } },

  { method: 'DELETE', pattern: '/settings/prompt', handler: async () =>
      json({ cleared: true, ...(await clearPrompt()) }) },
];

const PROVIDERS = ['gemini', 'anthropic', 'groq'];

function pickProvider(ctx) {
  const provider = String(ctx.body?.provider || ctx.query.get('provider') || '').toLowerCase();
  if (!PROVIDERS.includes(provider)) throw new HttpError(`Choose one of: ${PROVIDERS.join(', ')}.`);
  return provider;
}

const split = (path) => path.split('/').filter(Boolean);

function match(route, method, segments) {
  if (route.method !== method) return null;
  const wanted = split(route.pattern);
  if (wanted.length !== segments.length) return null;
  const params = {};
  for (let i = 0; i < wanted.length; i += 1) {
    const token = wanted[i];
    if (token.startsWith(':')) {
      if (!segments[i]) return null;
      params[token.slice(1)] = decodeURIComponent(segments[i]);
    } else if (token !== segments[i]) return null;
  }
  return params;
}

export async function handleApi({ method, path, query, body, raw, cookie }) {
  const segments = split(path);
  const url = new URL(query ? `?${query}` : '?', 'http://local');
  const ctx = { params: {}, query: url.searchParams, body: null, raw, session: readSession(cookie) };

  const route = routes.find((entry) => {
    const params = match(entry, method, segments);
    if (!params) return false;
    ctx.params = params;
    return true;
  });
  if (!route) throw new HttpError('Unknown endpoint.', 404);

  // A hosted deployment is on the open internet, so it is locked from the first
  // request: the only way in is the set-once password screen. On your own
  // machine the portal stays usable until you choose to put a password on it.
  const locked = (await passwordConfigured()) || onNetlify();
  if (!route.public && locked && !(await validSession(ctx.session))) {
    throw new HttpError('Sign in to use this portal.', 401);
  }

  ctx.body = body;
  const result = await route.handler(ctx);
  if (!result.cookie) return result;
  const { cookie: setCookie, ...rest } = result;
  return { ...rest, headers: { ...rest.headers, 'set-cookie': setCookie } };
}
