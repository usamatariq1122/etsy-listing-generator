import path from 'node:path';
import { PassThrough } from 'node:stream';
import archiver from 'archiver';
import { textToPdf } from './pdf.js';
import { TEXT_FILES } from './documents.js';
import { documentKey, imageKey, productPrefix, uploadedDocumentKey, zipKey } from './paths.js';
import { deleteFile, deletePrefix, fileExists, getFile, putFile } from './files.js';
import {
  deleteProductDocument,
  getProductDocument,
  listProductImages,
  saveProductDocument,
} from './db.js';
import { brandName } from './brand.js';
import { themeColors } from './theme.js';

/**
 * Renders the listing documents as PDFs and stores them. The bytes are returned
 * per file key because the storage behind this is not guaranteed to hand back a
 * file in the same call that wrote it, and no caller should have to guess.
 */
export async function writeDocuments(product, onlyKey) {
  const brand = await brandName();
  const theme = await themeColors();
  const files = TEXT_FILES.filter((file) => !onlyKey || file.key === onlyKey);
  const rendered = await Promise.all(
    files.map(async (file) => {
      const pdf = await textToPdf(product[file.key], file.docTitle(product), file.subtitle(product), {
        cover: file.cover,
        brand,
        theme,
      });
      await putFile(documentKey(product.id, file.name), pdf);
      // A PDF the seller uploaded stays the one being packed, so its row is left alone.
      const row = await getProductDocument(product.id, file.key);
      if (row?.source !== 'uploaded') {
        await saveProductDocument({
          productId: product.id,
          fileKey: file.key,
          source: 'generated',
          fileName: file.name,
          bytes: pdf.length,
        });
      }
      return [file.key, pdf];
    }),
  );
  return new Map(rendered);
}

/**
 * Removes the PDFs this portal rendered, so a stale copy is never offered for
 * download. An uploaded PDF belongs to the seller and is kept.
 */
export async function removeDocuments(product, onlyKey) {
  const files = TEXT_FILES.filter((file) => !onlyKey || file.key === onlyKey);
  await Promise.all(
    files.map(async (file) => {
      await deleteFile(documentKey(product.id, file.name));
      const row = await getProductDocument(product.id, file.key);
      if (row?.source !== 'uploaded') await deleteProductDocument(product.id, file.key);
    }),
  );
}

/** The PDF bytes for one deliverable, rendering them first if they are missing. */
export async function documentBytes(product, fileKey) {
  const file = TEXT_FILES.find((entry) => entry.key === fileKey);
  const generated = documentKey(product.id, file.name);
  const row = await getProductDocument(product.id, fileKey);

  if (row?.source === 'uploaded') {
    const uploaded = await getFile(uploadedDocumentKey(product.id, row.file_name));
    if (uploaded) return { key: uploadedDocumentKey(product.id, row.file_name), name: file.name, bytes: uploaded };
    await deleteProductDocument(product.id, fileKey);
  } else {
    const stored = await getFile(generated);
    if (stored) return { key: generated, name: file.name, bytes: stored };
  }

  const rendered = await writeDocuments(product, fileKey);
  return { key: generated, name: file.name, bytes: rendered.get(fileKey) ?? null };
}

/**
 * Keeps a PDF the seller uploaded in place of the one this portal would render.
 * It is stored under the deliverable's own name so the ZIP entry never changes.
 */
export async function keepUploadedPdf(product, file, originalName, buffer) {
  await putFile(uploadedDocumentKey(product.id, file.name), buffer);
  await saveProductDocument({
    productId: product.id,
    fileKey: file.key,
    source: 'uploaded',
    fileName: file.name,
    originalName,
    bytes: buffer.length,
  });
}

/** Forgets an upload and goes back to the PDF rendered from the listing text. */
export async function restoreGeneratedPdf(product, file) {
  await deleteFile(uploadedDocumentKey(product.id, file.name));
  await deleteProductDocument(product.id, file.key);
  const stored = await getFile(documentKey(product.id, file.name));
  if (stored) {
    await saveProductDocument({
      productId: product.id,
      fileKey: file.key,
      source: 'generated',
      fileName: file.name,
      bytes: stored.length,
    });
  }
}

export const removeProductFiles = (productId) => deletePrefix(productPrefix(productId));

/** Builds the listing package ZIP: the two PDFs plus any uploaded images. */
export async function buildZip(product) {
  const images = await imagesForZip(product.id);
  const documents = (
    await Promise.all(TEXT_FILES.map(async (file) => documentBytes(product, file.key)))
  ).map((found) => ({ name: found.name, bytes: found.bytes }));
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
    documents: documents.filter((part) => part.bytes).length,
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
