import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractJson } from '../src/jsonparse.js';
import { withRetry } from '../src/retry.js';

test('extractJson parses plain, fenced and prose-wrapped JSON', () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
  assert.deepEqual(extractJson('```json\n{"a": 1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('```\n{"a": [1,2]}\n```'), { a: [1, 2] });
  assert.deepEqual(extractJson('Sure! Here it is: {"a":{"b":2}} — enjoy.'), { a: { b: 2 } });
});

test('extractJson throws a 502 HttpError-style failure with a detail excerpt', () => {
  assert.throws(() => extractJson('no json at all'), (error) => {
    assert.equal(error.status, 502);
    assert.match(error.message, /did not return valid JSON/);
    assert.equal(error.detail, 'no json at all');
    return true;
  });
  assert.throws(() => extractJson(''), (error) => error.status === 502);
});

const flaky = (failures, message) => {
  let calls = 0;
  const fn = async () => {
    calls += 1;
    if (calls <= failures) throw new Error(message);
    return calls;
  };
  return { fn, calls: () => calls };
};

test('withRetry returns on success without retrying', async () => {
  const { fn, calls } = flaky(0, 'never');
  assert.equal(await withRetry(fn, { delayMs: 1 }), 1);
  assert.equal(calls(), 1);
});

test('withRetry retries transient 5xx failures up to two attempts', async () => {
  const { fn, calls } = flaky(1, 'upstream {"code": 503} high demand');
  assert.equal(await withRetry(fn, { delayMs: 1 }), 2);
  assert.equal(calls(), 2);
});

test('withRetry rethrows the last transient error when attempts run out', async () => {
  const { fn, calls } = flaky(9, 'upstream {"code": 500}');
  await assert.rejects(() => withRetry(fn, { attempts: 3, delayMs: 1 }), /500/);
  assert.equal(calls(), 3);
});

test('withRetry fails fast on quota and rate-limit dead ends', async () => {
  for (const message of ['RESOURCE_EXHAUSTED', 'Daily quota exceeded', 'rate limit hit', '{"code":429}']) {
    const { fn, calls } = flaky(9, message);
    await assert.rejects(() => withRetry(fn, { attempts: 3, delayMs: 1 }), new RegExp(message.slice(0, 6).replace(/[[\]{}()]/g, '\\$&')));
    assert.equal(calls(), 1, `no retry for: ${message}`);
  }
});

test('withRetry does not retry unclassified errors', async () => {
  const { fn, calls } = flaky(9, 'something odd happened');
  await assert.rejects(() => withRetry(fn, { attempts: 5, delayMs: 1 }), /odd/);
  assert.equal(calls(), 1);
});

test('withRetry stops retrying once the time budget is spent', async () => {
  const { fn, calls } = flaky(9, 'transient {"code": 502}');
  await assert.rejects(() => withRetry(fn, { attempts: 5, delayMs: 50, budgetMs: 0 }), /502/);
  assert.equal(calls(), 1, 'zero budget means no waiting, so no second call');
});
