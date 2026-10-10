const router = require('express').Router();
const { protect } = require('../middleware/authMiddleware');
const { listStores } = require('../controllers/storeController');
router.get('/', protect, listStores);
module.exports = router;
