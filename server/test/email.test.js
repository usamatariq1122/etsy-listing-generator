import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// email.js reads config.mail (its Resend key and the SMTP block) and
// config.siteUrl. Both are mocked so the tests never need a key, a mailbox or the
// network, and sendMail is checked for the no-network guarantee that makes a
// mail-less install harmless. The object is mutable so one test can flip the
// transport without re-importing the module.

const testConfig = {
  mail: {
    apiKey: '',
    from: 'Listora <onboarding@resend.dev>',
    replyTo: '',
    smtp: { host: '', port: 465, secure: true, user: '', pass: '' },
  },
  siteUrl: 'https://example.netlify.app',
};

mock.module('../src/config.js', {
  namedExports: { config: testConfig },
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

test('a complete SMTP block counts as a transport, an incomplete one does not', () => {
  const smtp = { host: 'smtp.example.com', port: 465, secure: true, user: 'bot@example.com', pass: 'an app password' };
  testConfig.mail.smtp = smtp;
  assert.equal(mailReady(), true, 'SMTP alone is enough');
  testConfig.mail.smtp = { ...smtp, pass: '' };
  assert.equal(mailReady(), false, 'no password means no login, so no transport');
  testConfig.mail.smtp = { ...smtp, host: '' };
  assert.equal(mailReady(), false);
  testConfig.mail.apiKey = 'resend-key';
  assert.equal(mailReady(), true, 'the Resend key alone works again');
  testConfig.mail.apiKey = '';
  testConfig.mail.smtp = { host: '', port: 465, secure: true, user: '', pass: '' };
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
