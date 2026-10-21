import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

// Etsy is an outside service, so this whole panel exists only while the server
// says the feature is switched on. A package is saved as a DRAFT by default; it
// only goes live when the seller presses Publish and confirms. Nothing is deleted
// from here.

const WHO_LABELS = {
  i_did: 'I made them',
  someone_else: 'Someone else made them',
  collective: 'A collective I belong to',
};

/** "2020_2026" reads as "2020-2026", "before_2007" as "Before 2007". */
function whenLabel(value) {
  if (value === 'made_to_order') return 'Made to order';
  const [first, second] = value.split('_');
  if (second) return `${first}-${second}`;
  if (first.startsWith('before')) return `Before ${first.slice(6)}`;
  return first;
}

export default function EtsyPanel({ product, status, busy, onConnect, onDraft, onPublish, onDisconnect, onError }) {
  const [categories, setCategories] = useState(null);
  const [category, setCategory] = useState('');
  const [quantity, setQuantity] = useState('');
  const [whoMade, setWhoMade] = useState('');
  const [whenMade, setWhenMade] = useState('');
  const [published, setPublished] = useState(false);
  const [saving, setSaving] = useState(false);

  const publish = async () => {
    if (await onPublish()) setPublished(true);
  };

  // Guard the one-way action: once a draft is sent the button locks until the
  // server answers, so a fast double-click cannot fire two creates.
  const createDraft = async (fields) => {
    if (saving) return;
    setSaving(true);
    try {
      await onDraft(fields);
    } finally {
      setSaving(false);
    }
  };

  // The tree is public data that changes rarely, so it is fetched once and
  // searched here, rather than sending a request for every letter typed.
  useEffect(() => {
    if (!status.connected || categories) return;
    api.etsyCategories().then((data) => setCategories(data.categories)).catch(onError);
  }, [status.connected, categories, onError]);

  const matches = useMemo(() => {
    if (!categories) return [];
    const wanted = category.trim().toLowerCase();
    const list = wanted ? categories.filter((node) => node.path.join(' > ').toLowerCase().includes(wanted)) : categories;
    return list.slice(0, 60);
  }, [categories, category]);

  const hasText = Boolean(product.file1Text && product.file2Text);
  const filled = Boolean(quantity && whoMade && whenMade && category);
  const ready = hasText && Boolean(product.price) && filled;

  return (
    <section className="card">
      <div className="row-between">
        <div>
          <h2>Etsy listing</h2>
          {status.connected ? (
            <p className="muted small">
              Connected as <strong>{status.shopName || 'your Etsy shop'}</strong>. A package is saved as a draft; it only
              goes live when you press Publish.
            </p>
          ) : (
            <p className="muted small">Not connected to a shop yet.</p>
          )}
        </div>
        {status.connected ? (
          <button className="linklike" onClick={onDisconnect} disabled={Boolean(busy)}>
            Disconnect
          </button>
        ) : (
          <button onClick={onConnect} disabled={Boolean(busy)}>
            Connect Etsy Shop
          </button>
        )}
      </div>

      {status.connected && (
        <div className="etsy-fields">
          <label className="field">
            <span>Etsy category</span>
            <input
              type="text"
              list="etsy-categories"
              value={category}
              placeholder="Start typing, e.g. crochet pattern"
              onChange={(event) => setCategory(event.target.value)}
            />
            <datalist id="etsy-categories">
              {matches.map((node) => (
                <option key={node.id} value={node.path.join(' > ')} />
              ))}
            </datalist>
          </label>

          <label className="field">
            <span>Copies available</span>
            <input
              type="text"
              inputMode="numeric"
              value={quantity}
              placeholder="e.g. 999"
              onChange={(event) => setQuantity(event.target.value.replace(/\D/g, ''))}
            />
          </label>

          <label className="field">
            <span>Who made it</span>
            <select value={whoMade} onChange={(event) => setWhoMade(event.target.value)}>
              <option value="">Choose…</option>
              {(status.whoMade || []).map((value) => (
                <option key={value} value={value}>{WHO_LABELS[value] || value}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>When it was made</span>
            <select value={whenMade} onChange={(event) => setWhenMade(event.target.value)}>
              <option value="">Choose…</option>
              {(status.whenMade || []).map((value) => (
                <option key={value} value={value}>{whenLabel(value)}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      {status.connected && hasText && !product.etsyDraft && (
        <p className="muted small">
          Title, description, tags and price come from the listing text above. The slot images and both PDFs are attached
          as the files a buyer downloads.
        </p>
      )}

      {status.connected && !product.price && hasText && (
        <p className="muted small">Etsy requires a price, so set one above first.</p>
      )}

      {product.etsyDraft && (
        <p className="small">
          <strong>{published ? 'Live on Etsy: ' : 'Draft on Etsy: '}</strong>
          {product.etsyDraft.url ? (
            <a href={product.etsyDraft.url} target="_blank" rel="noreferrer">{product.etsyDraft.url}</a>
          ) : (
            `listing ${product.etsyDraft.listingId}`
          )}
          <span className="muted">
            {published
              ? ' — you can manage it in Etsy whenever you like.'
              : ' — review it there, or publish it from here.'}
          </span>
        </p>
      )}

      {status.connected && (
        <div className="row">
          {!product.etsyDraft ? (
            <>
              <button
                className="primary"
                disabled={Boolean(busy) || !ready || saving}
                onClick={() => createDraft({ quantity, whoMade, whenMade, category })}
              >
                {saving ? 'Saving…' : 'Create Etsy Draft'}
              </button>
              {!ready && <span className="muted small">Fill in all four answers above to send the draft.</span>}
            </>
          ) : (
            !published && (
              <button className="primary" disabled={Boolean(busy)} onClick={publish}>
                Publish on Etsy
              </button>
            )
          )}
        </div>
      )}

      <p className="trademark-note small muted">
        The term "Etsy" is a trademark of Etsy, Inc. This application uses the Etsy API but is not
        endorsed or certified by Etsy, Inc.
      </p>
    </section>
  );
}
