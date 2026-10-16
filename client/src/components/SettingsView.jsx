import { useState } from 'react';
import { providerLabel } from '../labels.js';

const SOURCE = {
  app: 'saved in this app',
  env: 'loaded from server/.env',
};

function KeyRow({ provider, info, busy, onSave, onRemove }) {
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');

  function close() {
    setEditing(false);
    setDraft('');
    setError('');
  }

  function submit(event) {
    event.preventDefault();
    const key = draft.trim();
    if (!key) {
      setError('Paste an API key first.');
      return;
    }
    setError('');
    onSave(provider, key);
    close();
  }

  return (
    <div className="key-row">
      <div className="row-between">
        <p className={info.configured ? 'muted' : 'inline-error'}>
          {info.configured
            ? `${providerLabel(provider)} connected — access key ${info.hint} (${SOURCE[info.source] || 'ready'}).`
            : `${providerLabel(provider)} not connected. Add a key so its models can answer.`}
        </p>
        <button onClick={() => setEditing(!editing)} disabled={Boolean(busy)}>
          {info.configured ? 'Change key' : 'Add key'}
        </button>
      </div>

      {editing && (
        <form onSubmit={submit}>
          <label className="field">
            <span>{providerLabel(provider)} access key</span>
            <input
              type="password"
              value={draft}
              autoComplete="off"
              spellCheck={false}
              placeholder="Paste your key"
              onChange={(e) => setDraft(e.target.value)}
              disabled={Boolean(busy)}
            />
          </label>

          {error && <p className="inline-error">{error}</p>}

          <div className="row">
            <button type="submit" className="primary" disabled={Boolean(busy) || !draft.trim()}>
              Save
            </button>
            <button type="button" onClick={close} disabled={Boolean(busy)}>
              Cancel
            </button>
            {info.source === 'app' && (
              <button type="button" className="danger" onClick={() => onRemove(provider)} disabled={Boolean(busy)}>
                Remove saved key
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

export default function SettingsView({ settings, busy, onSave, onRemove, onSaveModel, onSaveBrand }) {
  const [brandDraft, setBrandDraft] = useState(null);
  const [localError, setLocalError] = useState('');

  if (!settings) return <p className="muted">Loading settings…</p>;

  const providers = settings.providers || {};
  const groups = settings.groups || [];
  const selected = settings.selected || {};
  const labelFor = (provider) => groups.find((group) => group.provider === provider)?.label || providerLabel(provider);
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
        <div className="row-between">
          <h2>Brand name</h2>
          <span className="muted small">{savedBrand}</span>
        </div>
        <form onSubmit={submitBrand} className="row-between">
          <label className="field shrink">
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

      <section className="card">
        <div className="row-between">
          <h2>Model</h2>
          <span className="muted small">{labelFor(selected.provider)} &middot; {selected.model}</span>
        </div>

        <div className="row-between">
          <label className="field shrink">
            <span>Asked first</span>
            <select
              value={`${selected.provider}|${selected.model}`}
              onChange={(e) => {
                const [provider, model] = e.target.value.split('|');
                onSaveModel(provider, model);
              }}
              disabled={Boolean(busy) || !groups.length}
            >
              {groups.map((group) => (
                <optgroup key={group.provider} label={group.label}>
                  {group.models.map((model) => (
                    <option key={`${group.provider}|${model}`} value={`${group.provider}|${model}`}>
                      {model}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <p className="muted small">
            {selected.provider === 'groq'
              ? `Groq is asked first with ${selected.model}; if it declines, the Gemini models are tried from best to lite.`
              : 'Gemini is asked first and walks its own models from best to lite when one is busy. Groq answers last, with the first model of its group.'}
            {' '}Daily limits are counted per model, and the notice bar always says who wrote the text.
          </p>
        </div>

        <p className="muted small">
          Both groups come from <code>server/models.json</code>: add a model name there and it appears
          here on the next page load, with no code change and no restart.
        </p>
      </section>

      <section className="card">
        <h2>Access keys</h2>
        {groups.map((group) => (
          <KeyRow
            key={group.provider}
            provider={group.provider}
            info={providers[group.provider] || {}}
            busy={busy}
            onSave={onSave}
            onRemove={onRemove}
          />
        ))}
        <p className="muted small">
          Keys are stored in this computer&apos;s database and used from the next request onwards, so no
          restart is needed. Only their last 4 characters are ever shown.
        </p>
      </section>
    </>
  );
}
