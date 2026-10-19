import { useState } from 'react';
import { api } from '../api.js';

export default function Login({ status, onSignedIn }) {
  const settingUp = !status?.protected;
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = status?.lockedFor > 0;

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    if (settingUp && password !== confirm) {
      setError('Both entries must match.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      if (settingUp) await api.savePassword(password);
      else await api.login(password);
      setPassword('');
      setConfirm('');
      onSignedIn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>Etsy Digital Listing Generator</h1>
          <p className="subtitle">Listing text, image prompts and a ready-to-upload ZIP of PDFs.</p>
        </div>
      </header>

      <main>
        <section className="card login">
          <h2>{settingUp ? 'Create a password' : 'Sign in'}</h2>

          {settingUp ? (
            <p className="muted">
              This portal spends your model quota on every generation, so it asks for a
              password before anything else works. It is stored as a hash in the database and shown to
              nobody; you can change it later in Settings. Pick something you will remember - there is
              no email reset.
            </p>
          ) : (
            <p className="muted">Enter the password you set for this portal.</p>
          )}

          <form onSubmit={submit} className="stack">
            <label className="field">
              <span>{settingUp ? 'New password' : 'Password'}</span>
              <input
                type="password"
                value={password}
                autoComplete={settingUp ? 'new-password' : 'current-password'}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy || locked}
                autoFocus
              />
            </label>

            {settingUp && (
              <label className="field">
                <span>Repeat it</span>
                <input
                  type="password"
                  value={confirm}
                  autoComplete="new-password"
                  onChange={(e) => setConfirm(e.target.value)}
                  disabled={busy}
                />
              </label>
            )}

            {locked && <p className="inline-error">Too many tries. Wait {status.lockedFor} seconds and reload.</p>}
            {error && <p className="inline-error">{error}</p>}

            <div className="row">
              <button type="submit" className="primary" disabled={busy || locked || password.length === 0}>
                {busy ? (settingUp ? 'Saving…' : 'Checking…') : settingUp ? 'Set password' : 'Sign in'}
              </button>
            </div>
          </form>

          <p className="muted small">At least 8 characters.</p>
        </section>
      </main>
    </div>
  );
}
