const mongoose = require('mongoose');
const { SHOP_TYPES } = require('../domain/storeTypes');

const isValidObjectId = (value) => value instanceof mongoose.Types.ObjectId || (typeof value === 'string' && /^[a-f\d]{24}$/i.test(value));
const normalizeEmail = (email = '') => String(email).trim().toLowerCase();
const validShopType = (value) => SHOP_TYPES.includes(value);

function requiredString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    const err = new Error(`${field} is required`);
    err.statusCode = 400;
    throw err;
  }
  return String(value).trim();
}

function nonNegative(value, field) {
  const n = Number(value);
  if (!['number', 'string'].includes(typeof value) || (typeof value === 'string' && !value.trim())
    || !Number.isFinite(n) || n < 0 || n > Number.MAX_SAFE_INTEGER) {
    const err = new Error(`${field} must be a non-negative number`);
    err.statusCode = 400;
    throw err;
  }
  return n;
}

function positive(value, field) {
  const n = nonNegative(value, field);
  if (n < 1) {
    const err = new Error(`${field} must be at least 1`);
    err.statusCode = 400;
    throw err;
  }
  return n;
}

function badRequest(message) { const error = new Error(message); error.statusCode = 400; return error; }
function optionalString(value, field) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw badRequest(`${field} must be text`);
  return value.trim();
}
function validDate(value, field, optional = false) {
  if (optional && (value == null || value === '')) return null;
  if (typeof value !== 'string' || !value.trim()) throw badRequest(`${field} must be a valid date`);
  const date = new Date(value);
  const calendar = value.match(/^(\d{4}-\d{2}-\d{2})(?:T|$)/)?.[1];
  if (!Number.isFinite(date.getTime()) || !calendar || new Date(calendar).toISOString().slice(0, 10) !== calendar) {
    throw badRequest(`${field} must be a valid date`);
  }
  return date;
}
function resultLimit(value, fallback) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 500) {
    throw badRequest('limit must be between 1 and 500');
  }
  return Number(value);
}
function literalSearch(value) {
  if (value === undefined) return '';
  return optionalString(value, 'search').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
module.exports = { isValidObjectId, normalizeEmail, validShopType, requiredString, nonNegative, positive,
  optionalString, validDate, resultLimit, literalSearch, badRequest };
