import { useEffect, useState } from 'react';

// Portal access lives on the sidebar chip, not buried in Settings. Opening the
// chip drops this dialog so the one owner decision — protect the portal with a
// password or leave it open — is made right where the status is shown.

export default function PortalAccess({ open, configured, busy, onChange, onClose }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');

  // Start clean every time the dialog opens, and whenever the stored state flips.
  useEffect(() => {
    if (open) {
      setCurrent('');
      setNext('');
      setRepeat('');
      setError('');
    }
  }, [open, configured]);

  // Esc closes it, matching how the rest of the app dismisses overlays.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

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
    <div className="modal-scrim" onClick={onClose} role="presentation">
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Portal access">
        <div className="row-between">
          <h2>Portal access</h2>
          <span className={configured ? 'pill ok' : 'pill warn'}>{configured ? 'Protected' : 'Open'}</span>
        </div>
        <p className="muted small">
          {configured
            ? 'Every page and every download needs this password, so nobody else can run up your model limits on your keys. Only a salted hash is stored. Changing it signs out any other browser.'
            : 'No password yet, so this portal is open to anyone who reaches its address. Set one and every page and download will need it - only a salted hash is stored.'}
        </p>

        <form onSubmit={submit} className="stack">
          {configured && (
            <label className="field">
              <span>Current password</span>
              <input type="password" value={current} autoComplete="current-password" onChange={(e) => setCurrent(e.target.value)} disabled={Boolean(busy)} />
            </label>
          )}
          <label className="field">
            <span>{configured ? 'New password' : 'Password'}</span>
            <input type="password" value={next} autoComplete="new-password" onChange={(e) => setNext(e.target.value)} disabled={Boolean(busy)} />
          </label>
          <label className="field">
            <span>Repeat it</span>
            <input type="password" value={repeat} autoComplete="new-password" onChange={(e) => setRepeat(e.target.value)} disabled={Boolean(busy)} />
          </label>

          {error && <p className="inline-error">{error}</p>}

          <div className="row">
            <button type="submit" className="primary" disabled={Boolean(busy) || !next || !repeat || (configured && !current)}>
              {configured ? 'Change password' : 'Create password'}
            </button>
            <button type="button" onClick={onClose} disabled={Boolean(busy)}>
              Close
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
