import { useState } from 'react';
import { providerLabel } from '../labels.js';

// The model and its access keys, on their own sidebar tab. This is the one place
// a key is added or changed; Settings no longer repeats it.

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

export default function KeysView({ settings, busy, onSave, onRemove, onSaveModel }) {
  if (!settings) return <p className="muted">Loading settings…</p>;

  const providers = settings.providers || {};
  const groups = settings.groups || [];
  const selected = settings.selected || {};
  const labelFor = (provider) => groups.find((group) => group.provider === provider)?.label || providerLabel(provider);

  return (
    <>
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
    </>
  );
}
