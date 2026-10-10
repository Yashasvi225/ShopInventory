// Test process only. No production module imports this file.
process.env.GEMINI_API_KEY = '';
const gemini = require('../../services/geminiService');
gemini.generateExpiryRecommendation = async () => {
  const error = new Error('Mock Gemini provider is unavailable'); error.status = 429; throw error;
};
if (process.env.SIM_READ_ONLY_VERIFICATION === '1') {
  // Final checks against an existing database must not run workers for real owners.
  const expiry = require('../../services/expiryAlertService');
  expiry.startExpiryScanner = () => () => {};
  expiry.scheduleRecommendations = () => {};
}
require('../../server');
