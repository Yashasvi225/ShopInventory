const { resolveStore } = require('../middleware/storeMiddleware');
const router=require('express').Router();const c=require('../controllers/saleController');const {protect}=require('../middleware/authMiddleware');router.use(protect, resolveStore);router.route('/').post(c.createSale).get(c.getSales);module.exports=router;
