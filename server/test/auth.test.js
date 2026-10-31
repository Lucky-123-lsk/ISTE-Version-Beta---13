import assert from 'node:assert/strict';
import test from 'node:test';
import { hashPassword, normalizeEmail, validateRegistrationInput, verifyPassword } from '../src/services/auth.js';

test('registration input is normalized and requires both consents', () => {
  const input = validateRegistrationInput({
    name: ' Candidate ',
    email: 'CANDIDATE@Example.com',
    password: 'a secure password',
    confirmPassword: 'a secure password',
    termsAccepted: true,
    privacyAccepted: true
  });
  assert.deepEqual(input, {
    name: 'Candidate',
    email: 'candidate@example.com',
    password: 'a secure password'
  });
  assert.throws(() => validateRegistrationInput({ ...input, confirmPassword: 'different', termsAccepted: true, privacyAccepted: true }));
  assert.throws(() => validateRegistrationInput({ ...input, confirmPassword: input.password, termsAccepted: false, privacyAccepted: true }));
});

test('password hashes can be verified without retaining plaintext', async () => {
  const password = 'a secure password';
  const hash = await hashPassword(password);
  assert.notEqual(hash, password);
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword('wrong password', hash), false);
});

test('email normalization is deterministic', () => {
  assert.equal(normalizeEmail('  Person@Example.COM '), 'person@example.com');
  assert.equal(normalizeEmail(null), '');
});
