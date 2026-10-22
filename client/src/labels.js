export const STATUS_LABELS = {
  created: 'Needs listing text',
  queued: 'Waiting for the text model',
  generating: 'Writing the listing text',
  text: 'Text ready',
  packaged: 'ZIP ready',
  failed: 'Last attempt failed',
};

export const statusLabel = (status) => STATUS_LABELS[status] || status;

// How far a package got on Etsy, read only from what a draft attempt actually
// recorded. A full draft is a draft, not "live" — publishing is the seller's own
// click and is never inferred here.
export const ETSY_STAGE_LABELS = {
  in_progress: 'Sending to Etsy',
  partial: 'Partly on Etsy',
  complete: 'Draft on Etsy',
  draft: 'Draft on Etsy',
  failed: 'Etsy send failed',
};

export const etsyStageLabel = (etsy) => (etsy ? ETSY_STAGE_LABELS[etsy.status] || 'Draft on Etsy' : null);

const PROVIDER_LABELS = { gemini: 'Gemini', anthropic: 'Claude', groq: 'Groq', openrouter: 'OpenRouter' };

export const providerLabel = (provider) => PROVIDER_LABELS[provider] || provider;

// A Gemini answer is identified by its model name alone; a fallback provider is
// named first so the seller can see the answer did not come from Gemini.
const FALLBACK_LABELS = { groq: 'Groq', anthropic: 'Claude', openrouter: 'OpenRouter' };

/** Who wrote the guide, e.g. "gemini-3.5-flash" or "Groq (llama-3.3-70b-versatile)". */
export const modelLabel = (quality) => {
  const provider = FALLBACK_LABELS[quality?.provider];
  if (!quality?.model) return '';
  return provider ? `${provider} (${quality.model})` : quality.model;
};
