import { useCallback, useEffect, useState } from 'react';
import { api, waitForText } from './api.js';
import { modelLabel, providerLabel } from './labels.js';
import ProductForm from './components/ProductForm.jsx';
import Workspace from './components/Workspace.jsx';
import HistoryView from './components/HistoryView.jsx';
import SettingsView from './components/SettingsView.jsx';
import Login from './components/Login.jsx';

// Anything here means the fix is a fresh API key, so offer the Settings panel.
const KEY_PROBLEM = /quota|rate limit|429|api key|insufficient|billing/i;
const QUOTA_PROBLEM = /quota|429|rate limit|no free requests/i;

/** What to click next, given who wrote the guide. */
function rewriteHint(quality) {
  if (quality.provider && quality.provider !== 'gemini') return ', or pick a Gemini model in Settings so Gemini writes the guide';
  if (/lite/i.test(quality.model || '')) return ', or choose a full-size model in Settings';
  return '';
}

export default function App() {
  const [view, setView] = useState('studio');
  const [product, setProduct] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [health, setHealth] = useState(null);
  const [settings, setSettings] = useState(null);
  const [history, setHistory] = useState([]);
  const [session, setSession] = useState(null);

  const loadHealth = useCallback(() => {
    api.health().then(setHealth).catch(() => setHealth(null));
  }, []);

  const refreshAuth = useCallback(async () => {
    try {
      const status = await api.authStatus();
      setSession(status);
      if (status.signedIn) loadHealth();
      return status;
    } catch (err) {
      setSession({ protected: true, signedIn: false, lockedFor: 0, offline: err.message });
      return null;
    }
  }, [loadHealth]);

  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

  /** Any 401 means the cookie died mid-session, so bring the sign-in back. */
  function catch401(err) {
    if (err?.status === 401) refreshAuth();
    setError(err);
  }

  const refreshSettings = useCallback(async () => {
    try {
      setSettings(await api.settings());
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => {
    if (view === 'settings') refreshSettings();
  }, [view, refreshSettings]);

  const refreshHistory = useCallback(async () => {
    try {
      const data = await api.history();
      setHistory(data.products);
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => {
    if (view === 'history') refreshHistory();
  }, [view, refreshHistory]);

  /** Wraps an API call with a loading label and error capture. */
  async function run(label, note, fn) {
    setBusy({ label, note });
    setError(null);
    setNotice(null);
    try {
      return await fn();
    } catch (err) {
      catch401(err);
      return null;
    } finally {
      setBusy(null);
    }
  }

  /** Builds the banner text shown once a generation finishes. */
  function textNotice(product, regenerated) {
    const warnings = product.warnings || {};
    const lines = [];
    if (warnings.cleaningNotes?.length) lines.push(`File 1 was auto-cleaned: ${warnings.cleaningNotes.join(', ')}.`);
    else lines.push(regenerated ? 'Listing text regenerated.' : 'File 1 passed validation with no brackets, citations or footnotes.');
    if (warnings.seoWarnings?.length) {
      lines.push(`Check the SEO limits in File 2: ${warnings.seoWarnings.join(' ')}`);
    }
    const seo = warnings.seoCheck;
    if (seo?.items?.length) {
      const fixes = seo.items.filter((item) => !item.pass).length;
      lines.push(
        fixes
          ? `SEO check: ${seo.score}/100 — ${fixes} item${fixes === 1 ? '' : 's'} to fix in the SEO check panel.`
          : `SEO check: ${seo.score}/100, every check passed.`,
      );
    }
    const quality = warnings.quality;
    if (quality?.model) {
      const busy = quality.skipped?.length ? `, after ${quality.skipped.length} busy model(s) were skipped` : '';
      lines.push(`Written by ${modelLabel(quality)}${busy}.`);
    }
    return lines.join(' ');
  }

  /** Starts the job on the server and waits for the text, without holding one request open. */
  async function generateText(label, note, start) {
    setBusy({ label, note });
    setError(null);
    setNotice(null);
    try {
      const created = await start();
      const id = created.product.id;
      await api.run(id);
      const product = await waitForText(id);
      setProduct(product);
      setNotice(textNotice(product, label === 'Rewriting the listing text'));
      return product;
    } catch (err) {
      catch401(err);
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function handleCreate(productName, keywords) {
    await generateText(
      'Writing your listing package',
      'The text model is generating File 1, File 2 and 7 image prompts. This takes about 30-60 seconds.',
      () => api.create(productName, keywords),
    );
  }

  async function handleRegenerateText() {
    await generateText(
      'Rewriting the listing text',
      'Asking the text model for a fresh version.',
      async () => ({ product }),
    );
  }

  async function handlePackage() {
    const data = await run('Building your ZIP', 'Rendering the two PDFs and packing your images.', () =>
      api.packageZip(product.id),
    );
    if (data) {
      setProduct(data.product);
      const size = (data.zip.bytes / 1024 / 1024).toFixed(2);
      const images = data.zip.images ?? 0;
      setNotice(`${data.zip.name} is ready: 2 PDFs and ${images} image${images === 1 ? '' : 's'} (${size} MB).`);
    }
  }

  async function handleUploadImage(slot, file) {
    const data = await run('Checking your image', `${slot.label} needs to be 4:3 and at least 2000px wide.`, () =>
      api.uploadImage(product.id, slot.id, file),
    );
    if (data) {
      setProduct(data.product);
      setNotice(
        `${slot.label} is set (${data.image.width} × ${data.image.height}px). Create the ZIP again to pack it in.`,
      );
    }
  }

  async function handleRemoveImage(slot) {
    const data = await run('Removing image', null, () => api.removeImage(product.id, slot.id));
    if (data) {
      setProduct(data.product);
      setNotice(`${slot.label} removed.`);
    }
  }

  function openFromHistory(id) {
    setView('studio');
    run('Loading product', null, async () => {
      const data = await api.get(id);
      setProduct(data.product);
    });
  }

  function startOver() {
    setProduct(null);
    setError(null);
    setNotice(null);
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this listing and its PDFs/ZIP?')) return;
    await run('Deleting listing', null, () => api.remove(id));
    if (product?.id === id) startOver();
    refreshHistory();
  }

  async function handleClearHistory() {
    await run('Clearing history', null, () => api.clearHistory());
    startOver();
    setView('studio');
    refreshHistory();
  }

  async function handleSaveKey(provider, key) {
    const data = await run('Saving API key', null, () => api.saveKey(provider, key));
    if (data) {
      setSettings(data);
      setNotice(`${providerLabel(provider)} API key saved. The next generation uses it straight away.`);
      loadHealth();
    }
  }

  async function handleRemoveKey(provider) {
    if (!window.confirm(`Remove the saved ${providerLabel(provider)} key and fall back to server/.env?`)) return;
    const data = await run('Removing API key', null, () => api.removeKey(provider));
    if (data) {
      setSettings(data);
      setNotice(`Saved ${providerLabel(provider)} key removed.`);
      loadHealth();
    }
  }

  async function handleSaveModel(provider, model) {
    const data = await run('Switching model', null, () => api.saveModel(provider, model));
    if (data) {
      setSettings(data);
      setNotice(`${providerLabel(provider)} (${model}) is asked first from the next generation.`);
    }
  }

  async function handleSaveBrand(brand) {
    const data = await run('Saving brand', null, () => api.saveBrand(brand));
    if (data) {
      setSettings(data);
      setNotice(`Guides and PDFs will now be signed as ${brand}.`);
    }
  }

  async function handleChangePassword(current, next) {    const data = await run('Saving password', null, () => api.savePassword(next, current));
    if (data) {
      setSettings(data);
      setNotice('Password saved. Other browsers signed in with this portal have been signed out.');
    }
  }

  async function signOut() {
    await run('Signing out', null, () => api.logout());
    refreshAuth();
    setProduct(null);
  }

  // The whole portal is behind the password, so nothing else is fetched until
  // the session is confirmed.
  if (!session) return <div className="app"><main><p className="muted">Checking your sign-in…</p></main></div>;
  if (!session.signedIn) return <Login status={session} onSignedIn={refreshAuth} />;

  // The short-guide warning travels with the product, so it survives a reload.
  const quality = view === 'studio' && product ? product.warnings?.quality : null;

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>Etsy Digital Listing Generator</h1>
          <p className="subtitle">Listing text, image prompts and a ready-to-upload ZIP of PDFs.</p>
        </div>
        <nav>
          <button className={view === 'studio' ? 'nav active' : 'nav'} onClick={() => setView('studio')}>
            Generator
          </button>
          <button className={view === 'history' ? 'nav active' : 'nav'} onClick={() => setView('history')}>
            History
          </button>
          <button
            className={view === 'settings' ? 'nav active' : 'nav'}
            onClick={() => {
              setView('settings');
              refreshSettings();
            }}
          >
            Settings
          </button>
          {session.protected && (
            <button className="nav" onClick={signOut} disabled={Boolean(busy)}>
              Sign out
            </button>
          )}
        </nav>
      </header>

      {health && health.missingProviders?.length > 0 && view !== 'settings' && (
        <div className="banner warn">
          <strong>No API key for {health.missingProviders.map(providerLabel).join(' or ')}.</strong> Open Settings and paste a key
          under Access keys to start generating again.
        </div>
      )}

      {error && (
        <div className="banner error">
          <strong>{error.message}</strong>
          {error.issues?.length > 0 && (
            <ul>
              {error.issues.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          )}
          <button className="linklike" onClick={() => setError(null)}>Dismiss</button>
          {KEY_PROBLEM.test(error.message) && view !== 'settings' && (
            <button className="linklike" onClick={() => setView('settings')}>
              {QUOTA_PROBLEM.test(error.message) ? 'Switch model or update key' : 'Update API key'}
            </button>
          )}
        </div>
      )}

      {notice && !error && (
        <div className="banner ok">
          {notice}
          <button className="linklike" onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      )}

      {quality?.notes?.length > 0 && (
        <div className="banner warn">
          <strong>
            {modelLabel(quality)} wrote File 1 at {quality.words} words.
          </strong>
          <ul>
            {quality.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
          <div className="muted">
            No PDFs were rendered when this text was saved. Click “Rewrite text” to ask the models again
            {rewriteHint(quality)} — creating the ZIP will still print whatever is stored now.
          </div>
        </div>
      )}

      {busy && (
        <div className="banner busy">
          <span className="spinner" />
          <div>
            <strong>{busy.label}&hellip;</strong>
            {busy.note && <div className="muted">{busy.note}</div>}
          </div>
        </div>
      )}

      <main>
        {view === 'settings' ? (
          <SettingsView
            settings={settings}
            busy={busy}
            onSave={handleSaveKey}
            onRemove={handleRemoveKey}
            onSaveModel={handleSaveModel}
            onSaveBrand={handleSaveBrand}
            onChangePassword={handleChangePassword}
          />
        ) : view === 'history' ? (
          <HistoryView
            products={history}
            onOpen={openFromHistory}
            onRefresh={refreshHistory}
            onDelete={handleDelete}
            onClear={handleClearHistory}
            busy={busy}
          />
        ) : product ? (
          <Workspace
            product={product}
            busy={busy}
            onRegenerateText={handleRegenerateText}
            onPackage={handlePackage}
            onUploadImage={handleUploadImage}
            onRemoveImage={handleRemoveImage}
            onStartOver={startOver}
          />
        ) : (
          <ProductForm busy={busy} onCreate={handleCreate} />
        )}
      </main>
    </div>
  );
}
