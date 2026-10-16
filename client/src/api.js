async function parse(res) {
  const type = res.headers.get('content-type') || '';
  return type.includes('application/json') ? res.json() : res.text();
}

async function request(url, options = {}) {
  let res;
  try {
    res = await fetch(url, options);
  } catch {
    throw new Error('Cannot reach the server. Is the backend running on port 4000?');
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
  health: () => request('/api/health'),
  history: () => request('/api/products'),
  get: (id) => request(`/api/products/${id}`),
  create: (productName) =>
    request('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productName }),
    }),
  // Writing a listing takes longer than one request may live, so the browser
  // starts the job and then asks for the result until it is there.
  run: (id) => request(`/api/run/${id}`, { method: 'POST' }),
  packageZip: (id) => request(`/api/products/${id}/package`, { method: 'POST' }),
  remove: (id) => request(`/api/products/${id}`, { method: 'DELETE' }),
  clearHistory: () => request('/api/products', { method: 'DELETE' }),
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
  prompt: () => request('/api/settings/prompt'),
  savePrompt: (payload) =>
    request('/api/settings/prompt', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  clearPrompt: () => request('/api/settings/prompt', { method: 'DELETE' }),
  uploadImage: (id, slotId, file) =>
    request(`/api/products/${id}/image/${slotId}`, {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    }),
  removeImage: (id, slotId) => request(`/api/products/${id}/image/${slotId}`, { method: 'DELETE' }),
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
  throw new Error('The text model took too long and stopped answering. Try again, or pick another model in Settings.');
}
