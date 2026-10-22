import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

// The seller's pre-flight review. It shows the backend's own verdict on whether
// this listing could go to Etsy - the browser never decides that itself, it only
// mirrors what the server graded. Findings are grouped into the same sections the
// verdict uses so each one points at where to fix it. Errors are shown open; the
// softer warnings and suggestions fold away to keep the card readable.

const SECTION_LABELS = {
  content: 'Listing text',
  seo: 'Title and tags',
  price: 'Price',
  images: 'Images',
  files: 'Product files',
  etsy: 'Etsy answers',
  shop: 'Etsy shop',
};

const LEVEL_LABELS = { error: 'Must fix', warning: 'Worth a look', info: 'Good to know' };

export default function ValidationPanel({ productId, revision, onResult }) {
  const [state, setState] = useState({ loading: true, error: null, result: null });
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!productId) return;
    setState((prev) => ({ ...prev, loading: true }));
    try {
      const data = await api.validate(productId);
      setState({ loading: false, error: null, result: data.validation });
      onResult?.(data.validation);
    } catch (err) {
      setState({ loading: false, error: err.message || 'Could not check this listing.', result: null });
    }
    // onResult is kept out of the dependency list on purpose: it changes on every
    // parent render, and re-running the check for that would loop.
  }, [productId]);

  useEffect(() => {
    load();
  }, [load, revision]);

  const result = state.result;

  if (!productId) return null;

  const grouped = (items) => {
    const bySection = {};
    for (const item of items) (bySection[item.section] ??= []).push(item);
    return Object.entries(bySection);
  };

  return (
    <section className="card validation">
      <div className="row-between">
        <div>
          <h2>Listing review</h2>
          <p className="muted small">Whether this package is ready to save as an Etsy draft, checked on the server.</p>
        </div>
        <button className="linklike" onClick={load} disabled={state.loading || Boolean(!productId)}>
          {state.loading ? 'Checking…' : 'Re-check'}
        </button>
      </div>

      {state.error && (
        <p className="muted small" role="status">
          {state.error}
        </p>
      )}

      {!state.error && result && (
        <>
          <p className={`validation-banner ${result.ready ? 'ok' : 'blocked'}`} role="status">
            {result.ready
              ? 'Ready to save as an Etsy draft.'
              : `${result.errors.length} thing${result.errors.length === 1 ? '' : 's'} still to fix before a draft can be made.`}
          </p>

          {result.errors.length > 0 && (
            <div className="validation-group">
              <h3 className="validation-head error">{LEVEL_LABELS.error}</h3>
              {grouped(result.errors).map(([section, items]) => (
                <div key={section} className="validation-section">
                  <p className="validation-section-title">{SECTION_LABELS[section] || section}</p>
                  <ul className="validation-items error">
                    {items.map((item, i) => (
                      <li key={i}>{item.message}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {(result.warnings.length > 0 || result.info.length > 0) && (
            <details
              className="drop"
              open={open}
              onToggle={(event) => setOpen(event.target.open)}
            >
              <summary>
                <span>
                  {result.warnings.length} to look at, {result.info.length} tip
                  {result.info.length === 1 ? '' : 's'}
                </span>
                <em className="drop-meta">nothing here blocks the draft</em>
              </summary>

              {result.warnings.length > 0 && (
                <div className="validation-group">
                  <h3 className="validation-head warn">{LEVEL_LABELS.warning}</h3>
                  {grouped(result.warnings).map(([section, items]) => (
                    <div key={section} className="validation-section">
                      <p className="validation-section-title">{SECTION_LABELS[section] || section}</p>
                      <ul className="validation-items warn">
                        {items.map((item, i) => (
                          <li key={i}>{item.message}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              {result.info.length > 0 && (
                <div className="validation-group">
                  <h3 className="validation-head info">{LEVEL_LABELS.info}</h3>
                  <ul className="validation-items info">
                    {result.info.map((item, i) => (
                      <li key={i}>{item.message}</li>
                    ))}
                  </ul>
                </div>
              )}
            </details>
          )}
        </>
      )}
    </section>
  );
}
