import { useRef, useState } from 'react';
import { modelLabel } from '../labels.js';

const MB = 1024 * 1024;
const KB = 1024;

const sizeOf = (bytes) => (bytes == null ? null : bytes >= MB ? `${(bytes / MB).toFixed(1)} MB` : `${Math.round(bytes / KB)} KB`);
const fileOf = (key) => (key === 'file1_text' ? 'File 1' : 'File 2');

/** What one deliverable row says about itself, in the seller's words. */
function stateOf(document, flagged, hasText) {
  const size = sizeOf(document.bytes);
  if (document.source === 'uploaded') return { bad: false, note: `✓ Your own PDF, checked as a PDF${size ? ` (${size})` : ''}.` };
  if (!hasText) return { bad: true, note: '✗ No listing text yet, so nothing to print.' };
  if (flagged) return { bad: false, note: '⚠ Not printed when this text was saved — creating the ZIP prints it anyway.' };
  return { bad: false, note: `✓ Ready${size ? ` · ${size}` : ' · will print when the ZIP is built'} · ${document.words.toLocaleString()} words.` };
}

export default function PackagePanel({ product, busy, onPackage, onUploadPdf, onRestorePdf }) {
  const [working, setWorking] = useState(null);
  const [error, setError] = useState('');
  const target = useRef(null);

  const hasText = Boolean(product.file1Text && product.file2Text);
  const images = product.images || [];
  const total = (product.slots || []).length;
  const quality = product.warnings?.quality;
  const flagged = Boolean(quality?.notes?.length);
  const documents = product.documents || [];
  const maxMb = Math.max(1, Math.round((product.rules?.pdfMaxBytes || 25 * MB) / MB));

  async function run(document, work) {
    setWorking(document.key);
    setError('');
    try {
      await work();
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(null);
    }
  }

  function choose(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    const document = target.current;
    if (!file || !document) return;
    if (!/\.pdf$/i.test(file.name) || (file.type && file.type !== 'application/pdf')) {
      setError(`“${file.name}” is not a PDF. Export it as a PDF first.`);
      return;
    }
    if (file.size > maxMb * MB) {
      setError(`“${file.name}” is ${(file.size / MB).toFixed(1)} MB. Keep a PDF under ${maxMb} MB.`);
      return;
    }
    run(document, () => onUploadPdf(document, file));
  }

  return (
    <div className="stack">
      <p className="muted small">
        These are the files the ZIP holds. Check the names, sizes and status here before uploading anything
        anywhere — and put your own PDF in place of either one if you would rather sell that.
      </p>

      <div className="table-scroll">
      <table className="manifest">
        <thead>
          <tr>
            <th>File in ZIP</th>
            <th>Source</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {documents.map((document) => {
            const state = stateOf(document, flagged, hasText);
            const disabled = Boolean(busy) || working === document.key;
            return (
              <tr key={document.key}>
                <td className="name">{document.name}</td>
                <td>
                  {document.source === 'uploaded'
                    ? `Your PDF · ${document.originalName}${sizeOf(document.bytes) ? ` · ${sizeOf(document.bytes)}` : ''}`
                    : `The portal's PDF, printed from ${fileOf(document.key)}`}
                  {working === document.key && ' · checking…'}
                </td>
                <td className={state.bad ? 'bad' : 'small'}>{state.note}</td>
                <td className="row">
                  <label className="button small">
                    {document.source === 'uploaded' ? 'Replace my PDF' : 'Upload your own PDF'}
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      hidden
                      disabled={disabled}
                      onChange={(event) => {
                        target.current = document;
                        choose(event);
                      }}
                    />
                  </label>
                  {document.source === 'uploaded' && (
                    <button className="small" onClick={() => run(document, () => onRestorePdf(document))} disabled={disabled}>
                      Use the portal&apos;s PDF
                    </button>
                  )}
                  <a className="button small" href={document.downloadUrl} download={document.name}>
                    Download
                  </a>
                </td>
              </tr>
            );
          })}
          {images.map((image) => (
            <tr key={image.slotId}>
              <td className="name">{image.fileName}</td>
              <td>
                Your upload · {image.width} × {image.height}px · {(image.bytes / MB).toFixed(1)} MB
              </td>
              <td className="small">✓ ready</td>
              <td />
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      {error && <p className="inline-error">{error}</p>}

      {!hasText && <p className="inline-error">Listing text is missing. Generate the text before packaging.</p>}

      {hasText && flagged && (
        <p className="muted small">
          {modelLabel(quality)} wrote File 1 at {quality.words} words, so no PDF was printed when this text was saved.
          Creating the ZIP prints both files anyway.
        </p>
      )}

      {hasText && total > 0 && (
        <p className="muted small">
          {images.length === total
            ? `All ${total} listing images are in place.`
            : `${total - images.length} image slot${total - images.length === 1 ? '' : 's'} still empty — the ZIP packs the PDFs plus the ${images.length} image${images.length === 1 ? '' : 's'} you added.`}
        </p>
      )}

      <div className="row">
        <button className="primary" onClick={onPackage} disabled={Boolean(busy) || !hasText}>
          {product.zipReady ? 'Rebuild ZIP' : 'Create ZIP'}
        </button>
        {product.zipReady && (
          <a className="button primary" href={product.downloadUrl} download>
            Download ZIP
          </a>
        )}
      </div>

      {product.zipReady && (
        <p className="muted small">
          Last package holds {documents.length} PDFs and {images.length} image{images.length === 1 ? '' : 's'}.
        </p>
      )}
    </div>
  );
}
