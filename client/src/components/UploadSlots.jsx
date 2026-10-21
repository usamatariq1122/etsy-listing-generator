import { useState } from 'react';
import { fitImage } from '../fitImage.js';

const MB = 1024 * 1024;

const promptFor = (slot, product) =>
  (slot.promptGroup === 'mockup' ? product.mockupPrompts : product.infographicPrompts)?.[slot.promptIndex] || '';

/**
 * The server's checks, mirrored in the browser before a file is sent, so a
 * refusal becomes an offer instead of a dead end. Returns null when the upload
 * can go straight through; otherwise the message and the fixes that would
 * honestly work for this photo.
 */
async function assess(file, rules = {}) {
  const { ratio = 4 / 3, ratioTolerance = 0.02, minWidth = 2000, maxBytes = 25 * MB } = rules;
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return { message: 'That file is not a readable JPG or PNG image.' };
  }
  const { width, height } = bitmap;
  bitmap.close?.();

  const mb = Math.max(1, Math.round(maxBytes / MB));
  if (width < minWidth) {
    return { message: `Too small: ${width}px wide. Listing images need at least ${minWidth}px, and no crop or compression can add pixels.` };
  }
  const drift = Math.abs(width / height - ratio) / ratio;
  const tooBig = file.size > maxBytes;
  if (drift > ratioTolerance) {
    return {
      message:
        `Wrong shape: ${width}×${height} is ${(width / height).toFixed(3)}:1. Required is 4:3 (1.333:1), within ${Math.round(ratioTolerance * 100)}%.` +
        (tooBig ? ` It is also ${(file.size / MB).toFixed(1)} MB, over the ${mb} MB limit.` : ''),
      canCrop: true,
    };
  }
  if (tooBig) {
    return { message: `That file is ${(file.size / MB).toFixed(1)} MB. The limit is ${mb} MB.`, canCrop: true, canCompress: true };
  }
  return null;
}

export default function UploadSlots({ product, busy, onUpload, onRemove, onGenerate }) {
  const [working, setWorking] = useState(null);
  const [generating, setGenerating] = useState(null);
  const [fixes, setFixes] = useState({});
  const stored = new Map((product.images || []).map((image) => [image.slotId, image]));
  const slots = product.slots || [];
  const maxBytes = product.rules?.maxBytes || 25 * MB;
  const maxMb = Math.max(1, Math.round(maxBytes / MB));
  const minWidth = product.rules?.minWidth || 2000;
  const filled = slots.filter((slot) => stored.has(slot.id)).length;

  function clearFix(slotId) {
    setFixes((current) => {
      if (!(slotId in current)) return current;
      const { [slotId]: gone, ...rest } = current;
      return rest;
    });
  }

  async function pick(slot, event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setWorking(slot.id);
    try {
      const problem = await assess(file, product.rules || {});
      if (problem) {
        setFixes((current) => ({ ...current, [slot.id]: { ...problem, file } }));
        return;
      }
      clearFix(slot.id);
      await onUpload(slot, file);
    } finally {
      setWorking(null);
    }
  }

  /** Only ever runs from the button the seller pressed, never on its own. */
  async function fix(slot, mode) {
    const choice = fixes[slot.id];
    if (!choice) return;
    setWorking(slot.id);
    try {
      const result = await fitImage(choice.file, { mode, minWidth, maxBytes });
      if (!result.ok) {
        setFixes((current) => ({ ...current, [slot.id]: { message: result.message, file: choice.file } }));
        return;
      }
      clearFix(slot.id);
      await onUpload(slot, result.file);
    } finally {
      setWorking(null);
    }
  }

  /** Draws this slot's own prompt into the slot on the server, then refreshes. */
  async function generate(slot) {
    setGenerating(slot.id);
    try {
      await onGenerate(slot);
    } finally {
      setGenerating(null);
    }
  }

  return (
    <div className="stack">
      <p className="muted small">
        {filled} of {slots.length} listing images added. Each one must be a JPG or PNG, 4:3, at least{' '}
        {minWidth}px wide and under {maxMb} MB.
        A photo with the wrong shape or size gets a crop or compress offer first — your image is never
        changed unless you press one.
        Whatever you add here is packed into the ZIP under its own numbered name.
      </p>

      <ul className="slots">
        {slots.map((slot) => {
          const image = stored.get(slot.id);
          const prompt = promptFor(slot, product);
          const disabled = Boolean(busy) || working === slot.id || generating === slot.id;

          return (
            <li className={image ? 'slot filled' : 'slot'} key={slot.id}>
              <div className="slot-preview">
                {image ? (
                  <img
                    src={`${image.previewUrl}?v=${encodeURIComponent(String(image.uploadedAt))}`}
                    alt={slot.label}
                    loading="lazy"
                  />
                ) : (
                  <span className="slot-empty">{slot.zipName}.jpg</span>
                )}
              </div>

              <div className="slot-body">
                <div className="row-between">
                  <div>
                    <strong>{slot.label}</strong>
                    <p className="muted small">
                      {image
                        ? `${image.width} × ${image.height}px · ${(image.bytes / MB).toFixed(1)} MB · packed as ${image.fileName}`
                        : 'Nothing uploaded yet.'}
                      {working === slot.id && (fixes[slot.id] ? ' Fitting the image…' : ' Checking size and shape…')}
                      {generating === slot.id && ' Drawing the image…'}
                    </p>
                  </div>
                  <div className="row">
                    {prompt && onGenerate && (
                      <button
                        className="small"
                        onClick={() => generate(slot)}
                        disabled={Boolean(busy) || working === slot.id || Boolean(generating)}
                      >
                        {generating === slot.id ? 'Drawing…' : 'Generate image'}
                      </button>
                    )}
                    <label className="button small">
                      {image ? 'Replace image' : 'Choose image'}
                      <input
                        type="file"
                        accept="image/jpeg,image/png"
                        hidden
                        disabled={disabled}
                        onChange={(event) => pick(slot, event)}
                      />
                    </label>
                    {image && (
                      <button className="small danger" onClick={() => onRemove(slot)} disabled={Boolean(busy)}>
                        Remove
                      </button>
                    )}
                  </div>
                </div>

                {fixes[slot.id] && (
                  <div>
                    <p className="inline-error">{fixes[slot.id].message}</p>
                    <div className="row">
                      {fixes[slot.id].canCrop && (
                        <button className="small" onClick={() => fix(slot, 'crop')} disabled={disabled}>
                          Crop to 4:3 and fit this slot
                        </button>
                      )}
                      {fixes[slot.id].canCompress && (
                        <button className="small" onClick={() => fix(slot, 'compress')} disabled={disabled}>
                          Compress this image
                        </button>
                      )}
                      <button className="linklike" onClick={() => clearFix(slot.id)} disabled={Boolean(busy)}>
                        Never mind
                      </button>
                    </div>
                  </div>
                )}

                {(slot.hint || prompt) && (
                  <details className="drop">
                    <summary>
                      <span>What this image is for</span>
                      {prompt && <em className="drop-meta">prompt included</em>}
                    </summary>
                    {slot.hint && <p className="muted small">{slot.hint}</p>}
                    {prompt && <pre className="textdump">{prompt}</pre>}
                  </details>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
