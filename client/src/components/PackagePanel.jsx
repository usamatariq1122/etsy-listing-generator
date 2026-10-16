import { modelLabel } from '../labels.js';

const MB = 1024 * 1024;

export default function PackagePanel({ product, busy, onPackage }) {
  const hasText = Boolean(product.file1Text && product.file2Text);
  const images = product.images || [];
  const total = (product.slots || []).length;
  const quality = product.warnings?.quality;
  const flagged = Boolean(quality?.notes?.length);
  const pdfStatus = !hasText ? '✗ missing' : flagged ? '⚠ not printed' : '✓ ready';

  return (
    <div className="stack">
      <table className="manifest">
        <thead>
          <tr>
            <th>File in ZIP</th>
            <th>Source</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="name">product-content.pdf</td>
            <td>File 1 as PDF</td>
            <td>{pdfStatus}</td>
          </tr>
          <tr>
            <td className="name">etsy-listing-seo.pdf</td>
            <td>File 2 as PDF</td>
            <td>{pdfStatus}</td>
          </tr>
          {images.map((image) => (
            <tr key={image.slotId}>
              <td className="name">{image.fileName}</td>
              <td>
                Your upload · {image.width} × {image.height}px · {(image.bytes / MB).toFixed(1)} MB
              </td>
              <td>✓ ready</td>
            </tr>
          ))}
        </tbody>
      </table>

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
        <p className="muted small">Last package holds 2 PDFs and {images.length} image{images.length === 1 ? '' : 's'}.</p>
      )}
    </div>
  );
}
