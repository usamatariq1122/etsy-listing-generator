import { useMemo, useState } from 'react';
import { STATUS_LABELS, statusLabel, etsyStageLabel } from '../labels.js';

const fmt = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
};

const money = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number.toFixed(2) : '—';
};

// The status a row reports in the tracker: its own label, with a note when it is
// waiting on the text model. Kept to one place so the filter and the cell agree.
const STAGES = Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }));

const typeLabel = (productTypes, value) => {
  if (!value) return 'Auto-detect';
  return productTypes?.find((type) => type.value === value)?.label || value;
};

export default function HistoryView({ products, productTypes = [], onOpen, onRefresh, onDelete, onClear, busy }) {
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('all');
  const [type, setType] = useState('all');
  const [etsyOnly, setEtsyOnly] = useState(false);
  const [sort, setSort] = useState('updated');

  const askClear = () => {
    if (window.confirm('Delete every listing and its files? This cannot be undone.')) {
      onClear();
    }
  };

  // Every filter is a plain predicate over the loaded rows, so the counts shown
  // are exactly what the table lists — the browser is never told one number and
  // shown another.
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = products.filter((row) => {
      if (needle && !row.productName.toLowerCase().includes(needle)) return false;
      if (stage !== 'all' && row.status !== stage) return false;
      if (type !== 'all' && (row.productType || 'general') !== type) return false;
      if (etsyOnly && !row.etsy) return false;
      return true;
    });
    const bySort = {
      updated: (a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt),
      created: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
      name: (a, b) => a.productName.localeCompare(b.productName),
    };
    return rows.sort(bySort[sort] || bySort.updated);
  }, [products, search, stage, type, etsyOnly, sort]);

  const filtersOn = search.trim() || stage !== 'all' || type !== 'all' || etsyOnly;
  const reset = () => {
    setSearch('');
    setStage('all');
    setType('all');
    setEtsyOnly(false);
  };

  return (
    <section className="card">
      <div className="row-between">
        <div>
          <h2>Listings</h2>
          <p className="muted small">
            {products.length} saved · showing {visible.length}
          </p>
        </div>
        <div className="row">
          {products.length > 0 && (
            <button className="danger small" onClick={askClear} disabled={Boolean(busy)}>
              Clear all
            </button>
          )}
          <button onClick={onRefresh} disabled={Boolean(busy)}>Refresh</button>
        </div>
      </div>

      {products.length > 0 && (
        <div className="tracker-filters">
          <input
            className="tracker-search"
            type="search"
            value={search}
            placeholder="Search by product name"
            onChange={(event) => setSearch(event.target.value)}
          />
          <label className="tracker-filter">
            <span>Stage</span>
            <select value={stage} onChange={(event) => setStage(event.target.value)}>
              <option value="all">All stages</option>
              {STAGES.map((entry) => (
                <option key={entry.value} value={entry.value}>{entry.label}</option>
              ))}
            </select>
          </label>
          <label className="tracker-filter">
            <span>Type</span>
            <select value={type} onChange={(event) => setType(event.target.value)}>
              <option value="all">All types</option>
              {productTypes.map((entry) => (
                <option key={entry.value} value={entry.value}>{entry.label}</option>
              ))}
            </select>
          </label>
          <label className="tracker-filter">
            <span>Sort</span>
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="updated">Recently updated</option>
              <option value="created">Recently created</option>
              <option value="name">Name A–Z</option>
            </select>
          </label>
          <label className="tracker-check">
            <input type="checkbox" checked={etsyOnly} onChange={(event) => setEtsyOnly(event.target.checked)} />
            <span>On Etsy only</span>
          </label>
          {filtersOn && (
            <button className="linklike small" onClick={reset}>
              Clear filters
            </button>
          )}
        </div>
      )}

      {products.length === 0 ? (
        <p className="muted">
          Nothing here yet. Products appear after you generate your first listing package.
        </p>
      ) : visible.length === 0 ? (
        <p className="muted">No listings match these filters. Try clearing them.</p>
      ) : (
        <div className="table-scroll">
          <table className="manifest">
            <thead>
              <tr>
                <th>Product</th>
                <th>Type</th>
                <th>Stage</th>
                <th>Price</th>
                <th>Etsy</th>
                <th>Updated</th>
                <th>ZIP</th>
                <th />
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id}>
                  <td className="name">{row.productName}</td>
                  <td className="muted small">{typeLabel(productTypes, row.productType)}</td>
                  <td>{statusLabel(row.status)}</td>
                  <td>{money(row.price)}</td>
                  <td>
                    {row.etsy ? (
                      row.etsy.url ? (
                        <a href={row.etsy.url} target="_blank" rel="noreferrer">
                          {etsyStageLabel(row.etsy)}
                        </a>
                      ) : (
                        <span>{etsyStageLabel(row.etsy)}</span>
                      )
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="muted small">{fmt(row.updatedAt || row.createdAt)}</td>
                  <td>
                    {row.zipReady ? (
                      <a className="download" href={row.downloadUrl} download>
                        Download
                      </a>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    <button className="small" onClick={() => onOpen(row.id)} disabled={Boolean(busy)}>
                      Open
                    </button>
                  </td>
                  <td>
                    <button
                      className="danger small"
                      onClick={() => onDelete(row.id)}
                      disabled={Boolean(busy)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
