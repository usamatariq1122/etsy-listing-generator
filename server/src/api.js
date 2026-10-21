import crypto from 'node:crypto';
import {
  clearProducts,
  clearProductsForUser,
  claimEtsyDraft,
  releaseEtsyDraft,
  DRAFT_CLAIM,
  createProduct,
  deleteProduct,
  getProduct,
  getProductForUser,
  getFirstAdmin,
  listProductDocuments,
  listProductImages,
  listProducts,
  updateProduct,
  createBulkJob,
  insertBulkRow,
  getBulkJob,
  listBulkJobs,
  listBulkRows,
  getBulkRow,
  updateBulkRow,
  resetFailedRows,
  deleteBulkJob,
  adminUsers,
  adminTotals,
  adminFailed,
} from './db.js';
import { IMAGE_RULES, PDF_RULES } from './rules.js';
import { SLOTS, getSlot, promptFor } from './slots.js';
import { dropImage, resolveImage, storeImage } from './uploads.js';
import { generateImage } from './imagegen.js';
import { isSafeId, ownedId, productPrefix, zipKey } from './paths.js';
import { contentTypeFor, deleteFile, deletePrefix, getFile } from './files.js';
import { checkPdf } from './pdfcheck.js';
import { config } from './config.js';
import { emailProblem, mailReady } from './email.js';
import { HttpError } from './httperror.js';
import { keywordIdeas, pickedKeywords } from './keywords.js';
import { listingFields } from './listingFields.js';
import { parseCsv } from './bulk.js';
import { TEXT_FILES } from './documents.js';
import { buildZip, documentBytes, keepUploadedPdf, restoreGeneratedPdf, writeDocuments } from './zip.js';
import { startGeneration } from './generate.js';
import { applyListingEdits, listingIssues } from './listingEdit.js';
import { SEO_LIMITS, scrubBannedWord } from './validate.js';
import { keyCoverage, keyIssues, keyStatus, PROVIDERS, removeKey, removeModel, saveKey, saveModel } from './apikeys.js';
import { brandIssues, clearBrand, saveBrand } from './brand.js';
import { clearTheme, saveTheme, themeColors, themeIssues } from './theme.js';
import { authorizeUrl, completeConnect, connection, disconnect, etsyReady } from './etsy.js';
import { categoryTree, resolveCategoryId } from './taxonomy.js';
import { reportError, sentryEnabled } from './sentry.js';
import { WHEN_MADE, WHO_MADE, publishDraft, sendDraft } from './draft.js';
import {
  clearFailures,
  createSession,
  lockedFor,
  noteFailure,
  passwordConfigured,
  passwordProblem,
  portalLocked,
  readSession,
  sessionCookie,
  setPassword,
  validSession,
  verifyPassword,
  // Accounts (Phase 2).
  accountCookie,
  issueReset,
  needsBootstrap,
  readAccount,
  resetPassword,
  resolveAccount,
  signInAccount,
  signOutAccount,
  signUp,
  verifyAccountToken,
} from './auth.js';
import { runAs } from './requestContext.js';
import { canGenerate, dailyLimit, limitMessage, usageFor } from './quota.js';
import {
  PRODUCT_TYPES,
  clearTemplate,
  listTemplates,
  resolveProductType,
  saveTemplate,
  templateIssues,
} from './promptTemplates.js';

// The single identity a request acts as. An account session wins; otherwise a
// valid legacy portal-password session stands for the owner (the admin account),
// and with no admin yet it stands for "no owner". This keeps the old shared-
// password path working while every owned object is still keyed to a real user.
async function resolveUser(ctx) {
  const account = await resolveAccount(ctx.accountToken);
  if (account) return account;
  if (ctx.session && (await validSession(ctx.session))) return getFirstAdmin();
  return null;
}

/** The identity behind a raw Cookie header, for callers outside the router (the
 *  background job) that must act as the same user the browser is signed in as. */
export async function resolveUserFromCookie(cookieHeader) {
  return resolveUser({ session: readSession(cookieHeader), accountToken: readAccount(cookieHeader) });
}

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

// The Etsy callback is a browser navigation, so it answers with a redirect back
// into the studio rather than a body of its own.
const redirect = (location) => ({ status: 302, headers: { location, 'cache-control': 'no-store' }, body: null });

// A function invocation accepts about 6 MB, so a hosted build caps uploads
// below the 25 MB the desktop version will happily take from disk.
const hostCapBytes = () => (config.deployed ? 4 * 1024 * 1024 : Infinity);
const maxUploadBytes = () => Math.min(IMAGE_RULES.maxBytes, hostCapBytes());
const maxPdfBytes = () => Math.min(PDF_RULES.maxBytes, hostCapBytes());

