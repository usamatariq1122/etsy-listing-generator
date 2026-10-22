import TextPreview from './TextPreview.jsx';
import ListingPreview from './ListingPreview.jsx';
import UploadSlots from './UploadSlots.jsx';
import PackagePanel from './PackagePanel.jsx';
import SeoScore from './SeoScore.jsx';
import ValidationPanel from './ValidationPanel.jsx';
import PolicyNotice from './PolicyNotice.jsx';

export default function Workspace({
  product,
  busy,
  onRegenerateText,
  onPackage,
  onSavePrice,
  onSaveListing,
  onUploadPdf,
  onRestorePdf,
  onUploadImage,
  onRemoveImage,
  onGenerateImage,
  onStartOver,
}) {
  const hasText = Boolean(product.file1Text && product.file2Text);

  // Anything that changes the server's verdict is folded into one signal so the
  // review re-checks itself after a price edit, an image change or a rewrite,
  // instead of going stale under the seller.
  const verdict = [
    product.status,
    product.price ?? '',
    product.updatedAt ?? '',
    (product.images || []).length,
    (product.documents || []).filter((d) => d.source).length,
    product.etsyDraft ? 'draft' : '',
  ].join('|');

  return (
    <div className="stack">
      <PolicyNotice />

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

      <ValidationPanel productId={product.id} revision={verdict} />

      <ListingPreview product={product} busy={busy} onSavePrice={onSavePrice} onSaveListing={onSaveListing} />

      <section className="card">
        <h2>Listing text</h2>
        {hasText ? (
          <TextPreview product={product} />
        ) : (
          <p className="muted">No text yet. Click “Rewrite text” to generate it.</p>
        )}
      </section>

      <SeoScore check={product.warnings?.seoCheck} />

      <section className="card">
        <h2>Listing images</h2>
        <UploadSlots
          product={product}
          busy={busy}
          onUpload={onUploadImage}
          onRemove={onRemoveImage}
          onGenerate={onGenerateImage}
        />
      </section>

      <section className="card">
        <h2>Package and download</h2>
        <PackagePanel
          product={product}
          busy={busy}
          onPackage={onPackage}
          onUploadPdf={onUploadPdf}
          onRestorePdf={onRestorePdf}
        />
      </section>
    </div>
  );
}
