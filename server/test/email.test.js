import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// email.js reads config.mail.apiKey and config.siteUrl. Both are mocked so the
// tests never need a Resend key, and sendMail is checked for the no-network
// guarantee that makes a mail-less install harmless.

mock.module('../src/config.js', {
  namedExports: { config: { mail: { apiKey: '', from: 'Listora <onboarding@resend.dev>', replyTo: '' }, siteUrl: 'https://example.netlify.app' } },
});

const { emailProblem, mailReady, sendMail, verificationLink, actionLink } = await import('../src/email.js');

test('emailProblem accepts ordinary addresses and refuses broken ones', () => {
  assert.equal(emailProblem('seller@example.com'), null);
  assert.equal(emailProblem('first.last+tag@sub.domain.co'), null);
  assert.ok(emailProblem(''), 'empty');
  assert.ok(emailProblem('no-at-sign'), 'no @');
  assert.ok(emailProblem('a@b'), 'no dotted domain');
  assert.ok(emailProblem('two@@at.com'), 'double @');
  assert.ok(emailProblem('has space@example.com'), 'space');
});

test('mail is not ready and nothing sends without an API key', async () => {
  assert.equal(mailReady(), false);
  assert.equal(await sendMail({ to: 'a@b.com', subject: 'x', html: 'y' }), false);
});

test('verificationLink builds a URL from the site origin, or nothing without one', () => {
  assert.equal(verificationLink('tok en'), 'https://example.netlify.app/verify?token=tok%20en');
  assert.equal(verificationLink(''), null);
});

test('actionLink points verify at /verify and reset at /reset', () => {
  assert.equal(actionLink('verify', 'abc'), 'https://example.netlify.app/verify?token=abc');
  assert.equal(actionLink('reset', 'abc'), 'https://example.netlify.app/reset?token=abc');
  // An unknown kind falls back to the verify screen, and a missing token gives nothing.
  assert.equal(actionLink('other', 'abc'), 'https://example.netlify.app/verify?token=abc');
  assert.equal(actionLink('reset', ''), null);
});
