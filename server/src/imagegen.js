import { config } from './config.js';
import { HttpError } from './httperror.js';

// A listing image, drawn from the prompt the text model already wrote for that
// slot. Two free backends: Cloudflare Workers AI when the seller has connected
// their own account, and Pollinations.ai otherwise, which needs no key at all.
// The bytes that come back are handed straight to the same slot checks an
// upload goes through — this never lets an image into a slot that a hand-picked
// JPG would have been refused for.

// 4:3 and above the 2000px width the listing rules demand, so a generated image
// clears the same gate a real photograph does.
const REQUEST = { width: 2048, height: 1536 };

const TIMEOUT = 90_000;

async function fetchImage(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const looksLikeImage = (buffer) =>
  buffer.length > 12 &&
  ((buffer[0] === 0xff && buffer[1] === 0xd8) || buffer.readUInt32BE(0) === 0x89504e47);

/** Pollinations needs no account: the prompt is the whole request. */
async function fromPollinations(prompt, seed) {
  const url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
    `?width=${REQUEST.width}&height=${REQUEST.height}&nologo=true&seed=${seed}`;
  const response = await fetchImage(url);
  if (!response.ok) {
    throw new HttpError(`The image service replied ${response.status}. Try the slot again in a moment.`, 502);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!looksLikeImage(buffer)) {
    throw new HttpError('The image service did not send back a usable picture. Try again.', 502);
  }
  return buffer;
}

/**
 * Cloudflare Workers AI, on the seller's own account so it spends none of ours.
 * The run endpoint answers with base64 image bytes for an image model.
 */
async function fromCloudflare(prompt, seed) {
  const { accountId, apiToken, model } = config.cloudflare;
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
  const response = await fetchImage(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ prompt, width: REQUEST.width, height: REQUEST.height, seed }),
  });
  if (!response.ok) {
    throw new HttpError(`Cloudflare replied ${response.status}. Check the account id and token in Settings.`, 502);
  }
  const payload = await response.json();
  const encoded = payload?.result?.image ?? payload?.result?.images?.[0] ?? payload?.result;
  if (typeof encoded !== 'string') {
    throw new HttpError('Cloudflare did not return an image for that prompt. Try a different slot.', 502);
  }
  const buffer = Buffer.from(encoded, 'base64');
  if (!looksLikeImage(buffer)) throw new HttpError('Cloudflare returned something that is not an image.', 502);
  return buffer;
}

export const imageProviderReady = () =>
  Boolean(config.cloudflare.accountId && config.cloudflare.apiToken) || true;

/**
 * Draws one image for a slot prompt. Cloudflare is asked first when it is set
 * up, otherwise (or if it fails) Pollinations answers. A blank prompt is the
 * seller's cue to generate the listing text first.
 */
export async function generateImage(prompt, { seed = Math.floor(Math.random() * 1_000_000) } = {}) {
  const text = String(prompt ?? '').trim();
  if (!text) {
    throw new HttpError('This slot has no prompt yet. Generate the listing text first.', 409);
  }

  const hasCloudflare = Boolean(config.cloudflare.accountId && config.cloudflare.apiToken);
  if (hasCloudflare) {
    try {
      return { buffer: await fromCloudflare(text, seed), provider: 'cloudflare' };
    } catch (error) {
      // A dead Cloudflare call should not lose the image — fall through to the
      // free service and only give up if that one fails too.
      if (!(error instanceof HttpError)) throw error;
    }
  }
  return { buffer: await fromPollinations(text, seed), provider: 'pollinations' };
}
