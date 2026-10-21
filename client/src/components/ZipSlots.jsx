import { useState } from 'react';
import { fitImage } from '../fitImage.js';

const MB = 1024 * 1024;

const slotLabel = (slots, id) => slots.find((slot) => slot.id === id)?.label || id;

// The server's own refusal words decide what can honestly be offered: a wrong
// shape needs the 4:3 crop, an oversize file can also just be re-encoded, and
// a too-small photo gets nothing — no browser trick invents pixels.
const croppable = (message) => /shape|too large|accepts listing images/i.test(message);
const compressible = (message) => /too large|accepts listing images/i.test(message);

/**
 * The files from the ZIP, one per slot, in slot order. Choosing another slot
 * swaps the two, so every image always has a home and nothing is guessed.
 * A refused image gets a crop or compress button — the file is only ever
 * changed when the seller presses one, and the result is re-checked by the
 * server on the next Fill.
 */
export default function ZipSlots({ slots, staged, busy, rules, onAssign, onRemove, onFill, onClear, onReplaceFile }) {
  const [working, setWorking] = useState('');
  const [note, setNote] = useState('');
  const order = new Map(slots.map((slot, index) => [slot.id, index]));
  const ordered = [...staged].sort((a, b) => (order.get(a.slotId) ?? 99) - (order.get(b.slotId) ?? 99));
  const accepted = staged.filter((item) => item.status === 'ok').length;
  const refused = staged.filter((item) => item.status === 'fail').length;
  const maxBytes = rules?.maxBytes || 25 * MB;
  const minWidth = rules?.minWidth || 2000;

  async function fix(item, mode) {
    setWorking(item.key);
    setNote('');
    try {
      const result = await fitImage(item.file, { mode, minWidth, maxBytes });
      if (result.ok) onReplaceFile(item.key, result.file);
      else setNote(result.message);
    } finally {
      setWorking('');
    }
  }

  return (
    <div className="stack">
      <p className="muted small">
        {staged.length} images from the ZIP, mapped to the slots in file-name order. Swap two files by
        choosing the other slot. Nothing is uploaded until you click the button, and every image is still
        checked against the 4:3 and 2000px rules then. A refused image offers a crop or compress —
        nothing is changed unless you press one.
      </p>

      <ul className="staged">
        {ordered.map((item) => (
          <li key={item.key} className={item.status === 'ok' ? 'staged-row ok' : item.status === 'fail' ? 'staged-row fail' : 'staged-row'}>
            <span className="staged-name" title={item.name}>{item.name}</span>
            <span className="muted small">{(item.bytes / MB).toFixed(1)} MB</span>
            <select
              className="staged-slot"
              aria-label={`Slot for ${item.name}`}
              value={item.slotId}
              disabled={Boolean(busy)}
              onChange={(event) => onAssign(item.key, event.target.value)}
            >
              {slots.map((slot) => (
                <option key={slot.id} value={slot.id}>{slotLabel(slots, slot.id)}</option>
              ))}
            </select>
            <span className="staged-state">
              {item.status === 'ok' && `✓ ${item.message}`}
              {item.status === 'fail' && `✗ ${item.message}`}
              {!item.status && '—'}
            </span>
            <button className="small danger" onClick={() => onRemove(item.key)} disabled={Boolean(busy)}>
              Remove
            </button>

            {onReplaceFile && item.status === 'fail' && (croppable(item.message) || compressible(item.message)) && (
              <div className="row staged-fix">
                {croppable(item.message) && (
                  <button className="small" onClick={() => fix(item, 'crop')} disabled={Boolean(busy) || Boolean(working)}>
                    {working === item.key ? 'Fitting…' : 'Crop to 4:3 and fit this slot'}
                  </button>
                )}
                {compressible(item.message) && (
                  <button className="small" onClick={() => fix(item, 'compress')} disabled={Boolean(busy) || Boolean(working)}>
                    Compress this image
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {note && <p className="inline-error">{note}</p>}

      <div className="row">
        <button className="primary" onClick={onFill} disabled={Boolean(busy)}>
          {busy ? 'Working…' : `Fill ${staged.length} slot${staged.length === 1 ? '' : 's'}`}
        </button>
        <button onClick={onClear} disabled={Boolean(busy)}>Clear list</button>
        {(accepted || refused) && (
          <span className="muted small">{accepted} accepted{refused ? `, ${refused} refused` : ''}.</span>
        )}
      </div>
    </div>
  );
}
