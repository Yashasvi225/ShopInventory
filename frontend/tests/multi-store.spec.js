import { test, expect, register, withDatabase, ObjectId } from './fixtures.js';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const backend=createRequire(new URL('../../backend/package.json',import.meta.url));
const base='http://localhost:5000/api';
const types=['MEDICAL','RESTAURANT','GROCERY','CLOTHING'];
const labels={MEDICAL:'Medical Store',RESTAURANT:'Restaurant',GROCERY:'Grocery Store',CLOTHING:'Clothing Store'};
const combos=[...types.map(type=>[type]),types.slice(0,2),types.slice(0,3),types];
test.beforeEach(()=>{expect(process.env.NODE_ENV).toBe('test');expect(process.env.GEMINI_API_KEY).toBe('');});
for(const shopTypes of combos)test(`One account registers and logs in with ${shopTypes.join(', ')}`,async({request,account})=>{
  const created=await request.post(base+'/auth/register',{data:{...account,shopTypes}});expect(created.status()).toBe(201);
  const session=await created.json();const headers={Authorization:`Bearer ${session.token}`};
  expect(session.user.shopType).toBe(shopTypes[0]);expect(session.user.password).toBeUndefined();
  const owned=await request.get(base+'/stores',{headers});expect(owned.status()).toBe(200);
  const stores=(await owned.json()).stores;expect(new Set(stores.map(store=>store.shopType))).toEqual(new Set(shopTypes));
  expect(stores.every(store=>store.createdBy===session.user._id)).toBeTruthy();
  const login=await request.post(base+'/auth/login',{data:{email:account.email,password:account.password}});expect(login.status()).toBe(200);
  const stored=await withDatabase(db=>db.collection('users').findOne({_id:new ObjectId(session.user._id)}));
  expect(await backend('bcrypt').compare(account.password,stored.password)).toBeTruthy();
});
test('Invalid store selections never create an account or stores',async({request,account})=>{
  for(const shopTypes of [[],null,'GROCERY',['OTHER'],['grocery'],['MEDICAL','MEDICAL'],[{}],types.concat('GROCERY')]){
    expect((await request.post(base+'/auth/register',{data:{...account,shopTypes}})).status()).toBe(400);
    expect(await withDatabase(db=>db.collection('users').findOne({email:account.email}))).toBeNull();
  }
});
test('Four-store data, transactions, reports, alerts, predictions and authorization remain separate',async({page,request,account})=>{
  test.setTimeout(360000);
  await page.goto('/register');
  for(const [label,value] of [['Name',account.name],['Email',account.email],['Password',account.password],['Confirm Password',account.password]])await page.getByLabel(label,{exact:true}).fill(value);
  await page.getByRole('button',{name:'Register',exact:true}).click();await expect(page.getByRole('alert')).toHaveText('Select at least one store.');
  for(const type of types)await page.getByRole('checkbox',{name:labels[type],exact:true}).check();
  await page.getByRole('button',{name:'Register',exact:true}).click();await expect(page).toHaveURL(/dashboard$/);
  const selector=page.getByRole('combobox',{name:'Active store',exact:true});await expect(selector).toBeVisible();
  const token=await page.evaluate(()=>localStorage.getItem('token'));const headers={Authorization:`Bearer ${token}`};
  const stores=(await (await request.get(base+'/stores',{headers})).json()).stores;
  const call=async(method,url,data,store,status=200)=>{
    const response=await request[method](base+url,{headers:{...headers,...(store?{'X-Store-Id':store._id}:{})},...(data?{data}:{})});
    expect(response.status(),`${method} ${url}`).toBe(status);return response.json();
  };
  const entries=[];const tomorrow=new Date();tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
  for(const store of stores){
    const supplier=await call('post','/suppliers',{name:store.shopType+' supplier'},store,201);
    const product=await call('post','/products',{name:store.shopType+' inventory',sku:store.shopType+'-ISOLATED',supplier:supplier._id,sellingPrice:10,purchasePrice:4,quantity:0,minimumStock:5,
      expiryDate:tomorrow.toISOString().slice(0,10),...(store.shopType==='CLOTHING'?{fashionType:'OLD_FASHION'}:{})},store,201);
    expect(product.store).toBe(store._id);expect(product.createdBy).toBe(supplier.createdBy);
    await call('post','/inventory/stock-in',{product:product._id,quantity:7},store,201);
    await call('post','/inventory/stock-out',{product:product._id,quantity:2},store,201);
    const sale=await call('post','/sales',{product:product._id,quantity:3},store,201);expect(sale.store).toBe(store._id);expect(sale.totalAmount).toBe(30);
    expect((await call('get','/products/'+product._id,null,store)).quantity).toBe(2);
    expect(await call('get','/products',null,store)).toHaveLength(1);expect(await call('get','/suppliers',null,store)).toHaveLength(1);
    expect(await call('get','/inventory/transactions',null,store)).toHaveLength(3);expect(await call('get','/sales',null,store)).toHaveLength(1);
    const dashboard=await call('get','/reports/dashboard',null,store);expect(dashboard.totalStock).toBe(2);expect(dashboard.totalProducts).toBe(1);expect(dashboard.todaySales).toBe(30);expect(dashboard.lowStockCount).toBe(1);
    for(const range of ['daily','weekly','monthly'])expect((await call('get','/reports/'+range,null,store)).totalSales).toBe(30);
    expect((await call('get','/reports/inventory',null,store)).products.map(row=>row._id)).toEqual([product._id]);
    expect(await call('get','/reports/low-stock',null,store)).toHaveLength(1);
    const expiry=await call('get','/reports/expiry',null,store);expect(expiry.expiringSoon.length).toBe(store.shopType==='CLOTHING'?0:1);
    const alerts=await call('get','/ai/expiry-alerts',null,store);expect(alerts.alerts.length).toBe(store.shopType==='CLOTHING'?0:1);
    if(store.shopType==='CLOTHING'){
      expect(product.expiryDate).toBeNull();expect(product.fashionType).toBe('OLD_FASHION');
      await call('post','/products',{name:'Invalid fashion',sku:'INVALID',sellingPrice:1},store,400);
    }else{
      await call('put','/products/'+product._id,{fashionType:'NEW_FASHION'},store,400);
      await call('put','/products/'+product._id,{expiryDate:null},store);
      await call('put','/products/'+product._id,{expiryDate:tomorrow.toISOString().slice(0,10)},store);
    }
    const predictions=await call('get','/ai/reorder-suggestions',null,store);expect(predictions.source).toBe('RULE_BASED');
    expect(predictions.suggestions.length).toBeGreaterThan(0);expect(predictions.suggestions.every(row=>row.productName===product.name)).toBeTruthy();
    entries.push({store,product,supplier,alert:alerts.alerts[0]});
  }
  for(const entry of entries){
    const wrong=entries.find(item=>item.store._id!==entry.store._id).store;
    for(const method of ['get','put','delete']){
      await call(method,'/products/'+entry.product._id,method==='put'?{name:'Denied'}:null,wrong,404);
      await call(method,'/suppliers/'+entry.supplier._id,method==='put'?{name:'Denied'}:null,wrong,404);
    }
    for(const url of ['/sales','/inventory/stock-in','/inventory/stock-out'])await call('post',url,{product:entry.product._id,quantity:1},wrong,404);
    await call('post','/products',{name:'Denied relation',sku:'DENIED',sellingPrice:1,supplier:entry.supplier._id},wrong,404);
    await call('put','/products/'+entry.product._id,{store:wrong._id},entry.store,400);
    if(entry.alert){await call('patch','/ai/expiry-alerts/'+entry.alert._id+'/dismiss',{},wrong,404);
      await call('patch','/ai/expiry-alerts/'+entry.alert._id+'/dismiss',{},entry.store);expect((await call('get','/ai/expiry-alerts',null,entry.store)).alerts).toEqual([]);}
  }
  const other={...account,email:account.email.replace('@','-other@'),name:account.name+' other'};account.additional.push(other);
  const outsider=await register(request,other,'GROCERY');const foreignHeaders={...headers,'X-Store-Id':(await (await request.get(base+'/stores',{headers:outsider.headers})).json()).stores[0]._id};
  for(const url of ['/products','/suppliers','/sales','/inventory/transactions','/reports/dashboard','/reports/daily','/reports/inventory','/ai/expiry-alerts','/ai/reorder-suggestions']){
    expect((await request.get(base+url,{headers:foreignHeaders})).status()).toBe(404);
    expect((await request.get(base+url,{headers:{...headers,'X-Store-Id':'invalid'}})).status()).toBe(400);
  }
  expect((await request.post(base+'/products',{headers:foreignHeaders,data:{name:'Denied',sku:'DENIED',sellingPrice:1}})).status()).toBe(404);
  expect((await request.get(base+'/products?storeId='+foreignHeaders['X-Store-Id'],{headers})).status()).toBe(400);
  expect((await request.get(base+'/products',{headers})).status()).toBe(200); // original default compatibility
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  for(const entry of entries){
    await selector.selectOption(entry.store._id);await expect(selector).toHaveValue(entry.store._id);
    await page.goto('/products');await expect(page.getByRole('row').filter({hasText:entry.product.name})).toBeVisible();
    for(const wrong of entries.filter(item=>item!==entry))await expect(page.locator('tbody').getByText(wrong.product.name,{exact:true})).toHaveCount(0);
    await page.reload();await expect(selector).toHaveValue(entry.store._id);expect(await page.evaluate(()=>localStorage.getItem('token'))).toBe(token);
    if(entry.store.shopType==='CLOTHING')await expect(page.locator('.expiry-list article')).toHaveCount(0);
    await page.getByRole('button',{name:'Add Product',exact:true}).click();await expect(page.getByLabel('Expiry Date',{exact:true})).toHaveCount(entry.store.shopType==='CLOTHING'?0:1);await page.keyboard.press('Escape');
  }
  for(const [width,height] of [[375,812],[768,1024],[1440,900]]){
    await page.setViewportSize({width,height});await expect(selector).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  }
  await page.setViewportSize({width:1440,height:900});
  for(const [index,route] of ['dashboard','products','suppliers','inventory','sales','reports','ai-recommendations'].entries()){
    await page.goto('/'+route);await expect(selector).toBeVisible();
    const current=await selector.inputValue();const entry=entries.filter(item=>item.store._id!==current)[index%3];
    await selector.selectOption(entry.store._id);await expect(selector).toHaveValue(entry.store._id);
    await expect(page.locator('.sidebar .shop')).toHaveText(labels[entry.store.shopType]);
    if(route==='suppliers')await expect(page.locator('tbody').getByText(entry.supplier.name,{exact:true})).toBeVisible();
    if(['products','inventory','sales','reports'].includes(route))await expect(page.locator('tbody').getByText(entry.product.name,{exact:true}).first()).toBeVisible();
    if(route==='ai-recommendations'){
      await page.getByRole('button',{name:'Generate AI Recommendations',exact:true}).click();
      await expect(page.getByRole('heading',{name:entry.product.name,exact:true})).toBeVisible();
      if(entry.store.shopType==='CLOTHING')await expect(page.locator('.expiry-list')).toHaveCount(0);
    }
    for(const wrong of entries.filter(item=>item!==entry))await expect(page.locator('#main-content').getByText(wrong.product.name,{exact:true})).toHaveCount(0);
  }
  const original=await selector.inputValue();const failed=entries.find(entry=>entry.store._id!==original).store;
  await page.route('**/api/reports/dashboard',route=>route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({message:'Denied test switch'})}));
  await selector.selectOption(failed._id);await expect(page.getByRole('alert')).toContainText('permission');await expect(selector).toHaveValue(original);await page.unroute('**/api/reports/dashboard');
  expect(errors).toEqual([]);
  await page.setViewportSize({width:1440,height:900});await page.getByRole('link',{name:'Logout',exact:true}).click();await expect(page).toHaveURL(/login$/);
  await expect(selector).toHaveCount(0);
  await page.getByLabel('Email',{exact:true}).fill(account.email);await page.getByLabel('Password',{exact:true}).fill(account.password);await page.getByRole('button',{name:'Login',exact:true}).click();await expect(page).toHaveURL(/dashboard$/);await expect(selector).toBeVisible();
  // A pending write stays bound to its original store and disables switching.
  const chosenId=await selector.inputValue();const chosen=entries.find(entry=>entry.store._id===chosenId);
  await page.route('**/api/inventory/stock-in',async route=>{await new Promise(resolve=>setTimeout(resolve,700));await route.continue();});
  const mutation=page.evaluate(async product=>{const {api,json}=await import('/src/api.js');return api('/inventory/stock-in',json('POST',{product,quantity:1}));},chosen.product._id);
  await expect(selector).toBeDisabled();await mutation;await expect(selector).toBeEnabled();await page.unroute('**/api/inventory/stock-in');
  expect((await call('get','/products/'+chosen.product._id,null,chosen.store)).quantity).toBe(3);
  for(const entry of entries.filter(item=>item!==chosen))expect((await call('get','/products/'+entry.product._id,null,entry.store)).quantity).toBe(2);
});
test('Expiry scanner and seven-day estimates use owned stores even when the account default is Clothing',async({request,account})=>{
  const created=await request.post(base+'/auth/register',{data:{...account,shopTypes:['CLOTHING','MEDICAL','RESTAURANT','GROCERY']}});expect(created.status()).toBe(201);
  const session=await created.json();expect(session.user.shopType).toBe('CLOTHING');const auth={Authorization:`Bearer ${session.token}`};
  const stores=(await (await request.get(base+'/stores',{headers:auth})).json()).stores;const products=[];
  const tomorrow=new Date(Date.now()+86400000).toISOString().slice(0,10);
  for(const store of stores.filter(item=>item.shopType!=='CLOTHING')){
    const headers={...auth,'X-Store-Id':store._id};const createdProduct=await request.post(base+'/products',{headers,data:{name:store.shopType+' expiry',sku:'SCANNER-'+store.shopType,sellingPrice:2,quantity:11,expiryDate:tomorrow}});expect(createdProduct.status()).toBe(201);
    const product=await createdProduct.json();products.push({store,product,headers});
    expect((await request.post(base+'/sales',{headers,data:{product:product._id,quantity:1}})).status()).toBe(201);
  }
  const mongoose=backend('mongoose');await mongoose.connect(process.env.MONGO_URI);
  try{
    const expiry=backend('./services/expiryAlertService');const eligible=await expiry.syncAlerts();
    for(const entry of products){
      expect(eligible.some(product=>String(product._id)===entry.product._id)).toBeTruthy();
      const Alert=backend('./models/ExpiryAlert');const alert=await Alert.findOne({product:entry.product._id,store:entry.store._id});expect(alert).not.toBeNull();
      await expiry.processAlert(alert._id,async()=>{const error=new Error('Mock unavailable');error.code='NOT_CONFIGURED';throw error;});
      const saved=await Alert.findById(alert._id).lean();expect(saved.recommendationStatus).toBe('UNAVAILABLE');expect(saved.recommendation.suggestedPurchaseQuantity).toBe(7);expect(saved.recommendation.salesBasis.unitsSold).toBe(1);
      expect((await (await request.get(base+'/ai/expiry-alerts',{headers:entry.headers})).json()).alerts).toHaveLength(1);
    }
    expect((await (await request.get(base+'/ai/expiry-alerts',{headers:auth})).json()).alerts).toEqual([]);
  }finally{await mongoose.disconnect();}
});
test('Concurrent empty-store conversion and inventory creation cannot leave dangling store records',async({request,account})=>{
  const session=await register(request,account,'GROCERY');
  const stores=(await (await request.get(base+'/stores',{headers:session.headers})).json()).stores;
  const headers={...session.headers,'X-Store-Id':stores[0]._id};
  const [created,changed]=await Promise.all([
    request.post(base+'/products',{headers,data:{name:'Concurrent product',sku:'CONCURRENT',sellingPrice:2,quantity:1}}),
    request.put(base+'/auth/shop-type',{headers:session.headers,data:{shopType:'CLOTHING'}}),
  ]);
  expect([201,404]).toContain(created.status());expect([200,409]).toContain(changed.status());
  const records=await withDatabase(async db=>({products:await db.collection('products').find({createdBy:new ObjectId(session.user._id)}).toArray(),stores:await db.collection('stores').find({createdBy:new ObjectId(session.user._id)}).toArray()}));
  for(const product of records.products){const store=records.stores.find(item=>String(item._id)===String(product.store));expect(store).toBeDefined();expect(store.shopType).toBe(product.shopType);}
  if(created.status()===201)expect(changed.status()).toBe(409);
});
test('Legacy backfill preserves exact original documents, verifies encrypted recovery, is repeatable and rolls back safely',async()=>{
  const {MongoClient}=backend('mongoose').mongo;const {createBackup,verifyRestore,hash}=backend('./migrations/backup');const migration=backend('./migrations/stores');
  const marker=randomUUID().replaceAll('-',''),name='simm_'+marker;
  const client=new MongoClient(process.env.MONGO_URI,{dbName:name});await client.connect();const db=client.db();expect(db.databaseName).toBe(name);let owned=false;
  const file=path.join(fileURLToPath(new URL('../../backend/test-results/',import.meta.url)),`store-backup-${marker}.json`);
  try{
    expect(name).toMatch(/^simm_[a-f0-9]{32}$/);expect((await db.listCollections().toArray()).length).toBe(0);
    await db.collection('__store_test_owner').insertOne({_id:marker});owned=true;
    const user={_id:new ObjectId(),name:'Legacy',email:'legacy@example.invalid',password:await backend('bcrypt').hash(' old ',12),shopType:'GROCERY',shopName:'Existing name',createdAt:new Date()};
    const supplier={_id:new ObjectId(),name:'Existing supplier',createdBy:user._id,shopType:'GROCERY'};
    const product={_id:new ObjectId(),name:'Existing product',sku:'ORIGINAL',quantity:9,minimumStock:2,purchasePrice:1,sellingPrice:3,createdBy:user._id,shopType:'GROCERY',supplier:supplier._id,createdAt:new Date(),expiryDate:new Date(Date.now()+86400000)};
    const sale={_id:new ObjectId(),product:product._id,quantity:1,sellingPrice:3,totalAmount:3,date:new Date(),createdBy:user._id};
    const stock={_id:new ObjectId(),product:product._id,quantity:1,type:'STOCK_OUT',reason:'Sale '+sale._id,date:sale.date,createdBy:user._id};
    const alert={_id:new ObjectId(),product:product._id,createdBy:user._id,shopType:'GROCERY',expiryDay:product.expiryDate.toISOString().slice(0,10),dismissedAt:new Date(),recommendationStatus:'NO_DATA',recommendation:null,attempts:0};
    for(const [table,doc] of Object.entries({users:user,products:product,suppliers:supplier,sales:sale,stocktransactions:stock,expiryalerts:alert}))await db.collection(table).insertOne(doc);
    const backup=await createBackup(client,file);expect((await verifyRestore(client,file)).verifiedRestore).toBeTruthy();
    const result=await migration.apply(client,file,backup.sha256);expect(result.stores).toBe(1);expect(result.counts.products).toBe(1);
    expect((await migration.apply(client,file,backup.sha256)).repeated).toBeTruthy();await migration.verifyApplied(client);
    expect(hash(await db.collection('users').findOne({_id:user._id}))).toBe(hash(user));
    const store=await db.collection('stores').findOne({createdBy:user._id});
    for(const [table,doc] of Object.entries({products:product,suppliers:supplier,sales:sale,stocktransactions:stock,expiryalerts:alert})){
      const actual=await db.collection(table).findOne({_id:doc._id});expect(String(actual.store)).toBe(String(store._id));delete actual.store;expect(hash(actual)).toBe(hash(doc));
    }
    const changed={_id:new ObjectId(),createdBy:user._id,store:store._id,shopType:'GROCERY'};
    await db.collection('products').insertOne(changed);await expect(migration.rollback(client,file,backup.sha256)).rejects.toThrow(/New records/);await db.collection('products').deleteOne({_id:changed._id});
    const extraStore={_id:new ObjectId(),createdBy:user._id,shopType:'MEDICAL',name:'New membership',createdAt:new Date(),updatedAt:new Date()};
    await db.collection('stores').insertOne(extraStore);await expect(migration.rollback(client,file,backup.sha256)).rejects.toThrow(/New stores/);await db.collection('stores').deleteOne({_id:extraStore._id});
    expect((await migration.rollback(client,file,backup.sha256)).state).toBe('ROLLED_BACK');
    for(const [table,doc] of Object.entries({users:user,products:product,suppliers:supplier,sales:sale,stocktransactions:stock,expiryalerts:alert}))expect(hash(await db.collection(table).findOne({_id:doc._id}))).toBe(hash(doc));
    expect(await backend('bcrypt').compare(' old ',user.password)).toBeTruthy();
    await expect(migration.apply(client,file,backup.sha256)).rejects.toThrow(/rolled back/);
  }finally{
    if(owned){expect(await db.collection('__store_test_owner').findOne({_id:marker})).not.toBeNull();await db.dropDatabase();}
    await client.close();if(fs.existsSync(file))fs.unlinkSync(file);
  }
});
