// The score the finished listing fields earned against the picked keywords.
// Deliberately worded as a checklist: no tool can promise a search position.
import { useState } from 'react';

export default function SeoScore({ check }) {
  const [open, setOpen] = useState(false);
  if (!check?.items?.length) return null;

  const tone = check.score >= 84 ? 'ok' : check.score >= 50 ? 'warn' : 'error';
  const failing = check.items.filter((item) => !item.pass);

  return (
    <section className="card">
      <div className="row-between">
        <h2>SEO check</h2>
        <span className={`score ${tone}`}>
          {check.score}
          <small>/100</small>
        </span>
      </div>

      <p className="muted small">{check.note}</p>

      <details className="drop" open={open} onToggle={(event) => setOpen(event.target.open)}>
        <summary>
          <span>{failing.length ? `${failing.length} to fix` : 'Every check passed'}</span>
          <em className="drop-meta">{check.keyword ? `main keyword: ${check.keyword}` : 'no keyword picked'}</em>
        </summary>
        <ul className="score-items">
          {check.items.map((item) => (
            <li key={item.label} className={item.pass ? 'pass' : 'fail'}>
              <strong>
                {item.pass ? 'Pass' : 'Fix'} — {item.label}
              </strong>
              <span>{item.detail}</span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
