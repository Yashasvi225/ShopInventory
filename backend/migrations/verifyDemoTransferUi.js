// Explicit read-only QA tool. Use only with the verification API (workers/provider disabled).
const path=require('node:path');const fs=require('node:fs');const mongoose=require('mongoose');const jwt=require('jsonwebtoken');
require('dotenv').config({path:path.join(__dirname,'../.env'),quiet:true});
const {chromium}=require('../../frontend/node_modules/playwright');const {EMAIL,keyFor,verify}=require('./demoTransfer');
const User=require('../models/User');const Store=require('../models/Store');
let phase='startup';
async function main(){
  if(process.env.SIM_READ_ONLY_VERIFICATION!=='1')throw new Error('Use the read-only verification API first');
  await mongoose.connect(process.env.MONGO_URI,{serverSelectionTimeoutMS:10000});let browser;
  try{
    const user=await User.findOne({email:EMAIL}).select('_id name email shopType').lean();if(!user)throw new Error('Existing target missing');
    const stores=await Store.find({createdBy:user._id}).lean();if(stores.length!==4)throw new Error('Expected four owned stores');
    const db=mongoose.connection.db,audit=await db.collection('inventorymigrations').findOne({_id:keyFor(user._id)});await verify(db,audit);
    const token=jwt.sign({id:user._id},process.env.JWT_SECRET,{expiresIn:'15m'});
    const call=async(url,store)=>{phase='API-'+store.shopType+'-'+url;const response=await fetch('http://localhost:5000/api'+url,{headers:{Authorization:'Bearer '+token,'X-Store-Id':String(store._id)}});if(!response.ok)throw new Error('Live scoped API failed');return response.json();};
    const results=[];
    for(const store of stores){
      phase='API-'+store.shopType;
      const products=await call('/products',store),suppliers=await call('/suppliers',store),sales=await call('/sales?limit=500',store),movements=await call('/inventory/transactions?limit=500',store),alerts=await call('/ai/expiry-alerts',store);
      if(products.length!==12||suppliers.length!==3||new Set(products.map(p=>p.sku)).size!==12)throw new Error('Live inventory counts/uniqueness failed');
      for(const rows of [products,suppliers,sales,movements])if(rows.some(r=>r.createdBy!==String(user._id)||r.store!==String(store._id)))throw new Error('Live scope mismatch');
      for(const url of ['/reports/dashboard','/reports/daily','/reports/weekly','/reports/monthly','/reports/inventory','/reports/low-stock','/reports/expiry'])await call(url,store);
      const ai=await call('/ai/reorder-suggestions',store);if(ai.source!=='RULE_BASED')throw new Error('Expected actual deterministic fallback');
      if(products.some(p=>/\bDEMO\b|\bSAMPLE DATA\b|Synthetic history/i.test(p.name+' '+p.sku+' '+p.description)))throw new Error('Visible record labels remain');
      if(store.shopType==='CLOTHING'&&(alerts.alerts.length||products.some(p=>p.expiryDate||!['OLD_FASHION','NEW_FASHION'].includes(p.fashionType))))throw new Error('Clothing rules failed');
      const foreign=await db.collection('stores').findOne({createdBy:{$ne:user._id}});const denied=await fetch('http://localhost:5000/api/products',{headers:{Authorization:'Bearer '+token,'X-Store-Id':String(foreign._id)}});if(denied.status!==404)throw new Error('Foreign store was not denied');
      results.push({shopType:store.shopType,storeId:String(store._id),products:products.length,suppliers:suppliers.length,sales:sales.length,stockTransactions:movements.length,upcomingAlerts:alerts.alerts.length,ai:ai.source,foreignStoreStatus:denied.status});
    }
    phase='browser-startup';browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||(process.platform==='win32'?'chrome':undefined)});const context=await browser.newContext({viewport:{width:1440,height:900}});await context.addInitScript(value=>localStorage.setItem('token',value),token);
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.name));page.on('console',m=>{if(m.type()==='error')errors.push('console');});
    const routes=['dashboard','products','suppliers','inventory','sales','reports','ai-recommendations'];
    await page.goto('http://localhost:5500/dashboard');await page.getByRole('combobox',{name:'Active store',exact:true}).waitFor();
    for(const store of stores){
      await page.getByRole('combobox',{name:'Active store',exact:true}).selectOption(String(store._id));
      for(const route of routes){
        phase='UI-'+store.shopType+'-'+route;
        await page.goto('http://localhost:5500/'+route);await page.locator('h1').waitFor();
        await page.waitForFunction(()=>!document.querySelector('[aria-busy="true"]')&&!Array.from(document.querySelectorAll('[role="status"]')).some(e=>/Loading.*\.\.\./.test(e.textContent)));
        if(/\bDEMO\b|\bSAMPLE DATA\b/i.test(await page.locator('body').innerText()))throw new Error('Rendered demo labels remain');
        if(route==='dashboard'){await page.waitForFunction(()=>Array.from(document.querySelectorAll('.stat')).some(e=>e.querySelector('small')?.textContent==='Total Products'&&e.querySelector('strong')?.textContent==='12'));}
        if(route==='products'||route==='suppliers'||route==='inventory'){const count=await page.locator(route==='inventory'?'.stock-overview .data-table tbody tr':'.data-table tbody tr').count();if(count!==(route==='suppliers'?3:12))throw new Error('Rendered inventory table counts failed');}
        if(route==='reports'&&await page.locator('canvas').count()<3)throw new Error('Report charts missing');
        if(route==='ai-recommendations'){await page.getByRole('button',{name:'Generate AI Recommendations',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.ai-status-label')?.textContent==='Rule-based fallback');}
        if(/\bDEMO\b|\bSAMPLE DATA\b/i.test(await page.locator('body').innerText()))throw new Error('Rendered recommendation labels remain');
      }
      for(const [width,height]of [[375,812],[768,1024],[1440,900]]){await page.setViewportSize({width,height});if(!await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))throw new Error('Live layout overflow');}
      await page.setViewportSize({width:1440,height:900});
    }
    if(errors.length)throw new Error('Live browser errors occurred');
    const result={verified:true,email:EMAIL,userId:String(user._id),stores:results,routes,browserErrors:0,viewports:[[375,812],[768,1024],[1440,900]],authentication:'Short-lived signed JWT through normal middleware; existing password not read or reset'};
    const file=path.join(__dirname,'../test-results/noushik-live-verification.json');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
    await context.close();
  }finally{if(browser)await browser.close();await mongoose.disconnect();}
}
main().catch(e=>{let detail=e.message;const secrets=[process.env.MONGO_URI,process.env.JWT_SECRET,process.env.GEMINI_API_KEY];try{const uri=new URL(process.env.MONGO_URI);secrets.push(uri.username,uri.password,decodeURIComponent(uri.password));}catch{}for(const secret of secrets)if(secret)detail=detail.replaceAll(secret,'[redacted]');console.error('Live read-only verification failed at '+phase+' ('+e.name+'): '+detail.slice(0,220));process.exitCode=1;});
