import { test } from 'node:test';
import assert from 'node:assert/strict';

const { runAs, currentUserId } = await import('../src/requestContext.js');

test('currentUserId is null outside any owner', () => {
  assert.equal(currentUserId(), null);
});

test('runAs exposes the owner to everything awaited inside it', async () => {
  const seen = await runAs('user-1', async () => {
    assert.equal(currentUserId(), 'user-1');
    await Promise.resolve();
    return currentUserId();
  });
  assert.equal(seen, 'user-1');
  assert.equal(currentUserId(), null, 'the owner does not leak back out');
});

test('nested owners shadow and then restore', async () => {
  await runAs('outer', async () => {
    assert.equal(currentUserId(), 'outer');
    await runAs('inner', async () => {
      assert.equal(currentUserId(), 'inner');
    });
    assert.equal(currentUserId(), 'outer');
  });
});

test('a null owner runs as unowned, not throwing', async () => {
  await runAs(null, async () => {
    assert.equal(currentUserId(), null);
  });
});
