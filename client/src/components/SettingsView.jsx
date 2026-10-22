import { useEffect, useState } from 'react';
import { WHO_LABELS, whenLabel } from './EtsyPanel.jsx';

function ThemeCard({ theme, busy, onSave, onRemove }) {
  const DEFAULTS = { ink: '#14293d', accent: '#2f6f8f', muted: '#6b7280', hairline: '#d7dee5' };
  const FIELDS = [
    ['ink', 'Title colour'],
    ['accent', 'Headings and rules'],
    ['muted', 'Labels and footers'],
    ['hairline', 'Thin separators'],
  ];
  const [draft, setDraft] = useState(theme || DEFAULTS);
  const current = theme || DEFAULTS;
  const dirty = FIELDS.some(([key]) => (draft[key] || '').toLowerCase() !== current[key]);

  function submit(event) {
    event.preventDefault();
    onSave(FIELDS.reduce((acc, [key]) => ({ ...acc, [key]: draft[key] }), {}));
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>PDF colours</h2>
        <span className="muted small">applies to the next PDF the portal prints</span>
      </div>
      <form onSubmit={submit} className="stack">
        <div className="color-grid">
          {FIELDS.map(([key, label]) => (
            <label className="field" key={key}>
              <span>{label}</span>
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(draft[key] || '') ? draft[key] : DEFAULTS[key]}
                onChange={(e) => setDraft((prev) => ({ ...prev, [key]: e.target.value }))}
                disabled={Boolean(busy) || !onSave}
              />
            </label>
          ))}
        </div>
        <div className="row">
          <button type="submit" className="primary" disabled={Boolean(busy) || !dirty || !onSave}>
            Save colours
          </button>
          <button type="button" onClick={() => onRemove()} disabled={Boolean(busy) || !onRemove || !dirty}>
            Reset to default
          </button>
        </div>
      </form>
      <p className="muted small">
        These four colours are the whole printed look of both PDFs. Left alone, the portal prints in its
        built-in palette. Fonts and a logo are not editable here, because adding those would mean bundling
        extra files into the server.
      </p>
    </section>
  );
}

