// The score the finished listing fields earned against the picked keywords.
// Deliberately worded as a checklist: no tool can promise a search position.
export default function SeoScore({ check }) {
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

      <p className="muted small">
        Scored against {check.keyword ? `the main keyword “${check.keyword}”` : 'the listing fields'} and{' '}
        {check.total - failing.length} of {check.total} checks passed. {check.note}
      </p>

      <ul className="score-items">
        {check.items.map((item) => (
          <li key={item.label} className={item.pass ? 'pass' : 'fail'}>
            <strong>{item.pass ? 'Pass' : 'Fix'} — {item.label}</strong>
            <span>{item.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
