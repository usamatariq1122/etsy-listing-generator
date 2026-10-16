// Only a temporary provider hiccup is worth calling again. Quota and rate-limit
// rejections do not clear within a single request, so they surface immediately
// instead of hiding behind retry waits.
const TRANSIENT = /"code":\s*(500|502|503)|high demand|try again later/i;
const DEAD_END = /"code":\s*429|RESOURCE_EXHAUSTED|quota|rate limit/i;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retries a provider call twice on transient failures. The whole call chain is
 * bounded by `budgetMs`, so a hanging provider cannot stall the request forever.
 */
export async function withRetry(fn, { attempts = 2, delayMs = 3000, budgetMs = 20000 } = {}) {
  const started = Date.now();
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = error?.message || '';
      if (DEAD_END.test(message) || !TRANSIENT.test(message) || attempt === attempts) throw error;
      const wait = Math.min(delayMs * attempt, budgetMs - (Date.now() - started));
      if (wait <= 0) throw error;
      await delay(wait);
    }
  }

  throw lastError;
}
