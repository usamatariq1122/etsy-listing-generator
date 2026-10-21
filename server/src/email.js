import { config } from './config.js';

// Outgoing email through Resend, with no SDK. Nothing is sent unless
// RESEND_API_KEY is set, so an install without mail stays exactly as it was:
// accounts still sign up and sign in, they simply receive no verification link.
// The key is server-side only and never reaches a bundle.

export function emailProblem(email) {
  const value = String(email ?? '').trim();
  if (!value) return 'Enter an email address.';
  if (value.length > 320) return 'That email address is too long.';
  // A deliberately simple shape: one @, no spaces, a dotted domain.
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value)) return 'Enter a valid email address.';
  return null;
}

export const mailReady = () => Boolean(config.mail.apiKey);

const RESEND_URL = 'https://api.resend.com/emails';

/** Posts one message to Resend. Never throws: a failed email must not fail the
 *  request that only wanted to notify someone. Returns true on delivery. */
export async function sendMail({ to, subject, html, text }) {
  if (!mailReady()) return false;
  try {
    const response = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.mail.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: config.mail.from,
        to: [String(to)],
        subject,
        html,
        ...(text ? { text } : {}),
        ...(config.mail.replyTo ? { reply_to: config.mail.replyTo } : {}),
      }),
    });
    if (!response.ok) console.error('[mail] Resend refused the message', response.status);
    return response.ok;
  } catch (error) {
    console.error('[mail] send failed', error.message);
    return false;
  }
}

/** The link a token points at, or null when this build has no public URL to
 *  point at — the token is then still stored, just not emailed. A verification
 *  lands on /verify, a password reset on /reset, so each screen knows what it is
 *  confirming. */
export function actionLink(kind, token) {
  if (!config.siteUrl || !token) return null;
  const path = kind === 'reset' ? 'reset' : 'verify';
  return `${config.siteUrl}/${path}?token=${encodeURIComponent(token)}`;
}

export function verificationLink(token) {
  return actionLink('verify', token);
}

export async function sendVerification(email, token, kind = 'verify') {
  const link = actionLink(kind, token);
  if (!link) return false;
  const resetting = kind === 'reset';
  return sendMail({
    to: email,
    subject: resetting ? 'Reset your Listora password' : 'Confirm your Listora account',
    html: `<p>${resetting
      ? 'Someone asked to reset the password for this Listora account.'
      : 'Welcome. Confirm this email address to finish setting up your Listora account:'}</p>
           <p><a href="${link}">${link}</a></p>
           <p>${resetting
      ? 'If you did not request this you can ignore this message and your password will not change.'
      : 'If you did not create this account you can ignore this message.'}</p>`,
    text: `${resetting ? 'Reset your Listora password' : 'Confirm your Listora account'}: ${link}`,
  });
}
