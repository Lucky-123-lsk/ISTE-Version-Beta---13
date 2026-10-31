const timeoutMilliseconds = Number(process.env.JOB_PROVIDER_TIMEOUT_MS) || 25000;

export async function fetchJSON(url, options = {}, attempts = 3) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(timeoutMilliseconds)
      });
      if (response.ok) return await response.json();
      const retryAfterHeader = response.headers.get('retry-after');
      const retryAfter = parseRetryAfter(retryAfterHeader);
      const retryable = response.status === 429 || response.status >= 500;
      const provider = new URL(url).hostname === 'api.theirstack.com' ? 'TheirStack' : 'Provider';
      const paymentHint = response.status === 402 && provider === 'TheirStack'
        ? ' TheirStack may require credits for the full requested page limit even when fewer results match; reduce THEIRSTACK_PAGE_SIZE or check the account balance.'
        : '';
      if (response.status === 429 && provider === 'TheirStack') {
        console.warn(`TheirStack rate limit reached (remaining: ${response.headers.get('ratelimit-remaining') || 'unknown'}; reset: ${response.headers.get('ratelimit-reset') || 'unknown'}).`);
      }
      const error = new Error(`${provider} request failed with HTTP ${response.status}.${paymentHint}`);
      error.retryable = retryable;
      error.retryAfter = retryAfter;
      if (!retryable || attempt === attempts - 1) throw error;
      lastError = error;
      await delay(retryAfterHeader ? Math.min(retryAfter, 30000) : 500 * (2 ** attempt));
    } catch (error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        lastError = new Error('Provider request timed out.');
      } else if (error.retryable === false) {
        throw error;
      } else if (!error.retryable && !/fetch failed|network|timed out/i.test(error.message)) {
        throw error;
      } else {
        lastError = error;
      }
      if (attempt === attempts - 1) throw lastError;
      await delay(500 * (2 ** attempt));
    }
  }
  throw lastError || new Error('Provider request failed.');
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function parseRetryAfter(value) {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : Math.max(0, timestamp - Date.now());
}
