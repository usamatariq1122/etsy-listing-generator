import path from 'node:path';
import dotenv from 'dotenv';
import { SERVER_ROOT } from './paths.js';

// Netlify sets its own variables for the platform; server/.env is the local
// file. `netlify dev` bundles the functions into a temporary folder, where the
// source-tree path no longer reaches it, so the working directory's copy is
// tried as well. dotenv never overwrites a value that is already set, so
// platform secrets always win.
for (const candidate of [
  path.join(SERVER_ROOT, '.env'),
  path.join(process.cwd(), 'server', '.env'),
  path.join(process.cwd(), '.env'),
]) {
  dotenv.config({ path: candidate });
}

const num = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  port: num(process.env.PORT, 4000),

  // Running inside Netlify — a real deploy, or `netlify dev` with its local
  // Blobs sandbox. Listing files then live in Blobs instead of on disk.
  inNetlify: Boolean(process.env.NETLIFY || process.env.LAMBDA_TASK_ROOT),

  // `netlify dev` runs functions in a Lambda-shaped process too, and says so with
  // CONTEXT=dev and NETLIFY_DEV=true. Only a real deploy is on the open internet,
  // so only a deploy gets the password gate, the 4 MB upload cap and the Secure
  // cookie.
  deployed:
    Boolean(process.env.NETLIFY || process.env.LAMBDA_TASK_ROOT) &&
    process.env.CONTEXT !== 'dev' &&
    process.env.NETLIFY_DEV !== 'true',

  // Which text backend to call. gemini and anthropic both work.
  textProvider: (process.env.TEXT_PROVIDER || 'gemini').toLowerCase(),

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
  },

  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    // Empty means "whatever server/models.json lists first".
    textModel: process.env.GEMINI_TEXT_MODEL || '',
  },

  // Asked after Gemini when its models are busy, or before it when Settings
  // selects one of the Groq models.
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    apiKey: process.env.GROQ_API_KEY || '',
    model: process.env.GROQ_MODEL || '',
  },

  // Third text provider, reached through OpenRouter's OpenAI-compatible gateway.
  // Any model name from openrouter.ai/models can be listed in server/models.json.
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    apiKey: process.env.OPENROUTER_API_KEY || '',
    model: process.env.OPENROUTER_MODEL || '',
  },

  // Netlify's managed Postgres is handed to functions as NETLIFY_DB_URL;
  // DATABASE_URL is the name every other host uses.
  databaseUrl: process.env.DATABASE_URL || process.env.NETLIFY_DB_URL || '',

  // 32-byte key that decrypts the API keys stored in the database. See secrets.js.
  encryptionKey: process.env.ENCRYPTION_KEY || '',
};