function EtsyDefaultsCard({ etsy, busy, canManage, onSave }) {
  const seed = etsy?.defaults || {};
  const [draft, setDraft] = useState({ category: '', quantity: '', whoMade: '', whenMade: '', ...seed });

  // Re-seed when the saved values change (after a save, or a fresh status load),
  // so the editor always shows what is actually stored rather than a stale draft.
  useEffect(() => {
    setDraft({ category: seed.category || '', quantity: seed.quantity || '', whoMade: seed.whoMade || '', whenMade: seed.whenMade || '' });
  }, [seed.category, seed.quantity, seed.whoMade, seed.whenMade]);

  const set = (key) => (event) => setDraft((prev) => ({ ...prev, [key]: event.target.value }));
  const saved = { category: seed.category || '', quantity: seed.quantity || '', whoMade: seed.whoMade || '', whenMade: seed.whenMade || '' };
  const dirty = Object.keys(saved).some((key) => (draft[key] || '') !== saved[key]);

  function submit(event) {
    event.preventDefault();
    onSave({ ...draft, quantity: draft.quantity.replace(/\D/g, '') });
  }

  const filled = Object.values(saved).some(Boolean);

  return (
    <section className="card">
      <div className="card-head">
        <h2>Etsy shop defaults</h2>
        <span className="muted small">used for every draft you send to Etsy</span>
      </div>

      <form onSubmit={submit} className="stack">
        <label className="field">
          <span>Category</span>
          <input
            type="text"
            value={draft.category}
            maxLength={200}
            placeholder="Full path, e.g. Craft Supplies &gt; Patterns &gt; Digital Patterns"
            onChange={set('category')}
            disabled={Boolean(busy) || !canManage}
          />
        </label>
        <p className="muted small">
          Etsy needs an exact category. Leave this blank to pick it from the list in each listing's Etsy panel
          instead — the panel offers the same choices and lets you correct one before the draft is sent.
        </p>

        <div className="etsy-fields">
          <label className="field">
            <span>Copies available</span>
            <input
              type="text"
              inputMode="numeric"
              value={draft.quantity}
              placeholder="e.g. 999"
              onChange={set('quantity')}
              disabled={Boolean(busy) || !canManage}
            />
          </label>
          <label className="field">
            <span>Who made it</span>
            <select value={draft.whoMade} onChange={set('whoMade')} disabled={Boolean(busy) || !canManage}>
              <option value="">Choose…</option>
              {(etsy?.whoMade || []).map((value) => (
                <option key={value} value={value}>{WHO_LABELS[value] || value}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>When it was made</span>
            <select value={draft.whenMade} onChange={set('whenMade')} disabled={Boolean(busy) || !canManage}>
              <option value="">Choose…</option>
              {(etsy?.whenMade || []).map((value) => (
                <option key={value} value={value}>{whenLabel(value)}</option>
              ))}
            </select>
          </label>
        </div>

        {canManage && (
          <div className="row">
            <button type="submit" className="primary" disabled={Boolean(busy) || !dirty}>
              Save defaults
            </button>
            {filled && (
              <button type="button" onClick={() => onSave({ category: '', quantity: '', whoMade: '', whenMade: '' })} disabled={Boolean(busy) || dirty}>
                Clear defaults
              </button>
            )}
          </div>
        )}
      </form>
      <p className="muted small">
        A price and at least one listing image are still set on each listing — Etsy will not accept a draft
        without them, and they change too often to fix here. Whatever you leave blank here, the Etsy panel
        asks you for.
      </p>
    </section>
  );
}

export default function SettingsView({ settings, busy, etsy, canManageEtsy, onSaveBrand, onSaveTheme, onRemoveTheme, onSaveEtsyDefaults }) {
  const [brandDraft, setBrandDraft] = useState(null);
  const [localError, setLocalError] = useState('');

  if (!settings) return <p className="muted">Loading settings…</p>;

  const savedBrand = settings.brand || '';
  const brand = brandDraft ?? savedBrand;
  const brandDirty = brand.trim() !== savedBrand && brand.trim().length > 0;

  function submitBrand(event) {
    event.preventDefault();
    const value = brand.trim();
    if (!value) {
      setLocalError('Enter a brand name.');
      return;
    }
    setLocalError('');
    onSaveBrand(value);
    setBrandDraft(null);
  }

  return (
    <>
      <section className="card">
        <div className="card-head">
          <h2>Brand name</h2>
          <span className="muted small">{savedBrand}</span>
        </div>
        <form onSubmit={submitBrand} className="field-row">
          <label className="field">
            <span>Name</span>
            <input
              type="text"
              value={brand}
              autoComplete="off"
              spellCheck={false}
              maxLength={40}
              onChange={(e) => setBrandDraft(e.target.value)}
              disabled={Boolean(busy) || !onSaveBrand}
            />
          </label>
          <button type="submit" className="primary" disabled={Boolean(busy) || !brandDirty}>
            Save brand
          </button>
        </form>
        {localError && <p className="inline-error">{localError}</p>}
        <p className="muted small">
          This is the only shop name the portal uses. It signs the page footer of both PDFs, opens the
          licence section of the product guide, and may appear as a small wordmark in the image prompts.
          Any other shop name a model invents is removed. Changes apply to the next generation.
        </p>
      </section>

      <ThemeCard theme={settings.theme} busy={busy} onSave={onSaveTheme} onRemove={onRemoveTheme} />

      {etsy?.enabled && canManageEtsy && (
        <EtsyDefaultsCard etsy={etsy} busy={busy} canManage={canManageEtsy} onSave={onSaveEtsyDefaults} />
      )}
    </>
  );
}
