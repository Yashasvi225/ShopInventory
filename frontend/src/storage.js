export const getToken = () => localStorage.getItem('token') || '';
export function getUser() {
  try { return JSON.parse(localStorage.getItem('user') || 'null'); }
  catch { return null; }
}
export function saveSession(data) {
  if (data.token) localStorage.setItem('token', data.token);
  if (data.user) {
    localStorage.setItem('user', JSON.stringify(data.user));
    if (data.user.shopType) localStorage.setItem('shopType', data.user.shopType);
    else { localStorage.removeItem('shopType'); localStorage.removeItem('shopName'); }
  }
}
export function clearSession() {
  ['token', 'user', 'shopType', 'shopName'].forEach(key => localStorage.removeItem(key));
}
