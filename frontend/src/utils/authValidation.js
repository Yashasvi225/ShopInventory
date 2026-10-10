export const EMAIL_MESSAGE = 'Please enter a valid email address.';
export const PASSWORD_MESSAGE = 'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character.';
export const PASSWORD_LENGTH_MESSAGE = 'Password is too long (maximum 72 UTF-8 bytes)';
const emailPattern = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export const normalizeEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
export function emailError(value) {
  const email = normalizeEmail(value);
  return email.length > 254 || email.split('@')[0].length > 64 || !emailPattern.test(email) ? EMAIL_MESSAGE : '';
}
export function registrationPasswordError(value) {
  if (typeof value !== 'string') return PASSWORD_MESSAGE;
  if (new TextEncoder().encode(value).length > 72) return PASSWORD_LENGTH_MESSAGE;
  return Array.from(value).length < 8 || !/[A-Z]/.test(value) || !/[a-z]/.test(value)
    || !/[0-9]/.test(value) || !/[\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]/.test(value) ? PASSWORD_MESSAGE : '';
}
export const loginPasswordError = value => typeof value === 'string' && value.length ? '' : 'Password is required';
