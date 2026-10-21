// Phase 5.3 helper: turn a refused photo into an acceptable slot image in the
// browser — centre-crop it to exactly 4:3 and/or re-encode it under the size
// budget. Never automatic: a component calls this only when the seller presses
// the button. The output is always 4:3 (crop mode) and never narrower than
// minWidth; when the photo cannot fit both rules and the budget at once this
// refuses with a plain-words reason instead of returning a file the server
// would reject.

const MB = 1024 * 1024;

// Quality first, pixels second: try the best JPEG, step the quality down, and
// only shrink the size as far as the budget still asks for.
const QUALITIES = [0.9, 0.85, 0.8, 0.75, 0.7];

const toBlob = (canvas, type, quality) =>
  new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), type, quality));

/**
 * @param file    the seller's original JPG or PNG, untouched unless this returns ok
 * @param options.mode       'crop' = centre-crop to 4:3 and fit the budget,
 *                           'compress' = keep the shape, only re-encode smaller
 * @param options.minWidth   the server's width floor; never scaled below it
 * @param options.maxBytes   the size budget — on a hosted build this is the low
 *                           request cap (about 4 MB), not the 25 MB desktop limit
 */
export async function fitImage(file, options = {}) {
  const { mode = 'crop', minWidth = 2000, maxBytes = 25 * MB } = options;

  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return { ok: false, message: 'This browser could not read that image, so nothing was changed. Only JPG and PNG can be fixed here.' };
  }

  try {
    // A PNG stays a PNG — a JPEG would turn any transparency black.
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    let sx = 0;
    let sy = 0;
    let sw = bitmap.width;
    let sh = bitmap.height;

    if (mode === 'crop') {
      // The largest exact 4:3 block inside the photo, taken from the centre.
      const d = Math.floor(Math.min(bitmap.width / 4, bitmap.height / 3));
      sw = d * 4;
      sh = d * 3;
      sx = Math.round((bitmap.width - sw) / 2);
      sy = Math.round((bitmap.height - sh) / 2);
    }

    if (sw < minWidth) {
      return {
        ok: false,
        message:
          mode === 'crop'
            ? `A 4:3 crop of this ${bitmap.width}×${bitmap.height}px photo is only ${sw}px wide, under the ${minWidth}px the listing needs. No crop can add pixels that were never there, so this photo cannot be fixed — use a wider one.`
            : `Too small to rescue: ${bitmap.width}px wide, under the ${minWidth}px minimum. Making it bigger would only blur it.`,
      };
    }

    const name = `${String(file.name).replace(/\.[^.]+$/, '')}${type === 'image/png' ? '.png' : '.jpg'}`;
    let cw = sw;
    let smallest = 0;
    for (let round = 0; round < 4; round += 1) {
      const ch = mode === 'crop' ? Math.round((cw * 3) / 4) : Math.round((cw * sh) / sw);
      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, cw, ch);

      const ladder = type === 'image/png' ? [undefined] : QUALITIES;
      for (const quality of ladder) {
        const blob = await toBlob(canvas, type, quality);
        if (!blob) {
          return { ok: false, message: 'This browser could not re-encode that image, so nothing was changed.' };
        }
        if (blob.size <= maxBytes) {
          return { ok: true, file: new File([blob], name, { type }), width: cw, height: ch, bytes: blob.size };
        }
        smallest = blob.size; // the last rung of the ladder is the smallest try
      }

      if (cw <= minWidth) break;
      // Down only as far as the budget needs, and never under the width floor.
      cw = Math.max(minWidth, Math.floor((cw * Math.sqrt(maxBytes / smallest)) / 4) * 4);
    }

    const mb = (maxBytes / MB).toFixed(1);
    return {
      ok: false,
      message:
        type === 'image/png'
          ? `Even at ${minWidth}px wide this PNG will not squeeze under ${mb} MB in the browser. Re-export the image as a smaller JPG and upload that.`
          : `Even at ${minWidth}px wide and a firm compression it stays over ${mb} MB. Export a smaller JPG from your camera app or editor.`,
    };
  } finally {
    bitmap.close?.();
  }
}
