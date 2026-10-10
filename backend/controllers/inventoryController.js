const { scope } = require('../utils/storeScope');
const Product = require('../models/Product');
const StockTransaction = require('../models/StockTransaction');
const { isValidObjectId, positive, optionalString, validDate, resultLimit, badRequest } = require('../utils/validators');
const { ownedStockProduct, stockTransaction } = require('../utils/stockWrite');

async function changeStock(req,res,next,type){
  try{
    const productId=req.body.product; const quantity=positive(req.body.quantity,'quantity');
    const reason=optionalString(req.body.reason,'reason');
    const date=req.body.date===undefined?new Date():validDate(req.body.date,'date');
    if(!isValidObjectId(productId))return res.status(400).json({message:'Invalid product ID'});
    const result=await stockTransaction(req,async session=>{
      await ownedStockProduct(productId,req,session);
      const query={_id:productId,...scope(req),shopType:req.store.shopType,
        quantity:type==='STOCK_OUT'?{$gte:quantity}:{$lte:Number.MAX_SAFE_INTEGER-quantity}};
      const product=await Product.findOneAndUpdate(query,{$inc:{quantity:type==='STOCK_IN'?quantity:-quantity}},{new:true,session});
      if(!product)throw badRequest(type==='STOCK_OUT'?'Insufficient stock':'Resulting stock exceeds the supported numeric range');
      const [transaction]=await StockTransaction.create([{product:product._id,type,quantity,reason,date,...scope(req)}],{session});
      return {product,transaction};
    });
    res.status(201).json(result);
  }catch(e){next(e)}
}
const stockIn=(req,res,next)=>changeStock(req,res,next,'STOCK_IN');
const stockOut=(req,res,next)=>changeStock(req,res,next,'STOCK_OUT');
async function getTransactions(req,res,next){try{const tx=await StockTransaction.find({...scope(req)}).populate({path:'product',select:'name sku shopType expiryDate fashionType',match:{...scope(req)}}).sort({date:-1}).limit(resultLimit(req.query.limit,200));res.json(tx)}catch(e){next(e)}}
module.exports={stockIn,stockOut,getTransactions};
