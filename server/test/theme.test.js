import { test } from 'node:test';
import assert from 'node:assert/strict';
import { themeIssues, DEFAULT_THEME } from '../src/theme.js';

test('themeIssues accepts a full valid palette', () => {
  assert.deepEqual(themeIssues(DEFAULT_THEME), []);
  assert.deepEqual(themeIssues({ ink: '#abcdef', accent: '#123', muted: '#fff' }), []);
});

test('themeIssues refuses non-hex colours and an empty palette', () => {
  assert.ok(themeIssues({ ink: 'red' }).length);
  assert.ok(themeIssues({}).length);
  assert.ok(themeIssues('not json').length);
  assert.ok(themeIssues(null).length);
});
