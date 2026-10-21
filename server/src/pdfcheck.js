import { PDF_RULES } from './rules.js';

// A PDF upload is checked the same way an image is: read what the file says it
// is, refuse anything that is not one, and never trust the extension. Only the
// header and the trailer are looked at, so a whole PDF never has to be parsed.

const HEADER = '%PDF-';
const TRAILER = '%%EOF';

/** True when the bytes start with a PDF header and end with its trailer. */
function isPdf(buffer) {
  if (buffer.length < 32) return false;
  if (!buffer.subarray(0, 1024).includes(HEADER)) return false;
  return buffer.subarray(Math.max(0, buffer.length - 4096)).includes(TRAILER);
}

export function checkPdf(buffer, maxBytes = PDF_RULES.maxBytes) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    return { ok: false, message: 'That file is empty. Choose a PDF.' };
  }
  if (buffer.length > maxBytes) {
    return {
      ok: false,
      message: `That file is ${(buffer.length / 1024 / 1024).toFixed(1)} MB. The limit for a PDF here is ${(maxBytes / 1024 / 1024).toFixed(0)} MB.`,
    };
  }
  if (!isPdf(buffer)) {
    return { ok: false, message: 'That file is not a PDF, whatever it is called. Export it as a PDF and try again.' };
  }
  return { ok: true, bytes: buffer.length, format: 'pdf' };
}
