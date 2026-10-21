import { useState } from 'react';

const AUTO = [{ value: 'general', label: 'Auto-detect' }];

export default function ProductForm({ busy, productName, onProductName, productTypes, productType, onProductType, onCreate, etsyConnected, onCreateToDraft }) {
  const [localError, setLocalError] = useState('');
  const types = productTypes?.length ? productTypes : AUTO;

  function submit(event, action) {
    event.preventDefault();
    if (productName.trim().length < 3) {
      setLocalError('Enter a product name or niche, for example "Crochet dragon pattern".');
      return;
    }
    setLocalError('');
    (action || onCreate)();
  }

  return (
    <section className="card">
      <h2>New listing</h2>

      <form onSubmit={submit}>
        <label className="field">
          <span>Product name or niche</span>
          <input
            type="text"
            value={productName}
            maxLength={200}
            placeholder="e.g. Crochet dragon pattern, printable wall art, Notion budget planner"
            onChange={(e) => onProductName(e.target.value)}
            disabled={Boolean(busy)}
          />
        </label>

        <label className="field">
          <span>Product type</span>
          <select value={productType || 'general'} onChange={(e) => onProductType(e.target.value)} disabled={Boolean(busy)}>
            {types.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </label>
        <p className="muted small">
          Auto-detect lets the model infer the type from the name. Pick a specific type to write from the brief
          you have set for it under Advanced Settings.
        </p>

        {localError && <p className="inline-error">{localError}</p>}

        <button type="submit" className="primary" disabled={Boolean(busy)}>
          {busy ? 'Working…' : 'Generate Listing Package'}
        </button>

        {etsyConnected && (
          <button
            type="button"
            className="primary"
            disabled={Boolean(busy)}
            onClick={(event) => submit(event, onCreateToDraft)}
          >
            {busy ? 'Working…' : 'Generate → Etsy draft'}
          </button>
        )}
      </form>

      {etsyConnected && (
        <p className="muted small">
          “Generate → Etsy draft” writes the listing, then sends it to Etsy as a private draft using your saved shop
          defaults. Set a price and add at least one image on the listing first, or Etsy will refuse the draft. It
          never goes live until you press Publish.
        </p>
      )}

      <p className="muted small">
        The two PDF files and the 7 image prompts are written for you, then packed with your photos into one
        ZIP. Keywords, model and API keys sit under Advanced Settings below, and nothing there is required.
      </p>
    </section>
  );
}
