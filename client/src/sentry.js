// Browser-side error tracking without the Sentry SDK and without the DSN. The
// write-only DSN lives on the server, so a crash here is forwarded to
// /api/client-error, which reports it to Sentry. Repeats of the same message are
// dropped so a render loop cannot flood the beacon. It sends nothing at all until
// the server has a DSN configured.

let last = '';
let lastAt = 0;

export function initErrorTracking() {
  const send = (name, message, stack) => {
    const text = String(message || '');
    const now = Date.now();
    if (text === last && now - lastAt < 10000) return;
    last = text;
    lastAt = now;
    // keepalive lets the request survive the rare case of a crash on unload.
    fetch('/api/client-error', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, message: text, stack: String(stack || '') }),
      keepalive: true,
    }).catch(() => {});
  };

  window.addEventListener('error', (event) => {
    if (event.error) send(event.error.name || 'Error', event.error.message, event.error.stack);
    else if (event.message) send('Error', event.message, null);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    send(reason?.name || 'UnhandledRejection', reason?.message || String(reason), reason?.stack);
  });

  window.addEventListener('beforeunload', () => {
    lastAt = 0;
  });
}
