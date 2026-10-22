import { useCallback, useEffect, useRef, useState } from 'react';
import { api, waitForText } from '../api.js';

const SAMPLE = 'product_name,keywords,pattern\nCrochet bucket hat,yarn; summer hat,"Round brim, single crochet, 6mm hook, DK yarn…"\nMacrame wall hanging,boho decor,"8mm cotton rope, square knot pattern, 60cm wide…"';

const LABEL = {
  queued: 'Not started',
  running: 'Generating…',
  done: 'Listing written',
  failed: 'Failed',
};

export default function BulkView({ onNotice, onOpenProduct }) {
  const [csv, setCsv] = useState(SAMPLE);
  const [name, setName] = useState('');
  const [originalConfirmed, setOriginalConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [job, setJob] = useState(null);
  const [rows, setRows] = useState([]);
  const [jobs, setJobs] = useState([]);
  const cancel = useRef(false);

  const loadJobs = useCallback(async () => {
    try {
      const data = await api.bulkJobs();
      setJobs(data.jobs || []);
    } catch {
      // The history list is a convenience; a failure here should not block the screen.
    }
  }, []);

  useEffect(() => {
    loadJobs();
    return () => {
      cancel.current = true;
    };
  }, [loadJobs]);

  function patch(idx, fields) {
    setRows((current) => current.map((row) => (row.idx === idx ? { ...row, ...fields } : row)));
  }

  async function create() {
    setBusy(true);
    setError('');
    try {
      const data = await api.createBulk(name || 'Bulk batch', csv, originalConfirmed);
      setJob(data.job);
      setRows(data.rows);
      setStatus(`${data.job.rows} listings created${data.job.skipped ? `, ${data.job.skipped} rows skipped` : ''}. Generate them below or with “Generate all”.`);
      loadJobs();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function runRow(row) {
    patch(row.idx, { status: 'running' });
    await api.setBulkRow(job.id, row.idx, 'running').catch(() => {});
    try {
      await api.run(row.productId);
      await waitForText(row.productId);
      await api.setBulkRow(job.id, row.idx, 'done').catch(() => {});
      patch(row.idx, { status: 'done' });
      return true;
    } catch (err) {
      await api.setBulkRow(job.id, row.idx, 'failed').catch(() => {});
      patch(row.idx, { status: 'failed', error: err.message });
      return false;
    }
  }

  async function generateAll() {
    setBusy(true);
    cancel.current = false;
    const todo = rows.filter((row) => row.status !== 'done');
    let ok = 0;
    for (const row of todo) {
      if (cancel.current) break;
      setStatus(`Generating ${row.productName} (${ok + 1} of ${todo.length})…`);
      if (await runRow(row)) ok += 1;
    }
    setStatus(cancel.current ? 'Stopped.' : `Done. ${ok} of ${todo.length} listings written.`);
    setBusy(false);
    loadJobs();
  }

  async function openJob(id) {
    setBusy(true);
    try {
      const data = await api.bulkJob(id);
      setJob(data.job);
      setRows(data.rows);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function retryFailed() {
    setBusy(true);
    try {
      await api.retryBulk(job.id);
      const data = await api.bulkJob(job.id);
      setRows(data.rows);
      setStatus('Failed rows are back in the queue. Run them again.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const openProduct = (row) => onOpenProduct(row.productId);
  const pending = rows.filter((row) => row.status !== 'done').length;
  const failed = rows.filter((row) => row.status === 'failed').length;

  return (
    <div className="stack">
      <section className="card">
        <h2>Bulk CSV</h2>
        <p className="muted small">
          One product name per row, plus a <code>pattern</code> column holding your own pattern or product
          content for each — the listing is written around it. A header line names the columns
          (<code>product_name</code>, optional <code>keywords</code>, <code>pattern</code>). A batch is capped at
          50 listings. Each row is then written by the same generator the studio uses, one at a time, so it never
          spends more model quota than clicking through them would.
        </p>
        <label className="field">
          <span>Batch name (optional)</span>
          <input type="text" value={name} maxLength={120} placeholder="Autumn patterns" onChange={(e) => setName(e.target.value)} disabled={busy} />
        </label>
        <label className="field">
          <span>CSV</span>
          <textarea className="desc-editor" rows={6} value={csv} spellCheck={false} onChange={(e) => setCsv(e.target.value)} disabled={busy} />
        </label>
        <label className="field checkbox required">
          <input type="checkbox" checked={originalConfirmed} onChange={(e) => setOriginalConfirmed(e.target.checked)} disabled={busy} />
          <span>Every pattern in this batch is my own original, tested design</span>
        </label>
        <div className="row">
          <button className="primary" onClick={create} disabled={busy || !csv.trim() || !originalConfirmed}>
            Create batch
          </button>
        </div>
        {error && <p className="inline-error">{error}</p>}
        <p className="inline-note">
          Bulk mode writes the listing text only. It never sends anything to Etsy or publishes on its own.
          Open each finished row to review it, add your real photo and price, and press Publish yourself.
        </p>
      </section>

      {jobs.length > 0 && (
        <section className="card">
          <h2>Recent batches</h2>
          <ul className="slots">
            {jobs.map((entry) => (
              <li className="slot" key={entry.id}>
                <div className="slot-body">
                  <div className="row-between">
                    <div>
                      <strong>{entry.name}</strong>
                      <p className="muted small">
                        {entry.rows} rows · {entry.done} done
                        {entry.failed ? ` · ${entry.failed} failed` : ''}
                      </p>
                    </div>
                    <button className="small" onClick={() => openJob(entry.id)} disabled={busy}>
                      Open
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {job && (
        <section className="card">
          <div className="row-between">
            <h2>{job.name}</h2>
            <div className="row">
              <button onClick={generateAll} disabled={busy || pending === 0}>
                {busy ? 'Working…' : `Generate all (${pending})`}
              </button>
              {failed > 0 && (
                <button className="small" onClick={retryFailed} disabled={busy}>
                  Retry failed ({failed})
                </button>
              )}
              {busy && (
                <button className="linklike" onClick={() => { cancel.current = true; }}>
                  Stop
                </button>
              )}
            </div>
          </div>
          {status && <p className="muted small">{status}</p>}

          <ul className="slots">
            {rows.map((row) => (
              <li className="slot" key={row.idx}>
                <div className="slot-body">
                  <div className="row-between">
                    <div>
                      <strong>{row.productName}</strong>
                      <p className="muted small">
                        <span className={row.status === 'failed' ? 'inline-error' : ''}>{LABEL[row.status] || row.status}</span>
                        {row.error ? ` — ${row.error}` : ''}
                      </p>
                    </div>
                    <div className="row">
                      {row.status === 'done' ? (
                        <button className="small" onClick={() => openProduct(row)} disabled={busy}>
                          Open
                        </button>
                      ) : (
                        <button className="small" onClick={() => runRow(row)} disabled={busy}>
                          Generate
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
