import { clearSession, getToken } from './storage';
import { validApiData } from './apiContract';
import { getActiveStoreId, trackWrite } from './storeRequests';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').replace(/\/$/, '');

export async function api(path, options = {}) {
  const scoped = /^\/(products|suppliers|inventory|sales|reports|ai)(\/|\?|$)/.test(path);
  const finish = scoped && !['GET', 'HEAD'].includes(options.method || 'GET') ? trackWrite() : () => {};
  try { return await request(path, options, scoped); } finally { finish(); }
}
async function request(path, options, scoped) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (scoped && getActiveStoreId() && !headers['X-Store-Id']) headers['X-Store-Id'] = getActiveStoreId();
  const token = getToken();
  const authenticating = ['/auth/login', '/auth/register'].includes(path);
  if (token && !authenticating) headers.Authorization = `Bearer ${token}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), path === '/ai/reorder-suggestions' ? 105_000 : 30_000);
  let response;
  let data;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers, signal: controller.signal });
    data = await response.json().catch(() => null);
    if (controller.signal.aborted) throw new Error('timeout');
  } catch {
    throw new Error(controller.signal.aborted ? 'Request timed out. Check your records before trying again.' : 'Cannot connect to the server. Please try again.');
  } finally { clearTimeout(timeout); }
  if (response.status === 401 && token && token === getToken() && !authenticating) {
    clearSession();
    window.dispatchEvent(new Event('inventory-session-expired'));
  }
  if (!response.ok) {
    let message = typeof data?.message === 'string' ? data.message.slice(0, 300) : 'Something went wrong. Please try again.';
    if (response.status >= 500) message = 'The server could not complete the request. Please try again.';
    if (response.status === 403) message = 'You do not have permission to perform this action.';
    if (response.status === 429) message = 'Too many requests. Please wait before retrying.';
    if (response.status === 401) message = authenticating ? 'Invalid email or password' : 'Your session has expired. Please login again.';
    if (response.status === 409 && message.includes('Duplicate')) message = 'That value already exists. Please use another one.';
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  if (!validApiData(path, data, options.method || 'GET')) throw new Error('The server returned an invalid response. Please try again.');
  return data;
}

export const json = (method, data) => ({ method, body: JSON.stringify(data) });