const wordsOf = (text) => (String(text || '').trim() ? String(text).trim().split(/\s+/).length : 0);

/**
 * The price is always the seller's own number, so an entry that is not one is
 * refused rather than rounded. Empty means "no price set yet".
 */
function priceOf(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(text)) {
    throw new HttpError('Enter the price as a number like 4.50, with two decimals at most.');
  }
  const number = Number(text);
  if (number <= 0) throw new HttpError('The price has to be more than zero.');
  return number.toFixed(2);
}

async function loadProduct(params, user) {
  const { id } = params;
  if (!isSafeId(id)) throw new HttpError('Invalid product id.');
  const product = await getProductForUser(id, user?.id ?? null);
  if (!product) throw new HttpError('That product no longer exists. Start a new listing.', 404);
  return product;
}

function requireSlot(params) {
  const slot = getSlot(params.slotId);
  if (!slot) throw new HttpError('Unknown image slot.', 404);
  return slot;
}

// A batch is capped well below "unlimited" so one CSV cannot quietly spend a
// whole day of model quota or a wall of background jobs.
const BULK_MAX = 50;

async function requireJob(id, user) {
  if (!isSafeId(id)) throw new HttpError('Invalid batch id.');
  const job = await getBulkJob(id);
  if (!job || job.user_id !== (user?.id ?? null)) throw new HttpError('That batch no longer exists.', 404);
  return job;
}

function requireDocument(params) {
  const file = TEXT_FILES.find((entry) => entry.key === params.fileKey);
  if (!file) throw new HttpError('Unknown listing document.', 404);
  return file;
}

/** The seller's own file name, kept for display only — never as a storage key. */
function displayName(value, fallback) {
  const text = String(value ?? '').split(/[\\/]/).pop().trim();
  return (text || fallback).slice(0, 200);
}

/** A ZIP is only valid while its images are, so changing one removes the package. */
async function invalidatePackage(productId) {
  await updateProduct(productId, { zip_name: null, status: 'text' });
  await deleteFile(zipKey(productId));
}

