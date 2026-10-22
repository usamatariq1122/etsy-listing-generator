async function parse(res) {
  const type = res.headers.get('content-type') || '';
  return type.includes('application/json') ? res.json() : res.text();
}

async function request(url, options = {}) {
  let res;
  try {
    res = await fetch(url, options);
  } catch {
    throw new Error('Cannot reach the server. Run `netlify dev` from the project root and reload.');
  }

  const data = await parse(res);
  if (!res.ok) {
    const message = typeof data === 'string' ? data : data?.error || `Request failed (${res.status})`;
    const err = new Error(message);
    if (data?.issues) err.issues = data.issues;
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  authStatus: () => request('/api/auth/status'),
  login: (password) =>
    request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  savePassword: (next, current) =>
    request('/api/auth/password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ next, current }),
    }),
  // Named accounts (Phase 2). Separate cookie from the portal password, so the
  // single-owner gate above keeps working untouched.
  me: () => request('/api/me'),
  signUp: ({ email, password, name }) =>
    request('/api/account/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    }),
  accountSignIn: ({ email, password }) =>
    request('/api/account/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }),
  accountSignOut: () => request('/api/account/logout', { method: 'POST' }),
  verifyAccount: (token) => request(`/api/account/verify?token=${encodeURIComponent(token)}`),
  forgot: (email) =>
    request('/api/account/forgot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }),
  reset: ({ email, token, password }) =>
    request('/api/account/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, token, password }),
    }),
  health: () => request('/api/health'),
  history: () => request('/api/products'),
  // The seven slots and their rules, for the screens that run before a product
  // exists yet — the ZIP box needs them to label its mapping.
  slots: () => request('/api/products/slots'),
  get: (id) => request(`/api/products/${id}`),
  create: (productName, keywords = [], productType = null, productInfo = null, extras = {}) =>
    request('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productName, keywords, productType, productInfo,
        patternText: extras.patternText ?? '',
        originalConfirmed: Boolean(extras.originalConfirmed),
        commercialLicense: Boolean(extras.commercialLicense),
        formatMode: extras.formatMode === 'format_only' ? 'format_only' : 'none',
      }),
    }),
  // Buyer queries for the tick screen. A niche repeats inside a day come from
  // the server's cache, so this never hammers the autocomplete service.
  keywords: (productName) => request(`/api/keywords?q=${encodeURIComponent(productName)}`),
  // Writing a listing takes longer than one request may live, so the browser
  // starts the job and then asks for the result until it is there.
  run: (id) => request(`/api/run/${id}`, { method: 'POST' }),
  packageZip: (id) => request(`/api/products/${id}/package`, { method: 'POST' }),
  savePrice: (id, price) =>
    request(`/api/products/${id}/price`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ price }),
    }),
  // The seller's own wording for the marketplace fields. Only the keys sent are
  // changed; File 2 on the server is rewritten in place and its PDF reprinted.
  saveListing: (id, fields) =>
    request(`/api/products/${id}/listing`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    }),
  // The seller's product brief, saved before or after generation. Only the known
  // fields are stored; the server scrubs and re-returns the whole listing.
  saveInfo: (id, productInfo) =>
    request(`/api/products/${id}/info`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productInfo }),
    }),
  // The backend's own verdict on whether this listing could go to Etsy. Computed
  // live from stored state every call, so it is the gate the review panel reads —
  // the browser never decides on its own.
  validate: (id) => request(`/api/products/${id}/validation`),
  remove: (id) => request(`/api/products/${id}`, { method: 'DELETE' }),
  clearHistory: () => request('/api/products', { method: 'DELETE' }),
  // Bulk CSV: one row per product name, each carrying its own pattern text. The
  // batch is created first, then each row is run through the same single-listing
  // pipeline one at a time. The whole batch is attested once as all-original.
  createBulk: (name, csv, originalConfirmed) =>
    request('/api/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, csv, originalConfirmed: Boolean(originalConfirmed) }),
    }),
  bulkJobs: () => request('/api/bulk'),
  bulkJob: (id) => request(`/api/bulk/${id}`),
  setBulkRow: (id, idx, status) =>
    request(`/api/bulk/${id}/row/${idx}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }),
  retryBulk: (id) => request(`/api/bulk/${id}/retry`, { method: 'POST' }),
  deleteBulk: (id) => request(`/api/bulk/${id}`, { method: 'DELETE' }),
  settings: () => request('/api/settings'),
  saveKey: (provider, apiKey) =>
    request('/api/settings/key', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, apiKey }),
    }),
  removeKey: (provider) =>
    request(`/api/settings/key?provider=${provider}`, { method: 'DELETE' }),
  saveModel: (provider, model) =>
    request('/api/settings/model', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, model }),
    }),
  saveBrand: (brand) =>
    request('/api/settings/brand', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brand }),
    }),
  saveTheme: (theme) =>
    request('/api/settings/theme', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme }),
    }),
  removeTheme: () => request('/api/settings/theme', { method: 'DELETE' }),
  // The owner's read-only dashboard. 403 for anyone but an admin account, so the
  // caller only offers the screen once it knows the signed-in role.
  adminOverview: () => request('/api/admin/overview'),
  uploadImage: (id, slotId, file) =>
    request(`/api/products/${id}/image/${slotId}`, {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    }),
  removeImage: (id, slotId) => request(`/api/products/${id}/image/${slotId}`, { method: 'DELETE' }),
  // Draws this slot's own listing prompt into the slot, on the server. Goes
  // through the same image rules an upload would, so it can only land in a slot
  // that would also accept the picture if you uploaded it yourself.
  generateImage: (id, slotId) =>
    request(`/api/products/${id}/image/${slotId}/generate`, { method: 'POST' }),
  // Your own PDF in place of one the portal would render. The file name travels
  // as a query parameter because the body is the file itself.
  uploadDocument: (id, fileKey, file) =>
    request(`/api/products/${id}/document/${fileKey}?name=${encodeURIComponent(file.name)}`, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/pdf' },
      body: file,
    }),
  removeDocument: (id, fileKey) => request(`/api/products/${id}/document/${fileKey}`, { method: 'DELETE' }),
  // Etsy only exists while the server says so; every call below answers 503 when
  // the switch is off, which is why the panel is not rendered at all then.
  etsyStatus: () => request('/api/etsy/status'),
  etsyConnect: () => request('/api/etsy/connect', { method: 'POST' }),
  etsyCategories: () => request('/api/etsy/categories'),
  etsyDisconnect: () => request('/api/etsy/connection', { method: 'DELETE' }),
  // The standing answers to Etsy's draft questions, saved once and merged into
  // every draft. Reading them rides along with /etsy/status; these write them.
  saveEtsyDefaults: (defaults) =>
    request('/api/settings/etsy-defaults', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(defaults),
    }),
  removeEtsyDefaults: () => request('/api/settings/etsy-defaults', { method: 'DELETE' }),
  // A draft takes the seller's own answers to Etsy's required questions; the
  // title, description, tags and price are read from the listing text on the server.
  etsyDraft: (productId, fields) =>
    request('/api/etsy/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, ...fields }),
    }),
  // Makes an already-saved draft live on the shop. Only fired from the Publish
  // button, after the seller confirms.
  etsyPublish: (productId) =>
    request('/api/etsy/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId }),
    }),
};

/** Polls a generation until the text is written, fails, or stops answering. */
export async function waitForText(id, { everyMs = 1500, timeoutMs = 5 * 60 * 1000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, everyMs));
    const { product } = await request(`/api/products/${id}`);
    if (product.status === 'text' || product.status === 'packaged') return product;
    if (product.status === 'failed') {
      const warnings = product.warnings || {};
      const err = new Error(warnings.error || 'The text model did not finish this listing.');
      if (warnings.issues?.length) err.issues = warnings.issues;
      err.status = warnings.status || 500;
      throw err;
    }
  }
  throw new Error('The text model took too long and stopped answering. Try again, or pick another model under Settings.');
}
