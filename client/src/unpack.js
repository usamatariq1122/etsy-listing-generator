import { unzip } from 'fflate';

const MB = 1024 * 1024;

export const MAX_IMAGES = 7;
// Uncompressed guard: a small ZIP can hide a very large archive.
const MAX_TOTAL_BYTES = 100 * MB;

const IMAGE = /\.(jpe?g|png)$/i;
const NESTED = /\.(zip|tar|gz|tgz|bz2|xz|7z|rar)$/i;
// Finder and Explorer housekeeping, never a listing photo.
const NOISE = /(^|\/)(?:__MACOSX\/|\._|\.DS_Store$|Thumbs\.db$|desktop\.ini$)/i;

const baseName = (name) => String(name).split(/[/\\]/).pop();

/** A member name that tries to leave the archive is refused, not extracted. */
const isUnsafe = (name) => /(?:^|[/\\])\.\.(?:[/\\]|$)/.test(name) || /^([a-zA-Z]:)?[/\\]/.test(name);

const typeOf = (name) => (/\.png$/i.test(name) ? 'image/png' : 'image/jpeg');

/**
 * Opens one ZIP in the browser and returns its images in file-name order.
 * Nothing is written to disk, so an archive cannot place a file anywhere — the
 * images only ever leave again through the per-slot upload route, where the
 * size and shape rules are applied by the server.
 */
export function unpackZip(file) {
  return file.arrayBuffer().then(
    (buffer) =>
      new Promise((resolve, reject) => {
        const seen = { images: 0, ignored: 0, bytes: 0 };
        let problem = '';

        const fail = (message) => {
          if (!problem) problem = message;
          return false;
        };

        unzip(new Uint8Array(buffer), {
          filter: (entry) => {
            if (problem) return false;
            const name = entry.name;
            if (NOISE.test(name)) return false;
            if (isUnsafe(name)) return fail('That ZIP holds a file with an unsafe path, so nothing was opened.');
            if (NESTED.test(name)) return fail('That ZIP contains another archive. Put the JPG or PNG files in it directly.');
            if (!IMAGE.test(name)) {
              seen.ignored += 1;
              return false;
            }
            // Only stored (0) and deflate (8) are readable in the browser.
            if (entry.compression !== 0 && entry.compression !== 8) {
              return fail('That ZIP uses a compression this browser cannot read. Rezip it as a normal ZIP.');
            }
            seen.images += 1;
            if (seen.images > MAX_IMAGES) return fail(`The ZIP holds ${seen.images} images. This listing has ${MAX_IMAGES} slots.`);
            seen.bytes += entry.originalSize;
            if (seen.bytes > MAX_TOTAL_BYTES) {
              return fail(`Unpacked those images would be ${(seen.bytes / MB).toFixed(0)} MB. Keep the set under ${MAX_TOTAL_BYTES / MB} MB.`);
            }
            return true;
          },
        }, (error, files) => {
          if (problem) return reject(new Error(problem));
          if (error) return reject(new Error('That ZIP could not be opened. Zip the images again and try once more.'));
          const images = Object.entries(files)
            .map(([name, bytes]) => ({ name: baseName(name), file: new File([bytes], baseName(name), { type: typeOf(name) }) }))
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
          if (!images.length) return reject(new Error('That ZIP has no JPG or PNG images inside.'));
          resolve({ images, ignored: seen.ignored });
        });
      }),
  );
}
