import { useRef, useState } from 'react';
import { unpackZip, MAX_IMAGES } from '../unpack.js';
import ZipSlots from './ZipSlots.jsx';

const MB = 1024 * 1024;
const MAX_ZIP_MB = 25;

// One ZIP of listing photos, opened in the browser. The archive itself never
// reaches the server: its images are uploaded one slot at a time, so the
// existing size and shape rules stay the only gate.
export default function ZipDrop({
  slots,
  staged,
  busy,
  rules,
  onImages,
  onAssign,
  onRemove,
  onFill,
  onClear,
  onReplaceFile,
}) {
  const [over, setOver] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [reading, setReading] = useState(false);
  const input = useRef(null);

  async function accept(chosen) {
    setError('');
    setNote('');
    if (!chosen) return;
    const isZip = chosen.type === 'application/zip' || /\.zip$/i.test(chosen.name);
    if (!isZip) {
      setError('That is not a ZIP. Put the images in one .zip file and drop it here.');
      return;
    }
    if (chosen.size > MAX_ZIP_MB * MB) {
      setError(`The ZIP is ${(chosen.size / MB).toFixed(1)} MB. Keep it under ${MAX_ZIP_MB} MB.`);
      return;
    }
    setReading(true);
    try {
      const { images, ignored } = await unpackZip(chosen);
      await onImages(images);
      setNote(
        `${images.length} image${images.length === 1 ? '' : 's'} read from ${chosen.name}` +
          (ignored ? `, ${ignored} file${ignored === 1 ? '' : 's'} that ${ignored === 1 ? 'is' : 'are'} not a listing image ignored.` : '.'),
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setReading(false);
    }
  }

  function drop(event) {
    event.preventDefault();
    setOver(false);
    const dropped = Array.from(event.dataTransfer?.files || []);
    if (dropped.length > 1) {
      setError('One ZIP with all the images inside, not several files.');
      return;
    }
    accept(dropped[0]);
  }

  function choose(event) {
    accept(event.target.files?.[0]);
    event.target.value = '';
  }

  return (
    <section className="card">
      <h2>Listing photos</h2>
      <div
        className={over ? 'zipdrop over' : 'zipdrop'}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
        onClick={() => input.current?.click()}
      >
        <input ref={input} type="file" accept=".zip,application/zip" hidden disabled={Boolean(busy) || reading} onChange={choose} />
        <p>
          {reading
            ? 'Reading the ZIP…'
            : `Drop one ZIP of listing images here, or click to choose it. Up to ${MAX_IMAGES} JPG or PNG files inside.`}
        </p>
      </div>
      {error && <p className="inline-error">{error}</p>}
      {note && !error && <p className="muted small">{note}</p>}

      {staged.length > 0 && (
        <ZipSlots
          slots={slots}
          staged={staged}
          busy={busy}
          rules={rules}
          onAssign={onAssign}
          onRemove={onRemove}
          onFill={onFill}
          onClear={onClear}
          onReplaceFile={onReplaceFile}
        />
      )}
    </section>
  );
}
