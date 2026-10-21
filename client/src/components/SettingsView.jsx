import { useEffect, useState } from 'react';
import { providerLabel } from '../labels.js';

const SOURCE = {
  user: 'your own saved key',
  shared: 'the portal\'s saved key',
  app: 'saved in this app',
  env: 'loaded from server/.env',
};

// A key the app stored (yours or the shared one) can be removed; an .env key can
// only be shadowed by saving your own over it.
const SAVED_SOURCES = ['user', 'shared', 'app'];

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
            {SAVED_SOURCES.includes(info.source) && (
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

function PasswordRow({ onChange, busy, configured }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');

  function submit(event) {
    event.preventDefault();
    if (configured && !current) return setError('Enter your current password.');
    if (next.length < 8) return setError('The password needs at least 8 characters.');
    if (next !== repeat) return setError('Both entries must match.');
    setError('');
    onChange(current, next);
    setCurrent('');
    setNext('');
    setRepeat('');
  }

  return (
    <form onSubmit={submit} className="stack">
      {configured && (
        <label className="field">
          <span>Current password</span>
          <input type="password" value={current} autoComplete="current-password" onChange={(e) => setCurrent(e.target.value)} disabled={Boolean(busy)} />
        </label>
      )}
      <div className="row">
        <label className="field">
          <span>{configured ? 'New password' : 'Password'}</span>
          <input type="password" value={next} autoComplete="new-password" onChange={(e) => setNext(e.target.value)} disabled={Boolean(busy)} />
        </label>
        <label className="field">
          <span>Repeat it</span>
          <input type="password" value={repeat} autoComplete="new-password" onChange={(e) => setRepeat(e.target.value)} disabled={Boolean(busy)} />
        </label>
      </div>
      {error && <p className="inline-error">{error}</p>}
      <div className="row">
        <button
          type="submit"
          className="primary"
          disabled={Boolean(busy) || !next || !repeat || (configured && !current)}
        >
          {configured ? 'Change password' : 'Create password'}
        </button>
      </div>
    </form>
  );
}

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

function PromptCard({ types, busy, onSave, onRemove }) {
  const [value, setValue] = useState(types[0]?.value ?? 'general');
  const current = types.find((type) => type.value === value) || types[0];
  const [draft, setDraft] = useState(current?.body ?? '');

  // Re-seed the editor whenever the selected type or its saved wording changes,
  // so a refresh after saving shows the stored text rather than a stale draft.
  useEffect(() => {
    if (current) setDraft(current.body);
  }, [current?.value, current?.body]);

  if (!current) return null;
  const dirty = draft !== current.body;

  function submit(event) {
    event.preventDefault();
    onSave(current.value, draft);
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>Listing prompts</h2>
        <span className="muted small">the brief the text model writes from</span>
      </div>

      <label className="field">
        <span>Product type</span>
        <select value={current.value} onChange={(e) => setValue(e.target.value)} disabled={Boolean(busy)}>
          {types.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
              {type.customised ? ' (customised)' : ''}
            </option>
          ))}
        </select>
      </label>

      <p className="muted small">
        Edit what the model is told to write for <strong>{current.label.toLowerCase()}</strong> listings. Keep the
        <code> {'{{product}}'} </code> and <code> {'{{brand}}'} </code> markers and leave the JSON shape at the end of
        the file intact, or listings stop parsing. Auto-detect keeps inferring the type from the product name.
      </p>

      <form onSubmit={submit} className="stack">
        <textarea
          className="desc-editor"
          value={draft}
          spellCheck={false}
          rows={18}
          onChange={(e) => setDraft(e.target.value)}
          disabled={Boolean(busy)}
        />
        <div className="row">
          <button type="submit" className="primary" disabled={Boolean(busy) || !dirty || !draft.trim()}>
            Save prompt
          </button>
          {current.customised && (
            <button type="button" onClick={() => onRemove(current.value)} disabled={Boolean(busy)}>
              Revert to built-in
            </button>
          )}
        </div>
      </form>
      <p className="muted small">
        The output format and keyword handling are added around this text by the app and cannot be edited here, so a
        saved prompt always still produces a valid listing. Reverting restores the built-in brief exactly.
      </p>
    </section>
  );
}

export default function SettingsView({ settings, busy, prompts, canManagePrompts, onSave, onRemove, onSaveModel, onSaveBrand, onSaveTheme, onRemoveTheme, onSavePrompt, onRemovePrompt, onChangePassword }) {
  const [brandDraft, setBrandDraft] = useState(null);
  const [localError, setLocalError] = useState('');

  if (!settings) return <p className="muted">Loading settings…</p>;

  const providers = settings.providers || {};
  const groups = settings.groups || [];
  const selected = settings.selected || {};
  const labelFor = (provider) => groups.find((group) => group.provider === provider)?.label || providerLabel(provider);
  const savedBrand = settings.brand || '';
  const configured = Boolean(settings.passwordSet);
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

      {canManagePrompts && prompts && prompts.length > 0 && (
        <PromptCard types={prompts} busy={busy} onSave={onSavePrompt} onRemove={onRemovePrompt} />
      )}

      <section className="card">
        <div className="card-head">
          <h2>Model</h2>
          <span className="muted small">{labelFor(selected.provider)} &middot; {selected.model}</span>
        </div>

        <div className="field-row">
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
            {selected.provider === 'gemini'
              ? 'Gemini is asked first and walks its own models from best to lite when one is busy. Groq and OpenRouter answer after it, each with the first model of its group.'
              : `${labelFor(selected.provider)} is asked first with ${selected.model}; if it declines, the other providers are tried in turn, with Gemini walking its models from best to lite.`}
            {' '}Daily limits are counted per model, and the notice bar always says who wrote the text.
          </p>
        </div>

        <p className="muted small">
          Every group comes from <code>server/models.json</code>: add a model name there and it appears
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
          Keys are encrypted before they are saved and used from the next request onwards, so no
          restart is needed. Only their last 4 characters are ever shown.
        </p>
      </section>

      <section className="card">
        <h2>Portal password</h2>
        <p className="muted small">
          {configured
            ? 'Every page and every download needs this password, so nobody else can run up your model limits on your keys. Only a salted hash is stored. Changing it signs out any other browser.'
            : 'No password yet, so this portal is open to anyone who reaches its address. Once you host it, the first screen you see asks for one - every page and every download then needs it, and only a salted hash is stored.'}
        </p>
        {onChangePassword ? (
          <PasswordRow onChange={onChangePassword} busy={busy} configured={configured} />
        ) : (
          <p className="muted small">Loading…</p>
        )}
      </section>
    </>
  );
}
