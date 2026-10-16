export const STATUS_LABELS = {
  created: 'Needs listing text',
  queued: 'Waiting for the text model',
  generating: 'Writing the listing text',
  text: 'Text ready',
  packaged: 'ZIP ready',
  failed: 'Last attempt failed',
};

export const statusLabel = (status) => STATUS_LABELS[status] || status;

const PROVIDER_LABELS = { gemini: 'Gemini', anthropic: 'Claude', groq: 'Groq' };

export const providerLabel = (provider) => PROVIDER_LABELS[provider] || provider;

// A Gemini answer is identified by its model name alone; a fallback provider is
// named first so the seller can see the answer did not come from Gemini.
const FALLBACK_LABELS = { groq: 'Groq', anthropic: 'Claude' };

/** Who wrote the guide, e.g. "gemini-3.5-flash" or "Groq (llama-3.3-70b-versatile)". */
export const modelLabel = (quality) => {
  const provider = FALLBACK_LABELS[quality?.provider];
  if (!quality?.model) return '';
  return provider ? `${provider} (${quality.model})` : quality.model;
};
