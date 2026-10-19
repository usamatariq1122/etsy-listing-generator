// Security headers, sent on API responses in code because netlify.toml's
// [[headers]] block only reaches static CDN files, not function responses.
//
// The CSP matches what the built client actually does: React is one module
// script, styles are one stylesheet file, previews come from same-origin /api,
// and nothing here uses an inline script, an inline style or a third-party
// origin. A future feature that needs one has to widen this list on purpose.
export const SECURITY_HEADERS = {
  'content-security-policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
  // Two years, and every subdomain. Sent over https only, which the host does.
  'strict-transport-security': 'max-age=63072000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};
