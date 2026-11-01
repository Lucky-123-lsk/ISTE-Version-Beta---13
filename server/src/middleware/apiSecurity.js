export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  return next();
}

export function createRateLimiter({ windowMs, max, now = Date.now }) {
  const requests = new Map();
  let lastCleanup = 0;
  return (req, res, next) => {
    const currentTime = now();
    if (currentTime - lastCleanup >= windowMs) {
      for (const [key, record] of requests) {
        if (record.expiresAt <= currentTime) requests.delete(key);
      }
      lastCleanup = currentTime;
    }

    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const existing = requests.get(key);
    const record = existing && existing.expiresAt > currentTime
      ? existing
      : { count: 0, expiresAt: currentTime + windowMs };
    if (record.count >= max) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((record.expiresAt - currentTime) / 1000))));
      return res.status(429).json({ error: 'Too many requests. Please wait before trying again.' });
    }
    record.count += 1;
    requests.set(key, record);
    return next();
  };
}
