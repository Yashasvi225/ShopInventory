const { scope } = require('../utils/storeScope');
const Product = require('../models/Product');
const Sale = require('../models/Sale');
const StockTransaction = require('../models/StockTransaction');
const { isValidObjectId, positive, nonNegative, validDate, resultLimit, badRequest } = require('../utils/validators');
const { ownedStockProduct, stockTransaction } = require('../utils/stockWrite');

async function createSale(req,res,next){
  try{
    const productId=req.body.product, quantity=positive(req.body.quantity,'quantity');
    if(!isValidObjectId(productId))return res.status(400).json({message:'Invalid product ID'});
    const date=req.body.date===undefined?new Date():validDate(req.body.date,'date');
    const suppliedPrice=req.body.sellingPrice===undefined?undefined:nonNegative(req.body.sellingPrice,'sellingPrice');
    const result=await stockTransaction(req,async session=>{
    const original=await ownedStockProduct(productId,req,session);
    const now=new Date();
    if(original.shopType !== 'CLOTHING' && original.expiryDate && original.expiryDate < now)throw badRequest('Expired products cannot be sold');
    const sellingPrice=suppliedPrice??original.sellingPrice;
    const totalAmount=nonNegative(Number((sellingPrice*quantity).toFixed(2)),'totalAmount');
    const product=await Product.findOneAndUpdate({_id:productId,...scope(req),shopType:req.store.shopType,quantity:{$gte:quantity},$or:[{shopType:'CLOTHING'},{expiryDate:null},{expiryDate:{$gte:now}}]},{$inc:{quantity:-quantity}},{new:true,session});
    if(!product)throw badRequest(original.shopType === 'CLOTHING' ? 'Insufficient stock' : 'Insufficient stock or product has expired');
    const [sale]=await Sale.create([{product:product._id,quantity,sellingPrice,totalAmount,date,...scope(req)}],{session});
    await StockTransaction.create([{product:product._id,type:'STOCK_OUT',quantity,reason:`Sale ${sale._id}`,date:sale.date,...scope(req)}],{session});
    return {...sale.toObject(),product:{_id:product._id,name:product.name,sku:product.sku}};
    });
    res.status(201).json(result);
  }catch(e){next(e)}
}
async function getSales(req,res,next){try{const f={...scope(req)};if(req.query.from!==undefined||req.query.to!==undefined){f.date={};if(req.query.from!==undefined)f.date.$gte=validDate(req.query.from,'from');if(req.query.to!==undefined){const d=validDate(req.query.to,'to');d.setUTCHours(23,59,59,999);f.date.$lte=d}if(f.date.$gte&&f.date.$lte&&f.date.$gte>f.date.$lte)throw badRequest('from must not be after to')}res.json(await Sale.find(f).populate({path:'product',select:'name sku',match:{...scope(req)}}).sort({date:-1}).limit(resultLimit(req.query.limit,500)))}catch(e){next(e)}}
module.exports={createSale,getSales};
