import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// sentry.js reads config.sentryDsn once, when it is first imported. config.js can
// only be mocked once per file, so it is mocked with a DSN here and the real
// no-DSN install is covered by parseDsn's rejection of bad input plus the wiring
// that keeps reportError a no-op when sentryEnabled() is false. fetch is stubbed
// so nothing reaches the network.

mock.module('../src/config.js', {
  namedExports: { config: { sentryDsn: 'https://key@o.ingest.example/77', environment: 'ci' } },
});

const events = [];
mock.method(globalThis, 'fetch', async (url, options) => {
  events.push({ url: String(url), body: JSON.parse(options.body) });
  return new Response('', { status: 200 });
});

const { parseDsn, reportError, sentryEnabled } = await import('../src/sentry.js');

test('parseDsn accepts the full form and refuses anything without a key and project', () => {
  assert.deepEqual(parseDsn('https://abc123@o1.ingest.sentry.io/456'), {
    key: 'abc123',
    project: '456',
    base: 'https://o1.ingest.sentry.io',
  });
  assert.equal(parseDsn('https://example.com/456'), null); // no key
  assert.equal(parseDsn('https://abc123@example.com'), null); // no project
  assert.equal(parseDsn('not a dsn'), null);
  assert.equal(parseDsn(''), null);
});

test('sentryEnabled is true once a usable DSN is present', () => {
  assert.equal(sentryEnabled(), true);
});

test('reportError posts a shaped event to the store endpoint', async () => {
  const ok = await reportError(new Error('kaboom'), { source: 'api', requestId: 'r-1' });
  assert.equal(ok, true);
  assert.equal(events.length, 1);
  assert.match(events[0].url, /o\.ingest\.example\/api\/77\/store\/\?sentry_key=key/);
  assert.equal(events[0].body.message, 'api: kaboom');
  assert.equal(events[0].body.environment, 'ci');
  assert.equal(events[0].body.tags.request_id, 'r-1');
  assert.equal(events[0].body.exception.values[0].value, 'kaboom');
});
