// Test process only. No production module imports this file.
process.env.GEMINI_API_KEY = '';
// The runner must distinguish this exact isolated API from a normal watcher.
if (process.env.SIM_VERIFICATION_TOKEN) {
  const express = require('express');
  const originalGet = express.application.get;
  express.application.get = function (route, ...handlers) {
    if (route === '/api/health' && handlers.length) {
      return originalGet.call(this, route, (req, res) => res.json({ status: 'ok',
        service: 'Shop Inventory Manager API', verificationOwner: process.env.SIM_VERIFICATION_TOKEN }));
    }
    return originalGet.call(this, route, ...handlers);
  };
}
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
