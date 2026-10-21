import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';
import { HttpError } from '../src/httperror.js';
import { generateImage } from '../src/imagegen.js';

// A 16-byte buffer whose header says "JPEG" is all looksLikeImage checks for;
// the real slot rules are exercised by storeImage, not here. Uint8Array.from
// gives a standalone ArrayBuffer (Node buffers are pooled), which is what
// response.arrayBuffer() has to hand back.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(16, 7)]);
const JPEG_BUFFER = Uint8Array.from(JPEG).buffer;

let restore = null;
const stubFetch = (impl) => {
  restore = globalThis.fetch;
  globalThis.fetch = impl;
};
afterEach(() => {
  if (restore) {
    globalThis.fetch = restore;
    restore = null;
  }
  config.cloudflare = { accountId: '', apiToken: '', model: '@cf/x' };
});

test('Pollinations answers with no key when Cloudflare is not configured', async () => {
  const calls = [];
  stubFetch(async (url) => {
    calls.push(url);
    return { ok: true, status: 200, arrayBuffer: async () => JPEG_BUFFER };
  });
  const { buffer, provider } = await generateImage('a soft bucket hat');
  assert.equal(provider, 'pollinations');
  assert.ok(buffer[0] === 0xff && buffer[1] === 0xd8);
  assert.match(calls[0], /^https:\/\/image\.pollinations\.ai\/prompt\//);
  assert.match(calls[0], /width=2048&height=1536/);
});

test('a blank prompt is refused before any network call', async () => {
  stubFetch(() => { throw new Error('should not fetch'); });
  await assert.rejects(() => generateImage('   '), HttpError);
});

test('Cloudflare base64 is used when the account is set', async () => {
  config.cloudflare = { accountId: 'acct', apiToken: 'tok', model: '@cf/sdxl' };
  stubFetch(async (url, init) => {
    assert.match(url, /accounts\/acct\/ai\/run/);
    assert.equal(init.method, 'POST');
    return { ok: true, status: 200, json: async () => ({ result: { image: JPEG.toString('base64') } }) };
  });
  const { provider } = await generateImage('cover shot');
  assert.equal(provider, 'cloudflare');
});

test('a failed Cloudflare call falls back to Pollinations', async () => {
  config.cloudflare = { accountId: 'acct', apiToken: 'tok', model: '@cf/sdxl' };
  stubFetch(async (url) => {
    if (url.includes('cloudflare')) return { ok: false, status: 500 };
    return { ok: true, status: 200, arrayBuffer: async () => JPEG_BUFFER };
  });
  const { provider } = await generateImage('lifestyle');
  assert.equal(provider, 'pollinations');
});

test('a non-image body from the service is refused', async () => {
  stubFetch(async () => ({ ok: true, status: 200, arrayBuffer: async () => Buffer.from('not an image at all, no header').buffer }));
  await assert.rejects(() => generateImage('anything'), /not send back a usable picture/);
});
