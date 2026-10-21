import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownedId, ownerOf, innerIdOf, isSafeId, productPrefix, zipKey, imageKey } from '../src/paths.js';

test('owned ids scope every key under the owner, legacy bare ids stay put', () => {
  const uid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const pid = '11111111-2222-3333-4444-555555555555';
  const owned = ownedId(uid, pid);
  assert.equal(owned, `${uid}:${pid}`);
  assert.equal(ownerOf(owned), uid);
  assert.equal(innerIdOf(owned), pid);
  assert.equal(productPrefix(owned), `users/${uid}/products/${pid}/`);
  assert.equal(zipKey(owned), `users/${uid}/products/${pid}/listing-package.zip`);
  assert.equal(imageKey(owned, '01-cover.jpg'), `users/${uid}/products/${pid}/images/01-cover.jpg`);
  // A pre-account id keeps its old, ownerless location.
  assert.equal(productPrefix('legacy-uuid'), 'products/legacy-uuid/');
  assert.equal(ownerOf('legacy-uuid'), null);
});

test('isSafeId accepts owned and bare ids but refuses traversal or a double owner', () => {
  assert.ok(isSafeId('abc'));
  assert.ok(isSafeId('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee:11111111-2222-3333-4444-555555555555'));
  assert.ok(!isSafeId(''), 'empty');
  assert.ok(!isSafeId(null), 'null');
  assert.ok(!isSafeId('..'), 'traversal');
  assert.ok(!isSafeId('a/b'), 'slash');
  assert.ok(!isSafeId('a:b:c'), 'two owners');
  assert.ok(!isSafeId('a::b'), 'empty owner segment');
  assert.ok(!isSafeId('a_123'), 'underscore is not an id character');
});
