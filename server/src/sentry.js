import crypto from 'node:crypto';
import { config } from './config.js';

// Error tracking for Sentry, with no SDK and no dependency. Nothing is sent
// unless SENTRY_DSN is set, so an install without Sentry stays exactly as quiet
// as it always was. The DSN lives only on the server — a browser error is handed
// to /api/client-error, which calls reportError here — so the write-only DSN is
// never embedded in a shipped bundle.

/** https://<key>@<host>/<project>  (and the http:// and no-host variants). */
export function parseDsn(dsn) {
  if (!dsn) return null;
  let url;
  try {
    url = new URL(dsn);
  } catch {
    return null;
  }
  const key = url.username;
  const project = url.pathname.replace(/^\//, '');
  if (!key || !project) return null;
  const base = `${url.protocol}//${url.host}`;
  return { key, project, base };
}

const parsed = parseDsn(config.sentryDsn);

const framesOf = (error) => {
  const lines = String(error?.stack || '').split('\n').slice(1, 20);
  return { frames: lines.map((filename) => ({ filename: filename.trim() })) };
};

/**
 * Posts one error event to Sentry. Never throws and never waits: a broken error
 * reporter must not take down the request it was meant to describe. Returns a
 * promise only so a caller may await it in a background function's shutdown.
 */
export function reportError(error, { source = 'server', requestId } = {}) {
  if (!parsed) return Promise.resolve(false);
  const event = {
    event_id: crypto.randomUUID().replace(/-/g, ''),
    timestamp: Date.now() / 1000,
    platform: 'node',
    level: 'error',
    environment: config.environment,
    message: `${source}: ${error?.message || 'Unknown error'}`,
    server_name: source,
    exception: {
      values: [
        {
          type: error?.name || 'Error',
          value: error?.message || 'Unknown error',
          stacktrace: framesOf(error),
        },
      ],
    },
    tags: { source, ...(requestId ? { request_id: requestId } : {}) },
  };

  const target = `${parsed.base}/api/${parsed.project}/store/?sentry_key=${parsed.key}&sentry_client=listora-node/1.0`;
  return fetch(target, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(event),
  })
    .then((response) => response.ok)
    .catch(() => false);
}

export const sentryEnabled = () => Boolean(parsed);
