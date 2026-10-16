import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const SERVER_ROOT = path.resolve(here, '..');
export const DATA_DIR = path.join(SERVER_ROOT, 'data');

// Keys are the portable name for where a file lives: `products/<id>/...`. The
// local backend puts them under data/, Netlify Blobs stores them as-is.
export const productPrefix = (id) => `products/${id}/`;
export const zipKey = (id) => `${productPrefix(id)}etsy-listing-package.zip`;
export const documentKey = (id, fileName) => `${productPrefix(id)}${fileName}`;

// Uploaded listing images live in their own folder so they never collide with
// the generated PDFs, and so the ZIP can name each entry after its slot.
export const imagePrefix = (id) => `${productPrefix(id)}images/`;
export const imageKey = (id, fileName) => `${imagePrefix(id)}${fileName}`;

export const isSafeId = (id) => typeof id === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(id);
