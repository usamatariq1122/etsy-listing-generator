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

  // How many listing generations one account may start per day. A fresh deploy
  // is on the open internet, so a signed-in user is capped rather than free to
  // spend the server's model quota all day. Admins are exempt. Set
  // GENERATION_DAILY_LIMIT=0 to remove the cap entirely.
  generation: {
    dailyLimit: num(process.env.GENERATION_DAILY_LIMIT, 20),
  },

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

  // Free image generation for the listing slots. Cloudflare Workers AI runs on
  // the seller's own account when these are set — it spends none of ours — and
  // Pollinations.ai answers when they are not, needing no key at all. The model
  // name is any image model from the seller's Workers AI catalogue.
  cloudflare: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID || '',
    apiToken: process.env.CLOUDFLARE_API_TOKEN || '',
    model: process.env.CLOUDFLARE_IMAGE_MODEL || '@cf/stabilityai/stable-diffusion-xl-base-1.0',
  },

  // 32-byte key that decrypts the API keys stored in the database. See secrets.js.
  encryptionKey: process.env.ENCRYPTION_KEY || '',

  // Sentry error tracking. Off until a DSN is supplied, and the DSN never leaves
  // the server: the browser hands its errors to /api/client-error, which reports
  // them here. See sentry.js.
  sentryDsn: process.env.SENTRY_DSN || '',
  environment: process.env.SENTRY_ENVIRONMENT || process.env.CONTEXT || 'development',

  // Email for account verification and password reset. Either transport works
  // and Resend wins when its key is present. Off until one is configured: with
  // no mail the portal still creates and signs in accounts, it just cannot
  // deliver a link. `from` must be a sender the chosen provider accepts - for
  // SMTP that is normally the same address as SMTP_USER. See email.js.
  mail: {
    apiKey: process.env.RESEND_API_KEY || '',
    from: process.env.MAIL_FROM || 'Listora <onboarding@resend.dev>',
    replyTo: process.env.MAIL_REPLY_TO || '',
    smtp: {
      host: process.env.SMTP_HOST || '',
      port: num(process.env.SMTP_PORT, 465),
      // 465 speaks TLS from the first byte, every other port (587) starts in
      // plaintext and upgrades. Port 25 is blocked on serverless, so never use
      // it. Set SMTP_SECURE=true|false to overrule the port guess.
      secure: process.env.SMTP_SECURE
        ? process.env.SMTP_SECURE === 'true'
        : num(process.env.SMTP_PORT, 465) === 465,
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
  },

  // The contact address shown in the app (footer, Etsy panel, legal pages). Etsy's
  // API terms require a reachable contact for the app; set CONTACT_EMAIL to it.
  // Falls back to the mail reply-to so the two stay in step. Never invents one.
  contactEmail: process.env.CONTACT_EMAIL || process.env.MAIL_REPLY_TO || '',
  // The public origin of this deployment, used to build emailed links. Falls back
  // to Netlify's URL when deployed; set SITE_URL locally if you want mail links
  // to work against `netlify dev`.
  siteUrl: (process.env.SITE_URL || process.env.URL || process.env.DEPLOY_PRIME_URL || '').replace(/\/$/, ''),

  // Etsy Open API v3, off unless you say so. Nothing in the interface mentions
  // Etsy while `enabled` is false, and the ZIP export path never reads these.
  // The two credential strings come from an app registered at
  // etsy.com/developers; the keystring alone is useless without the shared
  // secret, so both are secrets and neither is ever sent to the browser.
  etsy: {
    enabled: String(process.env.ETSY_ENABLED || '').toLowerCase() === 'true',
    keystring: process.env.ETSY_KEYSTRING || '',
    sharedSecret: process.env.ETSY_SHARED_SECRET || '',
    // Must match a callback URL registered for the app character for character.
    redirectUri: process.env.ETSY_REDIRECT_URI || '',
  },
};
