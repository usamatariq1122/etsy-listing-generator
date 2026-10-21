import { useEffect, useState } from 'react';

const chars = (value) => [...String(value ?? '')].length;
const words = (value) => (String(value ?? '').trim() ? String(value).trim().split(/\s+/).length : 0);

// The fields the seller copies into the marketplace form, read back out of File 2.
// Everything here can be edited before the PDFs are built — the portal's wording
// is a starting point, not the last word. The price is the one field that is
// never generated: it stays empty until the seller types it.
export default function ListingPreview({ product, busy, onSavePrice, onSaveListing }) {
  const limits = product.seoLimits || { titleMax: 140, tagMax: 20, tagCount: 13 };
  const listing = product.listing || { title: '', tags: [], description: '', attributes: [] };

  const [price, setPrice] = useState(product.price || '');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => fromListing(listing));
  const [error, setError] = useState('');

  useEffect(() => {
    setPrice(product.price || '');
    setEditing(false);
    setDraft(fromListing(product.listing || {}));
  }, [product.id, product.price, product.file2Text]);

  const issues = editing ? check(draft, limits) : [];

  function save() {
    setError('');
    if (issues.length) {
      setError(issues[0]);
      return;
    }
    onSaveListing(draft)
      .then(() => setEditing(false))
      .catch((err) => setError(err.message));
  }

  return (
    <section className="card">
      <div className="row head">
        <h2>Listing preview</h2>
        {!editing && (
          <button className="small" onClick={() => setEditing(true)} disabled={Boolean(busy)}>
            Edit
          </button>
        )}
      </div>

      <p className="inline-note">
        The guide is a draft written from search data, not a tested pattern. Test this pattern yourself before
        selling.
      </p>

      {!editing ? (
        <Readonly listing={listing} />
      ) : (
        <div className="stack">
          <div className="field">
            <span>
              Title ({chars(draft.title)}/{limits.titleMax} characters)
            </span>
            <input
              type="text"
              value={draft.title}
              maxLength={limits.titleMax}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              disabled={Boolean(busy)}
            />
          </div>

          <div className="field">
            <span>
              Tags ({draft.tags.length}/{limits.tagCount}) — one per line, {limits.tagMax} characters max
            </span>
            <textarea
              className="tag-editor"
              rows={Math.min(limits.tagCount, 8)}
              value={draft.tags.join('\n')}
              onChange={(event) =>
                setDraft({ ...draft, tags: event.target.value.split('\n').map((t) => t.trimStart()) })
              }
              disabled={Boolean(busy)}
            />
          </div>

          <div className="field">
            <span>Description</span>
            <textarea
              className="desc-editor"
              rows={10}
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              disabled={Boolean(busy)}
            />
          </div>

          {issues.length > 0 && (
            <ul className="check-list">
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}

          {error && <p className="inline-error">{error}</p>}

          <div className="row">
            <button className="primary" onClick={save} disabled={Boolean(busy) || issues.length > 0}>
              Save edits
            </button>
            <button onClick={() => { setEditing(false); setDraft(fromListing(listing)); setError(''); }} disabled={Boolean(busy)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="field price-field">
        <span>Price (your number — the portal never suggests one)</span>
        <div className="row">
          <input
            type="text"
            inputMode="decimal"
            value={price}
            maxLength={10}
            placeholder="e.g. 4.50"
            onChange={(event) => setPrice(event.target.value)}
            disabled={Boolean(busy)}
          />
          <button onClick={() => onSavePrice(price)} disabled={Boolean(busy)}>Save price</button>
        </div>
      </div>
    </section>
  );
}

function fromListing(listing) {
  return { title: listing.title || '', tags: listing.tags || [], description: listing.description || '' };
}

/** The same limits the pipeline enforces, checked as the seller types. */
function check(draft, limits) {
  const issues = [];
  if (chars(draft.title) > limits.titleMax) issues.push(`Title is ${chars(draft.title)} characters (max ${limits.titleMax}).`);
  const seen = new Set();
  draft.tags.forEach((tag, index) => {
    const clean = tag.trim();
    if (!clean) return;
    if ([...clean].length > limits.tagMax) issues.push(`Tag ${index + 1} (“${clean}”) is over ${limits.tagMax} characters.`);
    const key = clean.toLowerCase();
    if (seen.has(key)) issues.push(`Duplicate tag: “${clean}”.`);
    else seen.add(key);
  });
  if (draft.tags.filter((t) => t.trim()).length !== limits.tagCount) {
    issues.push(`Etsy wants exactly ${limits.tagCount} tags.`);
  }
  return issues;
}

function Readonly({ listing }) {
  const longTags = listing.tags.filter((tag) => chars(tag) > 20);
  return (
    <>
      <div className="field">
        <span>Title ({chars(listing.title)}/140 characters)</span>
        <p className="preview-text">{listing.title || 'Nothing generated yet.'}</p>
      </div>

      <div className="field">
        <span>Tags ({listing.tags.length}/13{longTags.length ? `, ${longTags.length} too long` : ''})</span>
        {listing.tags.length ? (
          <ul className="chips">
            {listing.tags.map((tag) => (
              <li key={tag} className={chars(tag) > 20 ? 'over' : undefined}>{tag}</li>
            ))}
          </ul>
        ) : (
          <p className="muted small">No tags yet.</p>
        )}
      </div>

      <div className="field">
        <span>Attributes and category</span>
        {listing.attributes.length ? (
          <dl className="pairs">
            {listing.attributes.map((item) => (
              <div key={`${item.label}-${item.value}`}>
                {item.label && <dt>{item.label}</dt>}
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="muted small">No attributes yet.</p>
        )}
      </div>

      <details className="drop">
        <summary>
          <span>Description</span>
          <em className="drop-meta">{words(listing.description)} words</em>
        </summary>
        <p className="preview-text">{listing.description || '(empty)'}</p>
      </details>
    </>
  );
}
