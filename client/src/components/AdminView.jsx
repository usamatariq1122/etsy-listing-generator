import { useEffect, useState } from 'react';
import { api } from '../api.js';

const fmt = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
};

function Tile({ label, value }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

export default function AdminView() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    setError('');
    try {
      setData(await api.adminOverview());
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (error) {
    return (
      <section className="card">
        <h2>Admin</h2>
        <p className="inline-error">{error}</p>
        <button onClick={load} disabled={busy}>Try again</button>
      </section>
    );
  }

  if (!data) return <p className="muted">Loading the dashboard…</p>;

  const { totals, users, failed, dailyLimit } = data;
  const limitNote = dailyLimit > 0 ? `${dailyLimit} per day` : 'no daily cap';

  return (
    <div className="stack">
      <section className="card">
        <div className="card-head">
          <h2>Admin</h2>
          <button className="small" onClick={load} disabled={busy}>{busy ? 'Refreshing…' : 'Refresh'}</button>
        </div>
        <div className="stat-grid">
          <Tile label="Accounts" value={totals.users} />
          <Tile label="Listings" value={totals.products} />
          <Tile label="Failed" value={totals.failed} />
        </div>
        <p className="muted small">
          The daily cap is {limitNote}. Counts reset at midnight UTC. Admins are exempt from the cap.
        </p>
      </section>

      <section className="card">
        <h2>Accounts</h2>
        {users.length === 0 ? (
          <p className="muted">No accounts yet.</p>
        ) : (
          <div className="table-scroll">
            <table className="manifest">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Verified</th>
                  <th>Used today</th>
                  <th>Total</th>
                  <th>Listings</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="name">{u.name ? `${u.name} ` : ''}<span className="muted">{u.email}</span></td>
                    <td>{u.role === 'admin' ? 'owner' : 'user'}</td>
                    <td>{u.verified_at ? 'yes' : 'no'}</td>
                    <td>{u.role === 'admin' || dailyLimit <= 0 ? '—' : `${u.generation_today} of ${dailyLimit}`}</td>
                    <td>{u.generation_count}</td>
                    <td>{u.product_count}</td>
                    <td>{fmt(u.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Failed listings</h2>
        {failed.length === 0 ? (
          <p className="muted">Nothing failed recently.</p>
        ) : (
          <div className="table-scroll">
            <table className="manifest">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Owner</th>
                  <th>Why</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {failed.map((row) => (
                  <tr key={row.id}>
                    <td className="name">{row.product_name}</td>
                    <td>{row.email || <span className="muted">no owner</span>}</td>
                    <td>{row.error}</td>
                    <td>{fmt(row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
