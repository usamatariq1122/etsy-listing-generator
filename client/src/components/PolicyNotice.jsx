import { useState } from 'react';

// A short, dismissible notice about Etsy's AI-listing rules, shown once per browser
// until the seller opens it again from Settings. It changes nothing about a listing —
// it only states, in the seller's own words, what Etsy now expects.
const DISMISS_KEY = 'listora.policyNotice.dismissed';

export default function PolicyNotice() {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) !== '1';
    } catch {
      return true;
    }
  });

  if (!open) return null;

  function dismiss() {
    setOpen(false);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* storage unavailable — hide for this session only */
    }
  }

  return (
    <div className="banner warn">
      <div className="row-between">
        <strong>Etsy&apos;s AI-listing rules — what to check before you publish</strong>
        <button className="linklike" onClick={dismiss}>
          Dismiss
        </button>
      </div>
      <ul>
        <li>Every listing needs at least one unedited, real photo of the actual item against a real background — a gallery of only generated images is refused.</li>
        <li>Etsy bans purely AI-written functional guides such as patterns and recipes. Use the generated text as a starting point and confirm it is your own, reviewed work.</li>
        <li>Answer Etsy&apos;s "who made it" and "when made" honestly, so buyers understand the role you play in the product.</li>
        <li>Listora never publishes on its own. You review and press Publish yourself.</li>
      </ul>
    </div>
  );
}
