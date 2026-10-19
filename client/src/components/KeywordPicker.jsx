import { useState } from 'react';
import { api } from '../api.js';

// The keyword tick screen. Suggestions come from real search autocomplete, so a
// seller can choose the words shoppers type instead of the words a model invents.
export default function KeywordPicker({ productName, busy, picked, onPicked }) {
  const [ideas, setIdeas] = useState(null);
  const [lookedUp, setLookedUp] = useState('');
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(null);

  async function lookup() {
    const name = productName.trim();
    if (name.length < 3) {
      setError('Type the product name first, then look up its keywords.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.keywords(name);
      setIdeas(data.ideas);
      setLookedUp(name);
      setOpen(true);
    } catch (err) {
      setError(err.message);
      setIdeas(null);
    } finally {
      setLoading(false);
    }
  }

  // The list belongs to the name it was looked up for, so a later edit to the
  // product name never leaves stale suggestions on screen.
  const stale = Boolean(lookedUp) && lookedUp !== productName.trim();

  function toggle(term) {
    const next = picked.includes(term) ? picked.filter((t) => t !== term) : [...picked, term];
    onPicked(next);
  }

  const fitting = (ideas || []).filter((idea) => idea.fitsTag).map((idea) => idea.term);
  const tickFitting = () => {
    const merged = [...picked];
    for (const term of fitting) if (!merged.includes(term)) merged.push(term);
    onPicked(merged.slice(0, 20));
  };

  return (
    <div className="field">
      <div className="row-between">
        <span>Keyword ideas</span>
        <button type="button" onClick={lookup} disabled={loading || Boolean(busy)}>
          {loading ? 'Looking up…' : lookedUp ? 'Look up again' : 'Find keyword ideas'}
        </button>
      </div>

      {error && <p className="inline-error">{error}</p>}
      {stale && !loading && (
        <p className="inline-note">The product name changed, so these ideas are out of date. Look them up again.</p>
      )}

      {loading && <p className="muted small">Asking search autocomplete what shoppers type for this niche…</p>}

      {ideas && !loading && !ideas.length && (
        <p className="muted small">
          Autocomplete answered nothing for this niche. Generate anyway — the model then works from its own
          judgement, as it did before.
        </p>
      )}

      {ideas?.length > 0 && (
        <>
          {picked.length > 0 && (
            <ul className="chips picked">
              {picked.map((term, i) => (
                <li key={term}>
                  {i === 0 ? `Main: ${term}` : term}
                </li>
              ))}
            </ul>
          )}

          <details className="drop" open={open} onToggle={(event) => setOpen(event.target.open)}>
            <summary>
              <span>Phrases shoppers type</span>
              <em className="drop-meta">
                {picked.length} of {ideas.length} ticked
              </em>
            </summary>

            <p className="muted small">
              Tick the phrases to use. The first tick is treated as the main keyword, so tick that one first.
              A phrase over 20 characters still works in the title and description, just not as a tag.
            </p>
            <div className="ticks">
              {ideas.map((idea) => (
                <label className="tick" key={idea.term}>
                  <input type="checkbox" checked={picked.includes(idea.term)} onChange={() => toggle(idea.term)} />
                  <span>{idea.term}</span>
                  <small className={idea.fitsTag ? 'muted' : 'warn-text'}>
                    {idea.chars} {idea.fitsTag ? 'fits a tag' : 'too long for a tag'}
                  </small>
                </label>
              ))}
            </div>
            <div className="row">
              <button type="button" onClick={tickFitting} disabled={!fitting.length}>
                Tick all that fit a tag
              </button>
              {picked.length > 0 && (
                <button type="button" onClick={() => onPicked([])}>
                  Clear picks
                </button>
              )}
            </div>
          </details>
        </>
      )}
    </div>
  );
}
