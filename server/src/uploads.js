import path from 'node:path';
import { checkImage } from './imageinfo.js';
import { deleteFile, getFile, listFiles, putFile } from './files.js';
import { imageKey, imagePrefix } from './paths.js';
import { imageFileName } from './slots.js';
import { deleteProductImage, getProductImage, saveProductImage } from './db.js';

const EXTENSIONS = ['.jpg', '.jpeg', '.png'];

/** Deletes every stored file for one slot, whatever extension it was saved with. */
async function removeFiles(productId, slot) {
  const entries = await listFiles(imagePrefix(productId));
  await Promise.all(
    entries
      .filter((entry) => entry.key.startsWith(`${imagePrefix(productId)}${slot.zipName}.`))
      .filter((entry) => EXTENSIONS.includes(path.extname(entry.key).toLowerCase()))
      .map((entry) => deleteFile(entry.key)),
  );
}

/**
 * Validates an upload against the listing image rules, then keeps it. Returns
 * the same shape as checkImage, so the caller can show the exact reason a file
 * was rejected.
 */
export async function storeImage(product, slot, buffer) {
  const info = checkImage(buffer);
  if (!info.ok) return info;

  const fileName = imageFileName(slot, info.format);
  await removeFiles(product.id, slot);
  await putFile(imageKey(product.id, fileName), buffer);
  await saveProductImage({
    productId: product.id,
    slotId: slot.id,
    fileName,
    width: info.width,
    height: info.height,
    format: info.format,
    bytes: info.bytes,
  });

  return info;
}

export async function dropImage(product, slot) {
  await removeFiles(product.id, slot);
  return deleteProductImage(product.id, slot.id);
}

/** Resolves a stored image to its bytes, or null if the file is gone. */
export async function resolveImage(productId, slotId) {
  const row = await getProductImage(productId, slotId);
  if (!row) return null;
  const key = imageKey(productId, row.file_name);
  const bytes = await getFile(key);
  if (!bytes) return null;
  return { key, row, bytes };
}
