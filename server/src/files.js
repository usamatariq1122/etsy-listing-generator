import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './paths.js';

// One place decides where a listing's files live: the disk while you run this
// locally, Netlify Blobs once it is deployed. Everything above this module
// speaks in keys like `products/<id>/images/01-cover.jpg`.

const STORE = 'listing-files';

export const onNetlify = () => Boolean(process.env.NETLIFY || process.env.LAMBDA_TASK_ROOT);

const store = () => import('@netlify/blobs').then(({ getStore }) => getStore({ name: STORE, consistency: 'strong' }));

const extTypes = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.zip': 'application/zip',
};

export const contentTypeFor = (key) => extTypes[path.extname(key).toLowerCase()] || 'application/octet-stream';

const localFile = (key) => {
  const file = path.join(DATA_DIR, path.normalize(key).replace(/^(\.\.[\\/])+/, ''));
  if (!file.startsWith(path.resolve(DATA_DIR))) throw new Error('Rejected a file path outside the data folder.');
  return file;
};

export async function putFile(key, data) {
  if (onNetlify()) {
    const blobs = await store();
    await blobs.set(key, data);
    return;
  }
  const file = localFile(key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, data);
}

/** Returns the bytes, or null when the key was never written or is gone. */
export async function getFile(key) {
  if (onNetlify()) {
    const blobs = await store();
    const value = await blobs.get(key, { type: 'arrayBuffer' });
    return value === null ? null : Buffer.from(value);
  }
  try {
    return await fs.readFile(localFile(key));
  } catch {
    return null;
  }
}

export async function fileSize(key) {
  if (onNetlify()) {
    const blobs = await store();
    const meta = await blobs.getMetadata(key);
    return meta?.etag ? meta.size ?? null : null;
  }
  try {
    return (await fs.stat(localFile(key))).size;
  } catch {
    return null;
  }
}

export const fileExists = async (key) => (await fileSize(key)) !== null;

export async function deleteFile(key) {
  if (onNetlify()) {
    const blobs = await store();
    await blobs.delete(key);
    return;
  }
  await fs.rm(localFile(key), { force: true });
}

/** Removes every file of one product; best effort, callers keep going either way. */
export async function deletePrefix(prefix) {
  if (onNetlify()) {
    const blobs = await store();
    const { blobs: entries } = await blobs.list({ prefix });
    await Promise.all(entries.map((entry) => blobs.delete(entry.key)));
    return;
  }
  await fs.rm(localFile(prefix), { recursive: true, force: true });
}

/** Keys under a prefix, sorted, with their sizes. */
export async function listFiles(prefix) {
  if (onNetlify()) {
    const blobs = await store();
    const { blobs: entries } = await blobs.list({ prefix });
    return entries
      .map((entry) => ({ key: entry.key, size: Number(entry.length ?? 0) }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }
  const walk = async (dir, depth = 0) => {
    let names;
    try {
      names = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    const found = await Promise.all(
      names.map(async (entry) => {
        const key = path.relative(path.resolve(DATA_DIR), path.join(dir, entry.name)).split(path.sep).join('/');
        if (entry.isDirectory()) return walk(path.join(dir, entry.name), depth + 1);
        return [{ key, size: (await fs.stat(path.join(dir, entry.name))).size }];
      }),
    );
    return found.flat();
  };
  const all = await walk(localFile(prefix).replace(/[\\/]$/, ''));
  return all.sort((a, b) => a.key.localeCompare(b.key));
}