async function publicView(product) {
  const images = await listProductImages(product.id);
  const stored = new Map((await listProductDocuments(product.id)).map((doc) => [doc.file_key, doc]));
  return {
    id: product.id,
    productName: product.product_name,
    productType: product.product_type ?? null,
    keywords: product.selected_keywords || [],
    status: product.status,
    file1Text: product.file1_text || '',
    file2Text: product.file2_text || '',
    listing: listingFields(product.file2_text),
    price: product.price ?? null,
    mockupPrompts: product.mockup_prompts || [],
    infographicPrompts: product.infographic_prompts || [],
    slots: SLOTS,
    rules: { ...IMAGE_RULES, maxBytes: maxUploadBytes(), pdfMaxBytes: maxPdfBytes() },
    // The limits the seller edits against, so the tag checker is the same numbers
    // the pipeline enforces rather than a copy that could drift.
    seoLimits: SEO_LIMITS,
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
    // Which PDF goes into the package for each deliverable, and how big it is.
    documents: TEXT_FILES.map((file) => {
      const row = stored.get(file.key);
      return {
        key: file.key,
        name: file.name,
        words: wordsOf(product[file.key]),
        source: row?.source ?? null,
        originalName: row?.source === 'uploaded' ? row.original_name : null,
        bytes: row?.bytes ?? null,
        uploadedAt: row?.uploaded_at ?? null,
        downloadUrl: `/api/products/${product.id}/text/${file.key}`,
      };
    }),
    createdAt: product.created_at,
    updatedAt: product.updated_at,
    // Only what Etsy itself gave back as a public link — never a token. The
    // in-progress sentinel is not a real draft, so it reads as no draft yet.
    etsyDraft: product.etsy_listing_id && product.etsy_listing_id !== DRAFT_CLAIM
      ? { listingId: product.etsy_listing_id, url: product.etsy_draft_url, syncedAt: product.etsy_synced_at }
      : null,
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
      const account = await resolveAccount(ctx.accountToken);
      const legacy = Boolean(ctx.session) && (await validSession(ctx.session));
      // An unlocked local build is simply signed in, so the studio behaves the
      // way it always did until a password exists or the portal goes online.
      const signedIn = (await portalLocked()) ? (account || legacy) : true;
      return json({
        protected: configured,
        signedIn,
        lockedFor: await lockedFor(),
        // No accounts yet means the first one to sign up becomes the owner.
        needsSetup: await needsBootstrap(),
        mail: mailReady(),
        dailyLimit: dailyLimit(),
        contactEmail: config.contactEmail || null,
        account: account ? { email: account.email, name: account.name, role: account.role, verified: Boolean(account.verified_at) } : null,
        usage: account ? await usageFor(account.id) : null,
      });
    } },

  { method: 'POST', pattern: '/account/signup', public: true, handler: async (ctx) => {
      const { user, token, expiresAt } = await signUp({ email: ctx.body?.email, password: ctx.body?.password, name: ctx.body?.name });
      return {
        ...json({ account: { email: user.email, role: user.role }, signedIn: true }),
        cookie: accountCookie(token, Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))),
      };
    } },

  { method: 'POST', pattern: '/account/login', public: true, handler: async (ctx) => {
      const { token, expiresAt } = await signInAccount({ email: ctx.body?.email, password: ctx.body?.password });
      return {
        ...json({ signedIn: true }),
        cookie: accountCookie(token, Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))),
      };
    } },

  { method: 'POST', pattern: '/account/logout', public: true, handler: async (ctx) => {
      await signOutAccount(ctx.accountToken);
      return { ...json({ signedOut: true }), cookie: accountCookie('', 0) };
    } },

  { method: 'GET', pattern: '/account/verify', public: true, handler: async (ctx) => {
      const ok = await verifyAccountToken(ctx.query.get('token'));
      return json({ verified: ok }, ok ? 200 : 400);
    } },

  // Reset works with or without mail. Where a mailbox exists the link is
  // emailed and the answer is the same whether or not the address is known.
  // Where none does, a local build hands the link back to be opened directly;
  // a deployed one cannot deliver it, so the client says the reset is unavailable.
  { method: 'POST', pattern: '/account/forgot', public: true, handler: async (ctx) => {
      const problem = emailProblem(ctx.body?.email);
      if (problem) throw new HttpError(problem, 400);
      const result = await issueReset(ctx.body?.email);
      return json({
        mail: mailReady(),
        // Only ever present on an unlocked local build with no mail configured.
        token: result?.token ?? null,
      });
    } },

  { method: 'POST', pattern: '/account/reset', public: true, handler: async (ctx) => {
      await resetPassword({ email: ctx.body?.email, token: ctx.body?.token, password: ctx.body?.password });
      return json({ reset: true });
    } },

  { method: 'GET', pattern: '/me', handler: async (ctx) => {
      const u = ctx.user;
      if (!u) throw new HttpError('Sign in to see your account.', 401);
      return json({
        account: { email: u.email, name: u.name, role: u.role, verified: Boolean(u.verified_at), created_at: u.created_at },
        usage: await usageFor(u.id),
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

  // The browser's own crashes, handed here because the write-only Sentry DSN
  // must never be embedded in a shipped bundle. Public, so an error on the
  // password screen is still reported. It is a fire-and-forget beacon: it always
  // answers 204, and with no DSN configured reportError is a no-op that sends
  // nothing.
  { method: 'POST', pattern: '/client-error', public: true, handler: async (ctx) => {
      if (!sentryEnabled()) return { status: 204, headers: {}, body: null };
      const message = String(ctx.body?.message ?? 'Browser error').slice(0, 500);
      const error = new Error(message);
      error.name = String(ctx.body?.name ?? 'BrowserError').slice(0, 100);
      error.stack = String(ctx.body?.stack ?? '').slice(0, 8000);
      await reportError(error, { source: 'browser' });
      return { status: 204, headers: {}, body: null };
    } },

  { method: 'GET', pattern: '/health', handler: async () => {
      const { askedFirst, blocking } = await keyCoverage();
      return json({ ok: true, textProvider: askedFirst, missingProviders: blocking });
    } },

  { method: 'GET', pattern: '/products', handler: async (ctx) => {
      const rows = await listProducts(ctx.user?.id ?? null);
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

      // Stop a full account before it even queues a row; the authoritative charge
      // still happens when the model is called, so this stays a courtesy gate.
      if (ctx.user) {
        const usage = await usageFor(ctx.user.id);
        if (!canGenerate(usage)) throw new HttpError(limitMessage(usage), 429);
      }

      const id = ctx.user ? ownedId(ctx.user.id, crypto.randomUUID()) : crypto.randomUUID();
      await createProduct({
        id,
        productName,
        keywords: pickedKeywords(ctx.body?.keywords),
        status: 'queued',
        userId: ctx.user?.id ?? null,
        productType: resolveProductType(ctx.body?.productType),
      });
      return json({ product: await finished(id) }, 201);
    } },

  // The keyword tick screen: live buyer queries for a niche, cached for a day,
  // so ticking costs one round trip and never spends a model call.
  { method: 'GET', pattern: '/keywords', handler: async (ctx) => {
      const productName = String(ctx.query.get('q') || '').trim();
      if (productName.length < 3) throw new HttpError('Enter a product name or niche (at least 3 characters) to look up keywords.');
      if (productName.length > 200) throw new HttpError('Product name is too long (max 200 characters).');
      return json(await keywordIdeas(productName));
    } },

  // The local server runs the job in this process; hosted, this path belongs to
  // the background function and never reaches this router.
  { method: 'POST', pattern: '/run/:id', handler: async (ctx) => {
      const product = await loadProduct(ctx.params, ctx.user);
      await updateProduct(product.id, { status: 'queued' });
      startGeneration(product.id);
      return json({ started: true, id: product.id }, 202);
    } },

  { method: 'POST', pattern: '/products/:id/package', handler: async (ctx) => {
      const product = await loadProduct(ctx.params, ctx.user);
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
          documents: zip.documents,
          images: zip.images,
          downloadUrl: `/api/products/${product.id}/download`,
        },
        contents: zip.entries,
      });
    } },

  { method: 'GET', pattern: '/products/:id', handler: async (ctx) => {
      const product = await loadProduct(ctx.params, ctx.user);
      return json({ product: await publicView(product) });
    } },

  // Only the seller sets a price, so this is the one field the portal writes
  // from a typed number instead of a model.
  { method: 'PUT', pattern: '/products/:id/price', handler: async (ctx) => {
      const product = await loadProduct(ctx.params, ctx.user);
      const updated = await updateProduct(product.id, { price: priceOf(ctx.body?.price) });
      return json({ product: await publicView(updated) });
    } },

  { method: 'PUT', pattern: '/products/:id/listing', handler: async (ctx) => {
      const product = await loadProduct(ctx.params, ctx.user);
      if (!product.file2_text) throw new HttpError('Listing text is missing. Generate the text before editing it.', 409);

      // Typed by a person, so the same one rule still applies: a marketplace name
      // never reaches a printed file, whatever the model or the seller wrote.
      const toText = (value) => (value === undefined ? undefined : scrubBannedWord(String(value)).text);
      const edits = {
        title: toText(ctx.body?.title),
        description: toText(ctx.body?.description),
        tags: Array.isArray(ctx.body?.tags) ? ctx.body.tags.map((tag) => scrubBannedWord(String(tag)).text.trim()).filter(Boolean) : undefined,
      };

      const { text, changed } = applyListingEdits(product.file2_text, edits);
      // Refuse before anything is written: a file that Etsy would reject must never
      // reach the disk or the printed PDF, whatever the browser's own checker says.
      const issues = listingIssues(text);
      if (issues.length) throw new HttpError(issues[0], 422, { issues });

      const updated = await updateProduct(product.id, { file2_text: text });
      // The PDF is reprinted straight away, so the manifest never offers a file
      // that disagrees with the words on the screen.
      await writeDocuments(updated, 'file2_text');
      await invalidatePackage(product.id);

      return json({
        product: await publicView(await getProduct(product.id)),
        listing: listingFields(text),
        changed,
        issues: [],
      });
    } },

  { method: 'GET', pattern: '/products/:id/image/:slotId', handler: async (ctx) => {
      const product = await loadProduct(ctx.params, ctx.user);
      const slot = requireSlot(ctx.params);
      const found = await resolveImage(product.id, slot.id);
      if (!found) throw new HttpError(`No image uploaded for "${slot.label}" yet.`, 404);
      return inline(found.bytes, contentTypeFor(found.key));
    } },

  { method: 'POST', pattern: '/products/:id/image/:slotId', handler: async (ctx) => {
      const product = await loadProduct(ctx.params, ctx.user);
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
      const product = await loadProduct(ctx.params, ctx.user);
      const slot = requireSlot(ctx.params);
      if (await dropImage(product, slot)) await invalidatePackage(product.id);
      return json({ product: await publicView(await getProduct(product.id)) });
    } },

  // Draws the slot's own listing prompt into the slot. The bytes go through the
  // same storeImage gate as a hand upload, so a generated image is never allowed
  // somewhere a real JPG would have been refused.
  { method: 'POST', pattern: '/products/:id/image/:slotId/generate', handler: async (ctx) => {
      const product = await loadProduct(ctx.params, ctx.user);
      const slot = requireSlot(ctx.params);
      const { buffer, provider } = await generateImage(promptFor(slot, product));
      if (buffer.length > maxUploadBytes()) {
        throw new HttpError('The generated image is too large for this host. Upload your own instead.', 413);
      }
      const info = await storeImage(product, slot, buffer);
      if (!info.ok) throw new HttpError(info.message, 422);
      await invalidatePackage(product.id);
      return json({
        provider,
        product: await publicView(await getProduct(product.id)),
        image: { slotId: slot.id, width: info.width, height: info.height, format: info.format, bytes: info.bytes },
      });
    } },

  // A seller with their own PDF for either deliverable replaces the rendered one;
  // the upload is checked as a PDF, never taken on its file extension.
  { method: 'PUT', pattern: '/products/:id/document/:fileKey', handler: async (ctx) => {
      const product = await loadProduct(ctx.params, ctx.user);
      const file = requireDocument(ctx.params);
      if (!ctx.raw?.length) throw new HttpError('Send the PDF as the request body, not as JSON.');
      const limit = maxPdfBytes();
      if (ctx.raw.length > limit) {
        throw new HttpError(
          `That file is ${(ctx.raw.length / 1024 / 1024).toFixed(1)} MB. This host accepts a PDF up to ${(limit / 1024 / 1024).toFixed(0)} MB.`,
          413,
        );
      }
      const info = checkPdf(Buffer.from(ctx.raw), limit);
      if (!info.ok) throw new HttpError(info.message, 422);
      await keepUploadedPdf(product, file, displayName(ctx.query.get('name'), file.name), Buffer.from(ctx.raw));
      await invalidatePackage(product.id);
      return json({ product: await publicView(await getProduct(product.id)) });
    } },

  { method: 'DELETE', pattern: '/products/:id/document/:fileKey', handler: async (ctx) => {
      const product = await loadProduct(ctx.params, ctx.user);
      const file = requireDocument(ctx.params);
      await restoreGeneratedPdf(product, file);
      await invalidatePackage(product.id);
      return json({ product: await publicView(await getProduct(product.id)) });
    } },

  { method: 'GET', pattern: '/products/:id/download', handler: async (ctx) => {
      const product = await loadProduct(ctx.params, ctx.user);
      const bytes = await getFile(zipKey(product.id));
      if (!bytes) throw new HttpError('The ZIP has not been built yet. Click "Create ZIP" first.', 409);
      return download(bytes, 'application/zip', product.zip_name || 'listing-package.zip');
    } },

  { method: 'GET', pattern: '/products/:id/text/:fileKey', handler: async (ctx) => {
      const product = await loadProduct(ctx.params, ctx.user);
      const file = TEXT_FILES.find((f) => f.key === ctx.params.fileKey);
      if (!file) throw new HttpError('Unknown text file.', 404);
      if (!product[file.key]) throw new HttpError('That file has not been generated yet.', 409);
      const stored = await documentBytes(product, file.key);
      if (!stored.bytes) throw new HttpError('That PDF could not be rendered.', 500);
      return download(stored.bytes, 'application/pdf', file.name);
    } },

  { method: 'DELETE', pattern: '/products', handler: async (ctx) => {
      if (!ctx.user) throw new HttpError('Sign in to clear your history.', 401);
      if (ctx.user.role !== 'admin') throw new HttpError('Only the owner can clear the whole history.', 403);
      const count = await clearProductsForUser(ctx.user.id);
      await deletePrefix(`users/${ctx.user.id}/`);
      return json({ cleared: count });
    } },

  { method: 'DELETE', pattern: '/products/:id', handler: async (ctx) => {
      const product = await loadProduct(ctx.params, ctx.user);
      await deleteProduct(product.id);
      await deletePrefix(productPrefix(product.id));
      return { status: 204, headers: {}, body: null };
    } },

  { method: 'GET', pattern: '/settings', handler: async (ctx) =>
      json({
        ...(await keyStatus()),
        theme: await themeColors(),
        passwordSet: await passwordConfigured(),
        dailyLimit: dailyLimit(),
        productTypes: PRODUCT_TYPES,
        usage: ctx.user ? await usageFor(ctx.user.id) : null,
      }) },

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

  // The printed PDFs' palette. Saved colours apply to the next PDF the portal
  // renders; with none saved it prints in the built-in palette.
  { method: 'PUT', pattern: '/settings/theme', handler: async (ctx) => {
      const issues = themeIssues(ctx.body?.theme);
      if (issues.length) throw new HttpError(issues.join(' '), 400, { issues });
      return json({ saved: true, theme: await saveTheme(ctx.body.theme) });
    } },

  { method: 'DELETE', pattern: '/settings/theme', handler: async () =>
      json({ removed: true, theme: await clearTheme() }) },

  // The listing brief the text model writes from, editable per product type.
  // Reading the types is open to anyone signed in so the editor can show the
  // current wording; only the owner (or a solo local run with no accounts yet)
  // may change it, because these prompts are shared across every listing.
  // The listing briefs are the owner's own wording, so reading them is limited
  // to the owner too (or a solo local run with no accounts yet). Other accounts
  // still benefit from a chosen type's template at generation time without ever
  // seeing its text.
  { method: 'GET', pattern: '/settings/prompts', handler: async (ctx) => {
      requirePromptAdmin(ctx);
      return json({ types: await listTemplates() });
    } },

  { method: 'PUT', pattern: '/settings/prompt', handler: async (ctx) => {
      requirePromptAdmin(ctx);
      const type = String(ctx.body?.type ?? '').trim().toLowerCase();
      const issues = templateIssues(type, ctx.body?.body);
      if (issues.length) throw new HttpError(issues.join(' '), 400, { issues });
      await saveTemplate(type, ctx.body.body);
      return json({ saved: true, types: await listTemplates() });
    } },

  { method: 'DELETE', pattern: '/settings/prompt', handler: async (ctx) => {
      requirePromptAdmin(ctx);
      const type = String(ctx.query.get('type') ?? '').trim().toLowerCase();
      if (await clearTemplate(type)) return json({ removed: true, types: await listTemplates() });
      return json({ removed: false, types: await listTemplates() });
    } },

  // The owner's read-only dashboard: who has an account, how much of today's
  // quota each has spent, and which listings failed. Only an admin account sees
  // it — a solo local run has no accounts to manage, so it is refused there too.
  { method: 'GET', pattern: '/admin/overview', handler: async (ctx) => {
      requireAdmin(ctx);
      return json({
        dailyLimit: dailyLimit(),
        totals: await adminTotals(),
        users: await adminUsers(),
        failed: await adminFailed(),
      });
    } },

  // Etsy is a switch, not a feature that is always there. With ETSY_ENABLED
  // unset, /etsy/status says so and every other route below refuses — the studio
  // shows nothing Etsy-shaped and the ZIP download path is never touched.
  // Tokens stay in the database, encrypted: no route here returns one.
  { method: 'GET', pattern: '/etsy/status', handler: async () =>
      json({ ...(await connection()), whoMade: WHO_MADE, whenMade: WHEN_MADE }) },

  { method: 'POST', pattern: '/etsy/connect', handler: async () => {
      requireEtsy();
      return json({ url: await authorizeUrl() });
    } },

  // Etsy brings the browser back to this URL with a code. The same session guard
  // as every other route decides who may use it, so a forwarded link is worth
  // nothing to anyone who is not signed in here.
  { method: 'GET', pattern: '/etsy/callback', handler: async (ctx) => {
      try {
        requireEtsy();
        if (ctx.query.get('error')) {
          throw new HttpError('Etsy would not authorise this shop. Grant the listings permission to your app and connect again.');
        }
        const code = ctx.query.get('code');
        if (!code) throw new HttpError('Etsy sent back no authorisation code. Connect again from the beginning.');
        await completeConnect({ code, state: ctx.query.get('state') });
        return redirect('/?etsy=connected');
      } catch (error) {
        // Only the sentence goes into the URL; a token never reaches this path.
        return redirect(`/?etsy=failed&message=${encodeURIComponent(error.message || 'Etsy could not be connected.')}`);
      }
    } },

  // The tree is public data, cached for a day, and small enough to filter in the
  // browser — a seller typing a category should not send a request per letter.
  { method: 'GET', pattern: '/etsy/categories', handler: async () => {
      requireEtsy();
      try {
        return json({ categories: await categoryTree() });
      } catch (error) {
        throw new HttpError(`Etsy's category list could not be loaded. ${error.message}`, 502);
      }
    } },

  { method: 'DELETE', pattern: '/etsy/connection', handler: async () => {
      requireEtsy();
      return json({ removed: true, ...(await disconnect()) });
    } },

  // One draft, then never again for this package: a second click would make a
  // second listing, so the seller is sent back to the draft Etsy already has.
  // The claim below is a single atomic UPDATE, so two simultaneous requests
  // cannot both slip past the check and create two drafts.
  { method: 'POST', pattern: '/etsy/draft', handler: async (ctx) => {
      requireEtsy();
      const product = await loadProduct({ id: ctx.body?.productId }, ctx.user);
      if (product.etsy_listing_id === DRAFT_CLAIM) {
        throw new HttpError('A draft for this package is already being created. Wait for it to finish.', 409);
      }
      if (product.etsy_listing_id) {
        throw new HttpError(
          `This package is already in Etsy as a draft${product.etsy_draft_url ? ` — open it there to change it: ${product.etsy_draft_url}` : ''}.`,
          409,
        );
      }
      if (!(await claimEtsyDraft(product.id))) {
        throw new HttpError('This package is already being sent to Etsy, or is already a draft there.', 409);
      }
      const taxonomyId = await resolveCategoryId(ctx.body?.category);
      try {
        const draft = await sendDraft(product, ctx.body, taxonomyId);
        return json({ draft, product: await publicView(await getProduct(product.id)) });
      } catch (error) {
        // Failed before a real listing id was stored: clear the claim so the
        // seller can retry. Once sendDraft has stored an id this is a no-op, so
        // a partially-built draft keeps its link rather than being orphaned.
        await releaseEtsyDraft(product.id);
        if (!error.draft) throw error;
        const partly = `${error.draft.images} image${error.draft.images === 1 ? '' : 's'} and ${error.draft.files} file${error.draft.files === 1 ? '' : 's'}`;
        throw new HttpError(
          `${error.message} A draft was created and got ${partly} onto it, so nothing is lost: ${error.draft.url || `listing ${error.draft.listingId}`}. Fix it or delete it in Etsy.`,
          502,
        );
      }
    } },

  // Publishing is a deliberate click, never automatic: it takes an existing draft
  // live on the seller's shop. Reaching it without a saved draft is refused.
  { method: 'POST', pattern: '/etsy/publish', handler: async (ctx) => {
      requireEtsy();
      const product = await loadProduct({ id: ctx.body?.productId }, ctx.user);
      const published = await publishDraft(product);
      return json({ published, product: await publicView(await getProduct(product.id)) });
    } },

  // --- Bulk CSV mode -----------------------------------------------------
  // A file of product names, one listing per row. The rows are created as
  // ordinary products so each one drives the exact same generation the studio
  // uses; this only tracks the batch and which rows still need running.
  { method: 'POST', pattern: '/bulk', handler: async (ctx) => {
      const csv = String(ctx.body?.csv ?? '');
      const { rows, skipped } = parseCsv(csv);
      if (!rows.length) {
        throw new HttpError('That file had no usable rows. Give each line a product name of at least 3 characters.');
      }
      if (rows.length > BULK_MAX) {
        throw new HttpError(`A batch is capped at ${BULK_MAX} listings at a time (this file has ${rows.length}). Split it up.`);
      }

      const name = displayName(ctx.body?.name, 'Bulk batch').slice(0, 120);
      const userId = ctx.user?.id ?? null;
      const jobId = userId ? ownedId(userId, crypto.randomUUID()) : crypto.randomUUID();
      await createBulkJob({ id: jobId, name, userId });

      const created = [];
      for (const [idx, row] of rows.entries()) {
        const productId = userId ? ownedId(userId, crypto.randomUUID()) : crypto.randomUUID();
        await createProduct({ id: productId, productName: row.productName, keywords: pickedKeywords(row.keywords), status: 'queued', userId });
        await insertBulkRow({ jobId, idx, productName: row.productName, keywords: row.keywords, productId });
        created.push({ idx, productName: row.productName, keywords: row.keywords, productId, status: 'queued' });
      }

      return json({ job: { id: jobId, name, rows: created.length, skipped }, rows: created }, 201);
    } },

  { method: 'GET', pattern: '/bulk', handler: async (ctx) => json({ jobs: await listBulkJobs(ctx.user?.id ?? null) }) },

  { method: 'GET', pattern: '/bulk/:id', handler: async (ctx) => {
      const job = await requireJob(ctx.params.id, ctx.user);
      const rows = await listBulkRows(job.id);
      return json({
        job: { id: job.id, name: job.name, createdAt: job.created_at },
        rows: rows.map((row) => ({
          idx: row.idx,
          productName: row.product_name,
          keywords: row.keywords,
          productId: row.product_id,
          status: row.status,
          attempts: row.attempts,
        })),
      });
    } },

  { method: 'PUT', pattern: '/bulk/:id/row/:idx', handler: async (ctx) => {
      const job = await requireJob(ctx.params.id, ctx.user);
      const idx = Number.parseInt(ctx.params.idx, 10);
      if (!Number.isInteger(idx)) throw new HttpError('Row number is not valid.', 404);
      const row = await getBulkRow(job.id, idx);
      if (!row) throw new HttpError('That row is not in this batch.', 404);
      const status = String(ctx.body?.status ?? '');
      if (!['queued', 'running', 'done', 'failed'].includes(status)) throw new HttpError('Unknown row status.', 400);
      const updated = await updateBulkRow(job.id, idx, { status });
      return json({ row: { idx: updated.idx, status: updated.status, attempts: updated.attempts } });
    } },

  // Failed rows go back to the queue, attempts counted, and come home so the
  // seller can run just the ones that did not finish.
  { method: 'POST', pattern: '/bulk/:id/retry', handler: async (ctx) => {
      const job = await requireJob(ctx.params.id, ctx.user);
      const rows = await resetFailedRows(job.id);
      return json({
        retry: rows.map((row) => ({
          idx: row.idx,
          productName: row.product_name,
          productId: row.product_id,
          status: row.status,
          attempts: row.attempts,
        })),
      });
    } },

  { method: 'DELETE', pattern: '/bulk/:id', handler: async (ctx) => {
      const job = await requireJob(ctx.params.id, ctx.user);
      await deleteBulkJob(job.id);
      return json({ removed: true });
    } },
];

