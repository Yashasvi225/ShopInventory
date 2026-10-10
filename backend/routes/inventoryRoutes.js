const { resolveStore } = require('../middleware/storeMiddleware');
const router=require('express').Router();const c=require('../controllers/inventoryController');const {protect}=require('../middleware/authMiddleware');router.use(protect, resolveStore);router.post('/stock-in',c.stockIn);router.post('/stock-out',c.stockOut);router.get('/transactions',c.getTransactions);module.exports=router;
