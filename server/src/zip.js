import path from 'node:path';
import { PassThrough } from 'node:stream';
import archiver from 'archiver';
import { textToPdf } from './pdf.js';
import { TEXT_FILES } from './documents.js';
import { documentKey, imageKey, productPrefix, zipKey } from './paths.js';
import { deleteFile, deletePrefix, fileExists, getFile, putFile } from './files.js';
import { listProductImages } from './db.js';
import { brandName } from './brand.js';

/** Renders the listing documents as PDFs and stores them. */
export async function writeDocuments(product, onlyKey) {
  const brand = await brandName();
  const files = TEXT_FILES.filter((file) => !onlyKey || file.key === onlyKey);
  await Promise.all(
    files.map(async (file) => {
      const pdf = await textToPdf(product[file.key], file.docTitle(product), file.subtitle(product), {
        cover: file.cover,
        brand,
      });
      await putFile(documentKey(product.id, file.name), pdf);
    }),
  );
}

/** Removes the stored PDFs so a stale copy is never offered for download. */
export async function removeDocuments(product, onlyKey) {
  const files = TEXT_FILES.filter((file) => !onlyKey || file.key === onlyKey);
  await Promise.all(files.map((file) => deleteFile(documentKey(product.id, file.name))));
}

/** The PDF bytes for one deliverable, rendered on demand if they are missing. */
export async function documentBytes(product, fileKey) {
  const key = documentKey(product.id, TEXT_FILES.find((file) => file.key === fileKey).name);
  const stored = await getFile(key);
  if (stored) return { key, bytes: stored };
  await writeDocuments(product, fileKey);
  return { key, bytes: await getFile(key) };
}

export const removeProductFiles = (productId) => deletePrefix(productPrefix(productId));

/** Builds etsy-listing-package.zip from the two PDFs and any uploaded images. */
export async function buildZip(product) {
  await writeDocuments(product);

  const images = await imagesForZip(product.id);
  const documents = await Promise.all(
    TEXT_FILES.map(async (file) => ({
      name: file.name,
      bytes: await getFile(documentKey(product.id, file.name)),
    })),
  );
  const parts = [...documents, ...images].filter((part) => part.bytes);

  const archive = archiver('zip', { zlib: { level: 9 } });
  const sink = new PassThrough();
  const chunks = [];
  sink.on('data', (chunk) => chunks.push(chunk));
  const finished = new Promise((resolve, reject) => {
    sink.on('end', resolve);
    sink.on('error', reject);
    archive.on('warning', reject);
    archive.on('error', reject);
  });
  archive.pipe(sink);
  for (const part of parts) archive.append(part.bytes, { name: part.name });
  archive.finalize();
  await finished;
  const bytes = Buffer.concat(chunks);

  const target = zipKey(product.id);
  await putFile(target, bytes);

  return {
    key: target,
    name: path.basename(target),
    bytes: bytes.length,
    entries: parts.map((part) => part.name),
    images: images.length,
  };
}

/** Every stored image that is still there, named for its slot and in order. */
async function imagesForZip(productId) {
  const rows = await listProductImages(productId);
  const found = await Promise.all(
    rows.map(async (row) => {
      const key = imageKey(productId, row.file_name);
      const bytes = await getFile(key);
      return bytes ? { name: row.file_name, key, bytes } : null;
    }),
  );
  return found.filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
}

export const zipExists = (productId) => fileExists(zipKey(productId));
