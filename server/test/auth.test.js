import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEmail, validateRegistrationInput } from '../src/services/auth.js';

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
