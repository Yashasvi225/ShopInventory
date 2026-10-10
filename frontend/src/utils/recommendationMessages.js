const providerMessages = {
  NOT_CONFIGURED: 'Gemini is not configured on the server. Configure GEMINI_API_KEY in backend/.env and restart the backend.',
  CONFIGURATION_OR_ACCESS: 'Gemini rejected the server credentials or access permissions. Check the backend API key and project access.',
  MODEL_UNAVAILABLE: 'The configured Gemini model is unavailable. Check GEMINI_MODEL against the models available to the backend account.',
  INVALID_REQUEST: 'Gemini rejected the analysis request. Check the backend configuration and server diagnostics before retrying.',
  RATE_LIMITED: 'Gemini quota or rate limits were reached. Wait before retrying and check the project quota in Google AI Studio.',
  TIMEOUT: 'Gemini timed out before completing the analysis. Try again later.',
  NETWORK_ERROR: 'The server could not connect to Gemini. Check the backend network connection and try again later.',
  PROVIDER_UNAVAILABLE: 'Gemini is temporarily unavailable. Try again later.',
  INVALID_RESPONSE: 'Gemini returned an invalid recommendation response. It was rejected by the application validation.',
  PROVIDER_ERROR: 'Gemini could not complete this analysis. Try again later or check the server diagnostics.',
};

export function providerMessage(result) {
  const error = result?.providerError;
  if (!error) return 'Gemini could not complete this analysis.';
  const message = providerMessages[error.code] || providerMessages.PROVIDER_ERROR;
  return message + (error.httpStatus ? ` Provider HTTP status: ${error.httpStatus}.` : '')
    + (error.retryAt ? ` Retry after ${new Date(error.retryAt).toLocaleString('en-IN')}.` : '');
}

export function emptyRecommendationMessage(result) {
  if (!result) return 'Click Generate AI Recommendations to analyze your current inventory.';
  switch (result.analysis?.emptyReason || (result.source === 'NO_DATA' ? 'NO_PRODUCTS' : null)) {
    case 'NO_PRODUCTS': return 'No products are available in the active store. Add products and record completed sales in this store to build demand history.';
    case 'ALL_EXPIRED': return 'All products in this analysis are expired and excluded by the existing reorder rules. Review product expiry dates and stock; replacement guidance remains in the expiry warnings below.';
    case 'NO_RECENT_SALES': return 'No recent sales were recorded, and stock does not meet the existing reorder rules. Record completed sales on the Sales page to build demand history; no demand estimate has been invented.';
    case 'NO_REORDER_NEEDED': return 'No products meet the existing reorder rules: stock is above minimum levels and recorded demand does not indicate 14 days or less of cover. Expired products are excluded.';
    case 'NO_MODEL_SUGGESTIONS': return 'Gemini returned no reorder suggestions for this analysis. Review stock and recorded demand before purchasing; no recommendations have been invented.';
    default: return 'No reorder suggestions were returned. Review stock and recorded sales before purchasing.';
  }
}

export function summarizeRecommendations(rows) {
  return { returned: rows.length, actionable: rows.filter(row => row.suggestedReorderQuantity > 0).length,
    units: rows.reduce((sum, row) => sum + row.suggestedReorderQuantity, 0) };
}
