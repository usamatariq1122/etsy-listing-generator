import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// scopedSettings falls back from an account's own row to the shared one. db is
// an in-memory map and requestContext is the real thing, so runAs drives it.
const rows = new Map();
mock.module('../src/db.js', {
  namedExports: {
    getSetting: async (key) => rows.get(key) ?? null,
    setSetting: async (key, value) => { rows.set(key, value); },
    deleteSetting: async (key) => { rows.delete(key); },
  },
});

const { readScoped, readOwn, writeScoped, clearScoped } = await import('../src/scopedSettings.js');
const { runAs } = await import('../src/requestContext.js');

test('readScoped prefers the account row, then the shared one', async () => {
  rows.clear();
  await runAs('u1', async () => {
    assert.deepEqual(await readScoped('brand_name'), { value: null, scope: null });
    rows.set('brand_name', 'Shared Co');
    assert.deepEqual(await readScoped('brand_name'), { value: 'Shared Co', scope: 'shared' });
    rows.set('user:u1:brand_name', 'My Store');
    assert.deepEqual(await readScoped('brand_name'), { value: 'My Store', scope: 'user' });
  });
});

test('an unowned read only ever sees the shared value', async () => {
  rows.clear();
  rows.set('brand_name', 'Shared Co');
  rows.set('user:u1:brand_name', 'My Store');
  assert.deepEqual(await readScoped('brand_name'), { value: 'Shared Co', scope: 'shared' });
});

test('writes land on the current account, or the shared row when there is none', async () => {
  rows.clear();
  await runAs('u1', () => writeScoped('brand_name', 'Mine'));
  assert.equal(rows.get('user:u1:brand_name'), 'Mine');
  assert.equal(rows.has('brand_name'), false);

  await writeScoped('brand_name', 'Global');
  assert.equal(rows.get('brand_name'), 'Global');
});

test('readOwn and clearScoped only touch the account row', async () => {
  rows.clear();
  await runAs('u1', async () => {
    assert.equal(await readOwn('brand_name'), null);
    rows.set('brand_name', 'Shared Co');
    rows.set('user:u1:brand_name', 'Mine');
    assert.equal(await readOwn('brand_name'), 'Mine', 'readOwn ignores the shared row');
    await clearScoped('brand_name');
    assert.equal(rows.has('user:u1:brand_name'), false);
    assert.equal(rows.get('brand_name'), 'Shared Co', 'clearing an account never clears the shared value');
  });
});
