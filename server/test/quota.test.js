import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// quota.js reads the daily cap from config and the count from db. Both are
// replaced so the pure math and the usageFor fallbacks can be checked without a
// database.
const settings = { limit: 20 };
mock.module('../src/config.js', {
  namedExports: { config: { get generation() { return { dailyLimit: settings.limit }; } } },
});
mock.module('../src/db.js', {
  namedExports: {
    generationsToday: async (id) => {
      if (id === 'missing') return null;
      const table = {
        admin: { role: 'admin', today: 0 },
        fresh: { role: 'user', today: 0 },
        partial: { role: 'user', today: 7 },
        full: { role: 'user', today: 20 },
      };
      return table[id] ?? null;
    },
  },
});

const { dailyLimit, summarize, usageFor, canGenerate, limitMessage } = await import('../src/quota.js');

test('dailyLimit mirrors config and never goes negative', () => {
  settings.limit = 20;
  assert.equal(dailyLimit(), 20);
  settings.limit = 0;
  assert.equal(dailyLimit(), 0);
  settings.limit = -5;
  assert.equal(dailyLimit(), 0);
});

test('summarize exempts the admin and a zero cap, others count down', () => {
  settings.limit = 20;
  assert.equal(summarize('admin', 0).exempt, true);
  assert.equal(summarize('admin', 0).remaining, null);
  assert.equal(summarize('user', 3).remaining, 17);
  assert.equal(summarize('user', 20).remaining, 0);
  settings.limit = 0;
  assert.equal(summarize('user', 999).exempt, true, 'a zero cap is unlimited');
});

test('canGenerate follows the summary', () => {
  settings.limit = 20;
  assert.equal(canGenerate(summarize('user', 19)), true);
  assert.equal(canGenerate(summarize('user', 20)), false);
  assert.equal(canGenerate(summarize('admin', 9999)), true);
});

test('usageFor resolves admin, ordinary, legacy and unknown accounts', async () => {
  settings.limit = 20;
  assert.equal((await usageFor('admin')).exempt, true);
  assert.equal((await usageFor('partial')).remaining, 13);
  assert.equal((await usageFor('full')).remaining, 0);
  assert.equal((await usageFor(null)).exempt, true, 'an unowned local run is never capped');
  assert.equal((await usageFor('missing')).exempt, false, 'an unknown id still gets a capped shape');
});

test('limitMessage names the cap and the reset', () => {
  assert.match(limitMessage({ limit: 20 }), /all 20 generations/);
});
