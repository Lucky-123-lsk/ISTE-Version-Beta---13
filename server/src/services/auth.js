import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MINIMUM = 10;

export function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function validateRegistrationInput(body = {}) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = normalizeEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';
  const confirmPassword = typeof body.confirmPassword === 'string' ? body.confirmPassword : '';
  if (name.length < 2 || name.length > 120) throw new Error('Full name must be between 2 and 120 characters.');
  if (!EMAIL_PATTERN.test(email) || email.length > 254) throw new Error('Enter a valid email address.');
  if (password.length < PASSWORD_MINIMUM || password.length > 200) {
    throw new Error(`Password must be between ${PASSWORD_MINIMUM} and 200 characters.`);
  }
  if (password !== confirmPassword) throw new Error('Password and confirmation do not match.');
  if (body.termsAccepted !== true || body.privacyAccepted !== true) {
    throw new Error('Terms and privacy consent are required.');
  }
  return { name, email, password };
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

export function issueAccessToken(user, secret) {
  return jwt.sign({ id: String(user._id), email: user.email, tokenType: 'web' }, secret, { expiresIn: '2h' });
}

export function generatePairingCode() {
  return randomBytes(24).toString('base64url');
}

export function publicUser(user) {
  return { id: String(user._id), name: user.name, email: user.email };
}
