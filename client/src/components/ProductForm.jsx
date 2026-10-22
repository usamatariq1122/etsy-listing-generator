import { useState } from 'react';

const AUTO = [{ value: 'general', label: 'Auto-detect' }];

const SKILL_LEVELS = ['', 'Beginner', 'Confident beginner', 'Intermediate', 'Advanced'];

export default function ProductForm({
  busy, productName, onProductName, productTypes, productType, onProductType,
  productInfo = {}, onProductInfo, onCreate, etsyConnected, onCreateToDraft,
}) {
  const [localError, setLocalError] = useState('');
  const types = productTypes?.length ? productTypes : AUTO;

  const info = (key) => productInfo[key] ?? '';
  function setField(key, value) {
    onProductInfo?.({ ...productInfo, [key]: value });
  }

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
          you have set for it under Settings.
        </p>

        <details className="field product-details">
          <summary>Product details (optional)</summary>
          <p className="muted small">
            Fill in what you know and the listing is written from it instead of guessed. Leave any line blank and the
            model uses its own judgement for that one. Nothing here changes the product name or your keywords.
          </p>
          <div className="detail-grid">
            <label className="field">
              <span>Target buyer</span>
              <input type="text" value={info('audience')} maxLength={200} placeholder="e.g. beginner crocheters"
                onChange={(e) => setField('audience', e.target.value)} disabled={Boolean(busy)} />
            </label>
            <label className="field">
              <span>Occasion or season</span>
              <input type="text" value={info('occasion')} maxLength={200} placeholder="e.g. Christmas gift"
                onChange={(e) => setField('occasion', e.target.value)} disabled={Boolean(busy)} />
            </label>
            <label className="field">
              <span>Product language</span>
              <input type="text" value={info('language')} maxLength={60} placeholder="e.g. English"
                onChange={(e) => setField('language', e.target.value)} disabled={Boolean(busy)} />
            </label>
            <label className="field">
              <span>Skill level</span>
              <select value={info('skillLevel')} onChange={(e) => setField('skillLevel', e.target.value)} disabled={Boolean(busy)}>
                {SKILL_LEVELS.map((level) => (
                  <option key={level} value={level}>{level || 'Not specified'}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Main benefits</span>
              <input type="text" value={info('benefits')} maxLength={300} placeholder="e.g. quick make, single colour"
                onChange={(e) => setField('benefits', e.target.value)} disabled={Boolean(busy)} />
            </label>
            <label className="field">
              <span>Finished size or specs</span>
              <input type="text" value={info('finishedSize')} maxLength={300} placeholder="e.g. 18cm tall; A4 PDF"
                onChange={(e) => setField('finishedSize', e.target.value)} disabled={Boolean(busy)} />
            </label>
            <label className="field wide">
              <span>What is included</span>
              <textarea rows={2} value={info('contents')} maxLength={500} placeholder="e.g. 12-page PDF pattern, photo tutorial"
                onChange={(e) => setField('contents', e.target.value)} disabled={Boolean(busy)} />
            </label>
            <label className="field wide">
              <span>Materials or tools</span>
              <textarea rows={2} value={info('materials')} maxLength={500} placeholder="e.g. 3mm hook, DK yarn, stitch marker"
                onChange={(e) => setField('materials', e.target.value)} disabled={Boolean(busy)} />
            </label>
            <label className="field wide">
              <span>Intended use</span>
              <textarea rows={2} value={info('intendedUse')} maxLength={500} placeholder="e.g. personal use, small-batch resale"
                onChange={(e) => setField('intendedUse', e.target.value)} disabled={Boolean(busy)} />
            </label>
            <label className="field wide">
              <span>Internal notes</span>
              <textarea rows={2} value={info('notes')} maxLength={500} placeholder="Anything that should shape this listing"
                onChange={(e) => setField('notes', e.target.value)} disabled={Boolean(busy)} />
            </label>
          </div>
        </details>

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
        ZIP. Keywords, model and API keys sit under Settings, and nothing there is required.
      </p>
    </section>
  );
}