// Nothing in the Etsy layer works without a registered, approved app key, and
// saying so early beats a confusing error three requests later.
function requireEtsy() {
  if (etsyReady()) return;
  throw new HttpError(
    'Etsy is not switched on here. It needs an approved app key and the three ETSY_ variables set — the ZIP download works without any of that.',
    503,
  );
}

function pickProvider(ctx) {
  const provider = String(ctx.body?.provider || ctx.query.get('provider') || '').toLowerCase();
  if (!PROVIDERS.includes(provider)) throw new HttpError(`Choose one of: ${PROVIDERS.join(', ')}.`);
  return provider;
}

// Shared listing prompts are global, so only the owner may change them. A solo
// local run has no accounts yet (ctx.user is null) and is its own owner, so it
// is allowed through; any signed-in non-admin is refused.
function requirePromptAdmin(ctx) {
  if (!ctx.user || ctx.user.role === 'admin') return;
  throw new HttpError('Only the owner can change the listing prompts.', 403);
}

// The admin dashboard is strictly for a real admin account. Unlike the prompt
// editor it is not opened to a solo local run, because there are no accounts to
// manage there and the roll-ups would read as an empty table anyway.
function requireAdmin(ctx) {
  if (ctx.user?.role === 'admin') return;
  throw new HttpError('Only the owner can view the admin dashboard.', 403);
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
  const ctx = {
    params: {},
    query: url.searchParams,
    body: null,
    raw,
    session: readSession(cookie),
    accountToken: readAccount(cookie),
    user: null,
  };

  const route = routes.find((entry) => {
    const params = match(entry, method, segments);
    if (!params) return false;
    ctx.params = params;
    return true;
  });
  if (!route) throw new HttpError('Unknown endpoint.', 404);

  // A hosted deployment is on the open internet, so it is locked from the first
  // request: the way in is either an account session or the legacy portal
  // password. On your own machine the portal stays usable until you choose to
  // put a password on it.
  const locked = await portalLocked();
  const legacyOk = ctx.session && (await validSession(ctx.session));
  const accountOk = Boolean(ctx.accountToken) && Boolean(await resolveAccount(ctx.accountToken));
  if (!route.public && locked && !legacyOk && !accountOk) {
    throw new HttpError('Sign in to use this portal.', 401);
  }

  // Every owned route works from this identity: an account, the legacy owner, or
  // null on an unlocked local build (where objects stay ownerless as before).
  ctx.user = await resolveUser(ctx);

  ctx.body = body;
  // The account this request belongs to (or null for a legacy/unowned one) is
  // made ambient so the settings helpers resolve each account's own keys, model
  // choice, brand and theme, falling back to the shared value.
  const result = await runAs(ctx.user?.id ?? null, () => route.handler(ctx));
  if (!result.cookie) return result;
  const { cookie: setCookie, ...rest } = result;
  return { ...rest, headers: { ...rest.headers, 'set-cookie': setCookie } };
}
