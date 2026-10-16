import { handleApi } from '../../server/src/api.js';
import { initDb } from '../../server/src/db.js';

// Every /api/* route except the generation job, which needs longer than a
// normal invocation and lives in run.mjs.

let schema;

export default async (request) => {
  schema ??= initDb().catch((error) => console.error('[db]', error.message));
  await schema;

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
    return new Response(result.body, { status: result.status, headers: result.headers });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('[api]', error);
    return Response.json(
      { error: error.message || 'Something went wrong.', ...(error.issues ? { issues: error.issues } : {}) },
      { status },
    );
  }
};

export const config = {
  path: '/api/*',
  excludedPath: '/api/run/*',
};
