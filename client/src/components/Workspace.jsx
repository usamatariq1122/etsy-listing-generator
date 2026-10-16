import TextPreview from './TextPreview.jsx';
import UploadSlots from './UploadSlots.jsx';
import PackagePanel from './PackagePanel.jsx';

export default function Workspace({
  product,
  busy,
  onRegenerateText,
  onPackage,
  onUploadImage,
  onRemoveImage,
  onStartOver,
}) {
  const hasText = Boolean(product.file1Text && product.file2Text);

  return (
    <div className="stack">
      <section className="card">
        <div className="row-between">
          <div>
            <h2>{product.productName}</h2>
            <p className="muted small">
              Status: <strong>{product.status}</strong>
            </p>
          </div>
          <div className="row">
            <button onClick={onRegenerateText} disabled={Boolean(busy)}>Rewrite text</button>
            <button onClick={onStartOver} disabled={Boolean(busy)}>New listing</button>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Listing text</h2>
        {hasText ? (
          <TextPreview product={product} />
        ) : (
          <p className="muted">No text yet. Click “Rewrite text” to generate it.</p>
        )}
      </section>

      <section className="card">
        <h2>Listing images</h2>
        <UploadSlots
          product={product}
          busy={busy}
          onUpload={onUploadImage}
          onRemove={onRemoveImage}
        />
      </section>

      <section className="card">
        <h2>Package and download</h2>
        <PackagePanel product={product} busy={busy} onPackage={onPackage} />
      </section>
    </div>
  );
}
