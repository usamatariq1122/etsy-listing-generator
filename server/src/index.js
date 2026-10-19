import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { config } from './config.js';
import { selectedModel } from './apikeys.js';
import { initDb } from './db.js';
import { encryptStoredKeys } from './secrets.js';
import { SECURITY_HEADERS } from './headers.js';
import { IMAGE_RULES } from './rules.js';
import { DATA_DIR, SERVER_ROOT } from './paths.js';
import { handleApi } from './api.js';

// The local dev server, for running the API on its own. Hosted, the same
// handleApi is reached through a Netlify Function instead. Day-to-day local
// work goes through `netlify dev`, which provides the database; this entry
// point is useful when you only want the API on :4000 and point DATABASE_URL
// at a Postgres of your own.

const clientDist = path.resolve(SERVER_ROOT, '..', 'client', 'dist');
const STATIC_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > IMAGE_RULES.maxBytes) {
        reject(Object.assign(new Error('That file is too large.'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function send(res, result) {
  const status = result.status || 200;
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    ...result.headers,
    'access-control-allow-origin': '*',
  });
  res.end(result.body ?? undefined);
}

function serveStatic(req, res, pathname) {
  if (!fs.existsSync(clientDist)) return false;
  const wanted = path.join(clientDist, pathname === '/' ? 'index.html' : pathname);
  if (wanted.startsWith(path.resolve(clientDist)) && fs.existsSync(wanted) && fs.statSync(wanted).isFile()) {
    res.writeHead(200, { 'content-type': STATIC_TYPES[path.extname(wanted)] || 'application/octet-stream' });
    fs.createReadStream(wanted).pipe(res);
    return true;
  }
  res.writeHead(200, { 'content-type': STATIC_TYPES['.html'] });
  fs.createReadStream(path.join(clientDist, 'index.html')).pipe(res);
  return true;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (!url.pathname.startsWith('/api/')) {
    if (req.method === 'GET' && serveStatic(req, res, url.pathname)) return;
    res.writeHead(404).end();
    return;
  }

  try {
    const raw = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? await readBody(req) : null;
    const type = String(req.headers['content-type'] || '');
    const body = raw && type.includes('application/json') && raw.length ? JSON.parse(raw.toString('utf8')) : null;
    const result = await handleApi({
      method: req.method,
      path: url.pathname.slice('/api'.length),
      query: url.searchParams.toString(),
      body,
      raw,
      cookie: req.headers.cookie,
    });
    send(res, result);
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('[error]', error);
    else console.warn(`[${status}] ${error.message}`);
    send(res, {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ error: error.message || 'Something went wrong.', ...(error.issues ? { issues: error.issues } : {}) }),
    });
  }
});

fs.mkdirSync(DATA_DIR, { recursive: true });

async function start() {
  try {
    await initDb();
    const sealed = await encryptStoredKeys();
    if (sealed) console.log(`Encrypted ${sealed} stored API key(s).`);
  } catch (error) {
    console.error('\nCould not reach the database.');
    console.error(`  ${error.message}`);
    console.error('\n  1. Normal local development is `netlify dev` from the project root: it starts');
    console.error('     Postgres, runs the functions and serves the client on one port.');
    console.error(`  2. Running this file on its own needs DATABASE_URL in ${path.join(SERVER_ROOT, '.env')}`);
    console.error('     pointing at a Postgres server.\n');
    process.exit(1);
  }

  server.listen(config.port, async () => {
    console.log(`API  http://localhost:${config.port}`);
    const { provider, model } = await selectedModel();
    console.log(`Text: asks ${provider} (${model}) first, then the other provider if it declines`);
  });
}

start();
