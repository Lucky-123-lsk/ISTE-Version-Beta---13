import test from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter, securityHeaders } from '../src/middleware/apiSecurity.js';

test('security headers are applied to API responses', () => {
  const headers = {};
  securityHeaders({}, { setHeader: (name, value) => { headers[name] = value; } }, () => {});

  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(headers['X-Frame-Options'], 'DENY');
  assert.equal(headers['Referrer-Policy'], 'no-referrer');
});

test('rate limiter rejects requests after the configured window quota', () => {
  let currentTime = 1000;
  const limiter = createRateLimiter({ windowMs: 60000, max: 2, now: () => currentTime });
  let nextCalls = 0;
  const response = {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
  const request = { ip: 'candidate-test' };

  limiter(request, response, () => { nextCalls += 1; });
  limiter(request, response, () => { nextCalls += 1; });
  limiter(request, response, () => { nextCalls += 1; });

  assert.equal(nextCalls, 2);
  assert.equal(response.statusCode, 429);
  assert.equal(response.headers['Retry-After'], '60');
  currentTime += 60001;
  limiter(request, response, () => { nextCalls += 1; });
  assert.equal(nextCalls, 3);
});
