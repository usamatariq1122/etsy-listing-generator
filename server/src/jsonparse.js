/** Extracts the first parseable JSON object from model output (handles fences / prose). */
export function extractJson(raw) {
  const text = String(raw || '').trim();

  const attempt = (candidate) => {
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  };

  const direct = attempt(text);
  if (direct) return direct;

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    const parsed = attempt(fenced[1].trim());
    if (parsed) return parsed;
  }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    const parsed = attempt(text.slice(start, end + 1));
    if (parsed) return parsed;
  }

  const err = new Error('The text model did not return valid JSON. Try again.');
  err.status = 502;
  err.detail = text.slice(0, 400);
  throw err;
}
