const { normalizeEmail, badRequest } = require('./validators');

const EMAIL_MESSAGE = 'Please enter a valid email address.';
const PASSWORD_MESSAGE = 'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character.';
const PASSWORD_LENGTH_MESSAGE = 'Password is too long (maximum 72 UTF-8 bytes)';
// Common ASCII dot-atom addresses; every domain label must have valid DNS syntax.
// A plausible alphabetic TLD is a syntax check, not proof of delivery or ownership.
const emailPattern = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

function validatedEmail(value) {
  const email = typeof value === 'string' ? normalizeEmail(value) : '';
  if (email.length > 254 || email.split('@')[0].length > 64 || !emailPattern.test(email)) throw badRequest(EMAIL_MESSAGE);
  return email;
}
function registrationPassword(value) {
  if (typeof value !== 'string') throw badRequest(PASSWORD_MESSAGE);
  // bcrypt considers only the first 72 bytes; retain the existing registration limit.
  if (Buffer.byteLength(value, 'utf8') > 72) throw badRequest(PASSWORD_LENGTH_MESSAGE);
  if (Array.from(value).length < 8 || !/[A-Z]/.test(value) || !/[a-z]/.test(value)
    || !/[0-9]/.test(value) || !/[\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]/.test(value)) throw badRequest(PASSWORD_MESSAGE);
  return value;
}
function loginPassword(value) {
  if (typeof value !== 'string' || !value.length) throw badRequest('Password is required');
  return value;
}
module.exports = { validatedEmail, registrationPassword, loginPassword, EMAIL_MESSAGE, PASSWORD_MESSAGE, PASSWORD_LENGTH_MESSAGE };
