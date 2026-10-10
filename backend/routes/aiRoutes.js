const { resolveStore } = require('../middleware/storeMiddleware');
const router = require('express').Router();
const { protect } = require('../middleware/authMiddleware');
const { reorderSuggestions } = require('../controllers/aiController');
const { getExpiryAlerts, dismissExpiryAlert } = require('../controllers/expiryAlertController');

router.use(protect, resolveStore);
router.get('/reorder-suggestions', reorderSuggestions);
router.get('/expiry-alerts', getExpiryAlerts);
router.patch('/expiry-alerts/:id/dismiss', dismissExpiryAlert);

module.exports = router;
