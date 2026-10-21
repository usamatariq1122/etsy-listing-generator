import { useState } from 'react';
import { api } from '../api.js';
import LegalView from './LegalView.jsx';

// Accounts first: an email and password each own their listings and files. The
// legacy single portal password stays reachable for a solo owner who set one, so
// nothing that worked before stops working now.
export default function Login({ status, onSignedIn }) {
  const canPassword = Boolean(status?.protected);
  const firstAccount = Boolean(status?.needsSetup);
  // A reset link points the browser at /reset?token=…, so land on that form directly.
  const arrivingReset = typeof window !== 'undefined' && window.location.pathname.startsWith('/reset');
  const [mode, setMode] = useState(arrivingReset ? 'reset' : firstAccount ? 'signup' : 'signin');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [legacy, setLegacy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [resetLink, setResetLink] = useState(null);
  const [busy, setBusy] = useState(false);
  const [legal, setLegal] = useState(null);

  const locked = status?.lockedFor > 0;
  const isSignup = mode === 'signup';
  const isReset = mode === 'reset';

  function switchMode(next) {
    setMode(next);
    setError('');
    setNote('');
    setResetLink(null);
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError('');
    setNote('');

    if (mode === 'password') {
      await act(() => api.login(legacy), () => setLegacy(''), 'Signing in the portal…');
      return;
    }
    if (mode === 'forgot') {
      setBusy('Sending…');
      try {
        const result = await api.forgot(email);
        if (result?.token) {
          // No mail here, but a local build handed the link straight back.
          setResetLink(`/reset?token=${encodeURIComponent(result.token)}`);
          setNote('Mail is not set up here, so use this link to choose a new password.');
        } else if (result?.mail) {
          setNote('If that address has an account, a reset link is on its way. Open it to choose a new password.');
        } else {
          setNote('This portal cannot send email, so a reset link is not available. Ask the owner to reset your password.');
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setBusy(null);
      }
      return;
    }
    if (isReset) {
      if (password !== confirm) {
        setError('Both entries must match.');
        return;
      }
      const token = new URLSearchParams(window.location.search).get('token');
      await act(() => api.reset({ email, token, password }), () => switchMode('signin'), 'Saving…');
      return;
    }
    if (isSignup && password !== confirm) {
      setError('Both entries must match.');
      return;
    }
    const call = isSignup ? api.signUp({ email, password, name }) : api.accountSignIn({ email, password });
    await act(call, () => setPassword(''), isSignup ? 'Creating your account…' : 'Signing in…');
  }

  /** Runs one auth call, then either returns to the app (a session was set) or keeps the screen with a note. */
  async function act(fn, clear, label) {
    setBusy(label);
    try {
      const result = await fn();
      clear?.();
      // Sign in and sign up hand back a session; the others (forgot, reset) stay.
      if (result && (result.signedIn || result.account)) onSignedIn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  if (legal) {
    return (
      <div className="app">
        <main><LegalView doc={legal} onBack={() => setLegal(null)} contactEmail={status?.contactEmail} /></main>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>Listora</h1>
          <p className="subtitle">Listing text, image prompts and a ready-to-upload ZIP of PDFs.</p>
        </div>
      </header>

      <main>
        <section className="card login">
          <h2>
            {mode === 'password'
              ? 'Portal password'
              : mode === 'forgot'
                ? 'Reset your password'
                : isReset
                  ? 'Choose a new password'
                  : isSignup
                    ? 'Create your account'
                    : 'Sign in'}
          </h2>

          {firstAccount && isSignup && (
            <p className="muted">
              No accounts exist yet, so the first one you create becomes the owner of this portal.
            </p>
          )}

          <form onSubmit={submit} className="stack">
            {mode !== 'password' && (
              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  value={email}
                  autoComplete="email"
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy || locked}
                  autoFocus
                />
              </label>
            )}

            {isSignup && (
              <label className="field">
                <span>Your name <span className="muted">(optional)</span></span>
                <input
                  type="text"
                  value={name}
                  autoComplete="name"
                  onChange={(e) => setName(e.target.value)}
                  disabled={busy}
                />
              </label>
            )}

            {(isSignup || isReset || mode === 'password') && (
              <label className="field">
                <span>{mode === 'password' ? 'Password' : isSignup ? 'Password' : isReset ? 'New password' : 'Password'}</span>
                <input
                  type="password"
                  value={mode === 'password' ? legacy : password}
                  autoComplete={isSignup || isReset ? 'new-password' : 'current-password'}
                  onChange={(e) => (mode === 'password' ? setLegacy(e.target.value) : setPassword(e.target.value))}
                  disabled={busy || locked}
                />
              </label>
            )}

            {(isSignup || isReset) && (
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
            {note && <p className="muted">{note}</p>}
            {resetLink && (
              <p className="row">
                <a className="button primary" href={resetLink}>Open reset link</a>
              </p>
            )}

            <div className="row">
              <button type="submit" className="primary" disabled={Boolean(busy) || locked}>
                {busy ||
                  (mode === 'password'
                    ? 'Sign in'
                    : mode === 'forgot'
                      ? 'Send reset link'
                      : isReset
                        ? 'Set password'
                        : isSignup
                          ? 'Create account'
                          : 'Sign in')}
              </button>
            </div>
          </form>

          <div className="row login-switch">
            {mode === 'signin' && (
              <>
                <button className="linklike" onClick={() => switchMode('signup')}>Create an account</button>
                <button className="linklike" onClick={() => switchMode('forgot')}>Forgot password?</button>
                {canPassword && (
                  <button className="linklike" onClick={() => switchMode('password')}>Use portal password</button>
                )}
              </>
            )}
            {mode === 'signup' && <button className="linklike" onClick={() => switchMode('signin')}>I already have an account</button>}
            {isReset && <button className="linklike" onClick={() => switchMode('signin')}>Back to sign in</button>}
            {(mode === 'forgot' || mode === 'password') && (
              <button className="linklike" onClick={() => switchMode('signin')}>Back to sign in</button>
            )}
          </div>

          <p className="muted small">Passwords are at least 8 characters. Everything you generate stays in your own account.</p>
        </section>

        <div className="row legal-links">
          <button className="linklike" onClick={() => setLegal('terms')}>Terms of Service</button>
          <button className="linklike" onClick={() => setLegal('privacy')}>Privacy Policy</button>
          {status?.contactEmail && (
            <a className="linklike" href={`mailto:${status.contactEmail}`}>{status.contactEmail}</a>
          )}
        </div>
        <p className="trademark-note small muted center">
          The term "Etsy" is a trademark of Etsy, Inc. This application uses the Etsy API but is not
          endorsed or certified by Etsy, Inc.
        </p>
      </main>
    </div>
  );
}
