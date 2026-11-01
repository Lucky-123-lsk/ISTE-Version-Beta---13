import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import {
  DEMO_SESSION_TTL_SECONDS,
  issueAccessToken,
  issueDemoAccessToken,
  normalizeEmail,
  validateRegistrationInput,
  WEB_SESSION_TTL_SECONDS
} from '../src/services/auth.js';

test('issues bounded HS256 web and demo sessions with distinct token types', () => {
  const secret = 'test-session-signing-secret';
  const webToken = issueAccessToken({ _id: '507f1f77bcf86cd799439011', email: 'user@example.com' }, secret);
  const demoToken = issueDemoAccessToken('demo@example.com', secret);
  const web = jwt.verify(webToken, secret, { algorithms: ['HS256'] });
  const demo = jwt.verify(demoToken, secret, { algorithms: ['HS256'] });

  assert.equal(web.tokenType, 'web');
  assert.equal(web.id, '507f1f77bcf86cd799439011');
  assert.equal(web.exp - web.iat, WEB_SESSION_TTL_SECONDS);
  assert.equal(demo.tokenType, 'demo');
  assert.equal(demo.id, 'demo-user');
  assert.equal(demo.exp - demo.iat, DEMO_SESSION_TTL_SECONDS);
});

test('normalizes registration email and validates consent', () => {
  const result = validateRegistrationInput({
    name: 'Candidate Example',
    email: '  Candidate@Example.com ',
    password: 'a-secure-password',
    confirmPassword: 'a-secure-password',
    termsAccepted: true,
    privacyAccepted: true
  });
  assert.equal(result.email, 'candidate@example.com');
  assert.equal(normalizeEmail(' USER@Example.COM '), 'user@example.com');
});

test('rejects weak or unconsented registration input', () => {
  assert.throws(
    () => validateRegistrationInput({
      name: 'A',
      email: 'not-an-email',
      password: 'short',
      confirmPassword: 'short',
      termsAccepted: false,
      privacyAccepted: false
    }),
    /Full name/
  );
});
