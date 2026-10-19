import { useState } from 'react';
import KeywordPicker from './KeywordPicker.jsx';

export default function ProductForm({ busy, onCreate }) {
  const [productName, setProductName] = useState('');
  const [picked, setPicked] = useState([]);
  const [localError, setLocalError] = useState('');

  function submit(event) {
    event.preventDefault();
    if (productName.trim().length < 3) {
      setLocalError('Enter a product name or niche, for example "Crochet dragon pattern".');
      return;
    }
    setLocalError('');
    onCreate(productName.trim(), picked);
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
            onChange={(e) => setProductName(e.target.value)}
            disabled={Boolean(busy)}
          />
        </label>

        <KeywordPicker productName={productName} busy={busy} picked={picked} onPicked={setPicked} />

        {localError && <p className="inline-error">{localError}</p>}

        <button type="submit" className="primary" disabled={Boolean(busy)}>
          {busy ? 'Working…' : 'Generate listing text'}
        </button>
      </form>

      <p className="muted small">
        The text model writes File 1 (product-content.pdf), File 2 (etsy-listing-seo.pdf) and the 7 image prompts.
        File 1 is automatically checked for brackets, citations, source references and footnotes, and the listing
        fields are then scored against the keywords you ticked.
      </p>
    </section>
  );
}
