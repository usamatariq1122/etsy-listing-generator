import { IMAGE_RULES } from './rules.js';

// Image dimensions are read straight from the file header, so no native image
// library has to be installed. JPG and PNG are the two formats a listing
// accepts anyway.

function png(buffer) {
  if (buffer.length < 24 || buffer.readUInt32BE(0) !== 0x89504e47) return null;
  if (buffer.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), format: 'png' };
}

// A JPEG is a chain of markers; SOFn frames carry the frame height and width.
const SOF = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function jpeg(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let i = 2;
  while (i < buffer.length - 9) {
    if (buffer[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buffer[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const size = buffer.readUInt16BE(i + 2);
    if (size < 2) return null;
    if (SOF.has(marker)) {
      return {
        height: buffer.readUInt16BE(i + 5),
        width: buffer.readUInt16BE(i + 7),
        format: 'jpeg',
      };
    }
    i += 2 + size;
  }
  return null;
}

/** Reads width, height and format from a JPG or PNG buffer. */
export function imageDimensions(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return null;
  return jpeg(buffer) || png(buffer);
}

/**
 * Applies the brief's image rules to an upload: 4:3 within tolerance, at least
 * 2000px wide, JPG or PNG, and not absurdly large.
 */
export function checkImage(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    return { ok: false, message: 'That file is empty. Choose a JPG or PNG.' };
  }
  if (buffer.length > IMAGE_RULES.maxBytes) {
    const mb = Math.round(IMAGE_RULES.maxBytes / 1024 / 1024);
    return { ok: false, message: `That file is too large. The limit is ${mb} MB.` };
  }

  const meta = imageDimensions(buffer);
  if (!meta) return { ok: false, message: 'That file is not a readable JPG or PNG image.' };

  const { width, height } = meta;
  if (!width || !height) return { ok: false, message: 'Could not read the image dimensions.' };

  const ratio = width / height;
  const drift = Math.abs(ratio - IMAGE_RULES.ratio) / IMAGE_RULES.ratio;

  if (width < IMAGE_RULES.minWidth) {
    return {
      ok: false,
      width,
      height,
      message: `Too small: ${width}px wide. Listing images need at least ${IMAGE_RULES.minWidth}px.`,
    };
  }
  if (drift > IMAGE_RULES.ratioTolerance) {
    return {
      ok: false,
      width,
      height,
      message: `Wrong shape: ${width}x${height} is ${ratio.toFixed(3)}:1. Required is 4:3 (1.333:1), within ${Math.round(IMAGE_RULES.ratioTolerance * 100)}%.`,
    };
  }

  return { ok: true, width, height, format: meta.format, ratio: Number(ratio.toFixed(3)), bytes: buffer.length };
}
