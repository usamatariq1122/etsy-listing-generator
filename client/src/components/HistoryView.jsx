import { statusLabel } from '../labels.js';

const fmt = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
};

export default function HistoryView({ products, onOpen, onRefresh, onDelete, onClear, busy }) {
  const askClear = () => {
    if (window.confirm('Delete every listing and its files? This cannot be undone.')) {
      onClear();
    }
  };

  return (
    <section className="card">
      <div className="row-between">
        <h2>History</h2>
        <div className="row">
          {products.length > 0 && (
            <button className="danger small" onClick={askClear} disabled={Boolean(busy)}>
              Clear all
            </button>
          )}
          <button onClick={onRefresh} disabled={Boolean(busy)}>Refresh</button>
        </div>
      </div>

      {products.length === 0 ? (
        <p className="muted">
          Nothing here yet. Products appear after you generate your first listing package.
        </p>
      ) : (
        <div className="table-scroll">
          <table className="manifest">
            <thead>
              <tr>
                <th>Product</th>
                <th>Status</th>
                <th>Created</th>
                <th>ZIP</th>
                <th />
                <th />
              </tr>
            </thead>
            <tbody>
              {products.map((row) => (
                <tr key={row.id}>
                  <td className="name">{row.productName}</td>
                  <td>{statusLabel(row.status)}</td>
                  <td>{fmt(row.createdAt)}</td>
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
