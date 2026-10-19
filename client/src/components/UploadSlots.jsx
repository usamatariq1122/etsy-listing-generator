import { useState } from 'react';

const MB = 1024 * 1024;

const promptFor = (slot, product) =>
  (slot.promptGroup === 'mockup' ? product.mockupPrompts : product.infographicPrompts)?.[slot.promptIndex] || '';

export default function UploadSlots({ product, busy, onUpload, onRemove }) {
  const [working, setWorking] = useState(null);
  const stored = new Map((product.images || []).map((image) => [image.slotId, image]));
  const slots = product.slots || [];
  const maxMb = Math.max(1, Math.round((product.rules?.maxBytes || 25 * MB) / MB));
  const minWidth = product.rules?.minWidth || 2000;
  const filled = slots.filter((slot) => stored.has(slot.id)).length;

  async function pick(slot, event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setWorking(slot.id);
    try {
      await onUpload(slot, file);
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className="stack">
      <p className="muted small">
        {filled} of {slots.length} listing images added. Each one must be a JPG or PNG, 4:3, at least
        {minWidth}px wide and under {maxMb} MB.
        Whatever you add here is packed into the ZIP under its own numbered name.
      </p>

      <ul className="slots">
        {slots.map((slot) => {
          const image = stored.get(slot.id);
          const prompt = promptFor(slot, product);
          const disabled = Boolean(busy) || working === slot.id;

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
                      {working === slot.id && ' Checking size and shape…'}
                    </p>
                  </div>
                  <div className="row">
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
