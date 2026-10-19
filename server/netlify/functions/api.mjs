import { handleApi } from '../../src/api.js';
import { initDb } from '../../src/db.js';
import { encryptStoredKeys } from '../../src/secrets.js';
import { SECURITY_HEADERS } from '../../src/headers.js';

// Every /api/* route except the generation job, which needs longer than a
// normal invocation and lives in run.mjs.

let ready;

/** Once per cold start: make sure the schema is there, then seal any key row
 *  that was stored before ENCRYPTION_KEY existed. */
async function boot() {
  await initDb();
  const sealed = await encryptStoredKeys();
  if (sealed) console.log(`[secrets] encrypted ${sealed} stored key(s)`);
}

export default async (request) => {
  ready ??= boot().catch((error) => console.error('[db]', error.message));
  await ready;

  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const wantsBody = method !== 'GET' && method !== 'HEAD';
  const raw = wantsBody && request.body ? new Uint8Array(await request.arrayBuffer()) : null;
  const type = request.headers.get('content-type') || '';
  let body = null;
  if (raw && raw.length && type.includes('application/json')) {
    try {
      body = JSON.parse(new TextDecoder().decode(raw));
    } catch {
      return Response.json({ error: 'The request body is not valid JSON.' }, { status: 400 });
    }
  }

  try {
    const result = await handleApi({
      method,
      path: url.pathname.replace(/^\/api/, ''),
      query: url.searchParams.toString(),
      body,
      raw,
      cookie: request.headers.get('cookie'),
    });
    return new Response(result.body, {
      status: result.status,
      headers: { ...SECURITY_HEADERS, ...result.headers },
    });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('[api]', error);
    return Response.json(
      { error: error.message || 'Something went wrong.', ...(error.issues ? { issues: error.issues } : {}) },
      { status, headers: SECURITY_HEADERS },
    );
  }
};

export const config = {
  path: '/api/*',
  excludedPath: '/api/run/*',
};
