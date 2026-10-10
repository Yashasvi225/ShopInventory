import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
import {test,expect,register,withDatabase,ObjectId} from './fixtures.js';
const backend=fileURLToPath(new URL('../../backend/',import.meta.url)),requireBackend=createRequire(new URL('../../backend/package.json',import.meta.url));
const {hash}=requireBackend('./migrations/backup');const {clean}=requireBackend('./migrations/demoTransfer');
const base='http://localhost:5000/api',types=['MEDICAL','RESTAURANT','GROCERY','CLOTHING'];
function child(args,input=''){return new Promise((resolve,reject)=>{const p=spawn(process.execPath,args,{cwd:backend,env:process.env,windowsHide:true,stdio:['pipe','pipe','pipe']});let stdout='',stderr='';p.stdout.on('data',x=>stdout+=x);p.stderr.on('data',x=>stderr+=x);p.on('error',reject);p.on('exit',code=>resolve({code,stdout,stderr}));p.stdin.end(input);});}
const cli=(...args)=>child(['migrations/demoTransferCli.js',...args]);
async function snapshot(){return withDatabase(async db=>{const result={};for(const name of ['users','stores','products','suppliers','sales','stocktransactions','expiryalerts','demodatasets'])result[name]=Object.fromEntries((await db.collection(name).find().sort({_id:1}).toArray()).map(d=>[String(d._id),hash(d)]));return result;});}
test('Both demo datasets consolidate without duplicate inventory or lost history; isolation, retirement and selective recovery remain safe',async({page,request,account})=>{
  test.setTimeout(420000);expect(process.env.NODE_ENV).toBe('test');expect(process.env.GEMINI_API_KEY).toBe('');
  await withDatabase(async db=>{expect(db.databaseName).toMatch(/^sim_[a-f0-9]{32}$/);expect(await db.collection('__verification_owner').findOne({_id:db.databaseName.slice(4)})).not.toBeNull();});
  const targetAccount={...account,email:'noushik@gmail.com',name:'Existing multi-store owner'};account.additional.push(targetAccount);
  const registration=await request.post(base+'/auth/register',{data:{name:targetAccount.name,email:targetAccount.email,password:targetAccount.password,shopTypes:types}});expect(registration.status()).toBe(201);const target=await registration.json(),headers={Authorization:'Bearer '+target.token};
  const stores=(await (await request.get(base+'/stores',{headers})).json()).stores;
  const outsider=await register(request,account,'GROCERY');
  const priorAccount={...account,email:'prior-'+randomUUID()+'@example.invalid',name:'Previous real recipient'};account.additional.push(priorAccount);
  const prior=await register(request,priorAccount,'GROCERY');
  const freshAccount={...account,email:'fresh-'+randomUUID()+'@example.invalid',name:'Fresh real account'};account.additional.push(freshAccount);
  const fresh=await register(request,freshAccount,'MEDICAL');
  const h=store=>({...headers,'X-Store-Id':store._id}),medical=stores.find(s=>s.shopType==='MEDICAL');
  const call=async(method,url,data,hs=h(medical),status=200)=>{const response=await request[method](base+url,{headers:hs,...(data?{data}:{})});expect(response.status(),method+' '+url).toBe(status);return response.json();};
  const supplier=await call('post','/suppliers',{name:'Existing supplier'},h(medical),201);
  const existing=await call('post','/products',{name:'Existing product',sku:'REAL-01',supplier:supplier._id,sellingPrice:10},h(medical),201);
  await call('post','/inventory/stock-in',{product:existing._id,quantity:10},h(medical),201);await call('post','/sales',{product:existing._id,quantity:1},h(medical),201);
  const seed=await child(['-e',"const m=require('mongoose');(async()=>{await m.connect(process.env.MONGO_URI);try{const s=require('./demo/seed');const {randomUUID}=require('node:crypto');await s.seedDemo({namespace:'local',password:'Verification-'+randomUUID()});await s.seedDemo({namespace:'presentation',passwords:Object.fromEntries(['MEDICAL','RESTAURANT','GROCERY','CLOTHING'].map(t=>[t,'Verification-'+randomUUID()]))});}finally{await m.disconnect();}})().catch(()=>{process.exitCode=1;});"]);expect(seed.code,seed.stderr).toBe(0);
  // Model an already completed Grocery transfer to an unrelated real user, as on the live database.
  await withDatabase(async db=>{const manifest=await db.collection('demodatasets').findOne({_id:'sim-p2-demo-v1:presentation'}),owner=manifest.owners.find(o=>o.shopType==='GROCERY');const destination=await db.collection('stores').findOne({createdBy:new ObjectId(prior.user._id),shopType:'GROCERY'});
    for(const name of ['products','suppliers','sales','stocktransactions','expiryalerts'])for(const doc of await db.collection(name).find({createdBy:owner.userId}).toArray())await db.collection(name).replaceOne({_id:doc._id},{...doc,...clean(name,doc),createdBy:new ObjectId(prior.user._id),store:destination._id});
    await db.collection('inventorymigrations').insertOne({_id:'prior-test-transfer',datasetKey:manifest._id,state:'APPLIED',sourceId:owner.userId,targetId:new ObjectId(prior.user._id)});
  });
  const id=target.user._id;
  const missing=await cli('plan','--target-id=000000000000000000000001');expect(missing.code).toBe(1);
  const collision=await call('post','/products',{name:'Existing collision',sku:'MEDICAL-01',sellingPrice:10},h(medical),201);
  const refused=await cli('plan','--target-id='+id);expect(refused.code).toBe(1);expect(refused.stderr).toContain('collision');await call('delete','/products/'+collision._id,null);
  const planned=await cli('plan','--target-id='+id);expect(planned.code,planned.stderr).toBe(0);const plan=JSON.parse(planned.stdout);expect(plan.counts).toEqual({suppliers:12,products:48,sales:1504,stocktransactions:1588,expiryalerts:18});expect(plan.skipped).toHaveLength(1);
  const conflictingProduct=await withDatabase(async db=>{const manifest=await db.collection('demodatasets').findOne({_id:'sim-p2-demo-v1:presentation'}),owner=manifest.owners.find(o=>o.shopType==='MEDICAL'),p=await db.collection('products').findOne({_id:owner.productIds[0]});await db.collection('products').updateOne({_id:p._id},{$set:{sellingPrice:p.sellingPrice+1}});return p;});
  const attributesRefused=await cli('plan','--target-id='+id);expect(attributesRefused.code).toBe(1);
  await withDatabase(db=>db.collection('products').replaceOne({_id:conflictingProduct._id},conflictingProduct));
  // A dismissal in either duplicate stays dismissed; no source event is lost from recovery.
  await withDatabase(async db=>{const manifest=await db.collection('demodatasets').findOne({_id:'sim-p2-demo-v1:presentation'}),owner=manifest.owners.find(o=>o.shopType==='MEDICAL');await db.collection('expiryalerts').updateOne({createdBy:owner.userId,expiryDay:new Date().toISOString().slice(0,10)},{$set:{dismissedAt:new Date()}});});
  const before=await snapshot(),file=path.join(backend,'test-results','demo-transfer-'+randomUUID()+'.dpapi.json');
  try{
    const backup=await child(['migrations/cli.js','backup','--backup='+file]);expect(backup.code,backup.stderr).toBe(0);const evidence=JSON.parse(backup.stdout);expect(evidence.verifiedRestore).toBeTruthy();expect(fs.readFileSync(file,'utf8')).not.toContain(targetAccount.email);
    const args=['--target-id='+id,'--backup='+file,'--backup-hash='+evidence.sha256];
    const applied=await cli('apply',...args);expect(applied.code,applied.stderr).toBe(0);expect(JSON.parse(applied.stdout).sourceCounts.sales).toBe(1504);
    const after=await snapshot();expect(after.users).toEqual(before.users);expect(after.stores).toEqual(before.stores);expect(after.demodatasets).toEqual(before.demodatasets);
    const audit=await withDatabase(db=>db.collection('inventorymigrations').findOne({_id:'demo-consolidation-to:'+id}));const changed=new Set(audit.records.map(r=>r.collection+':'+r.id));
    for(const name of Object.keys(before))for(const [docId,digest]of Object.entries(before[name]))if(!changed.has(name+':'+docId))expect(after[name][docId]).toBe(digest);
    expect((await cli('apply',...args)).code).toBe(0);expect(await snapshot()).toEqual(after);
    expect((await request.post(base+'/auth/login',{data:{email:targetAccount.email,password:targetAccount.password}})).status()).toBe(200);
    const browserErrors=[];page.on('pageerror',e=>browserErrors.push(e.message));await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill(targetAccount.email);await page.getByLabel('Password',{exact:true}).fill(targetAccount.password);await page.getByRole('button',{name:'Login',exact:true}).click();await expect(page).toHaveURL(/dashboard$/);
    for(const store of stores){const hs=h(store),products=await call('get','/products',null,hs);expect(products).toHaveLength(store.shopType==='MEDICAL'?13:12);expect(new Set(products.map(p=>p.sku)).size).toBe(products.length);expect(products.every(p=>p.store===store._id&&p.createdBy===id)).toBeTruthy();
      const migrated=products.filter(p=>p.sku!=='REAL-01');expect(migrated.every(p=>!p.name.includes('DEMO')&&!p.description.includes('Synthetic history'))).toBeTruthy();
      const sales=await call('get','/sales',null,hs);expect(sales).toHaveLength(store.shopType==='GROCERY'?214:store.shopType==='CLOTHING'?434:store.shopType==='MEDICAL'?429:428);
      const alerts=await call('get','/ai/expiry-alerts',null,hs);expect(alerts.alerts.length).toBe(store.shopType==='CLOTHING'?0:store.shopType==='MEDICAL'?5:6);
      const ai=await call('get','/ai/reorder-suggestions',null,hs);expect(ai.source).toBe('RULE_BASED');expect(ai.suggestions.every(r=>migrated.concat(products).some(p=>p._id===r.productId))).toBeTruthy();
      if(store.shopType==='CLOTHING'){expect(migrated.every(p=>p.expiryDate===null&&['OLD_FASHION','NEW_FASHION'].includes(p.fashionType))).toBeTruthy();expect((await request.post(base+'/products',{headers:hs,data:{name:'Invalid',sku:'INVALID-CLOTHING',sellingPrice:10}})).status()).toBe(400);}
      expect((await request.get(base+'/products/'+migrated[0]._id,{headers:outsider.headers})).status()).toBe(404);
      expect((await request.get(base+'/products',{headers:{...outsider.headers,'X-Store-Id':store._id}})).status()).toBe(404);
      await page.getByRole('combobox',{name:'Active store'}).selectOption(store._id);
      for(const route of ['/dashboard','/products','/suppliers','/inventory','/sales','/reports','/ai-recommendations']){await page.goto(route);await expect(page.locator('h1')).toBeVisible();await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);await expect(page.getByText(/Loading.*\.\.\./)).toHaveCount(0);await expect(page.locator('body')).not.toContainText('[DEMO]');expect(await page.locator('body').innerText()).not.toMatch(/\bDEMO\b|\bSAMPLE DATA\b/i);}
    }
    expect(browserErrors).toEqual([]);expect(await call('get','/products',null,fresh.headers)).toEqual([]);expect(await call('get','/products',null,prior.headers)).toHaveLength(12);
    // Recompute consolidated expiry estimates from both histories, never reuse old Gemini success.
    await withDatabase(async db=>{const p=await db.collection('products').findOne({createdBy:new ObjectId(id),sku:'MEDICAL-03'}),alert=await db.collection('expiryalerts').findOne({product:p._id});expect(p.quantity).toBe(36);expect(alert.recommendation.source).toBe('APPLICATION');expect(alert.recommendation.salesBasis.saleCount).toBe(60);expect(alert.recommendation.suggestedPurchaseQuantity).toBe(Math.ceil(alert.recommendation.salesBasis.unitsSold/alert.recommendation.salesBasis.observationDays*7));});
    const retired=await cli('retire',...args);expect(retired.code,retired.stderr).toBe(0);expect(JSON.parse(retired.stdout).accounts).toBe(7);expect((await cli('retire',...args)).code).toBe(0);
    await withDatabase(async db=>{for(const s of audit.sources){expect(await db.collection('users').findOne({_id:s.userId})).toBeNull();expect(await db.collection('stores').findOne({_id:s.storeId})).toBeNull();}expect(await db.collection('users').findOne({email:'demo.grocery@example.com'})).not.toBeNull();});
    const guarded=await child(['-e',"const m=require('mongoose');(async()=>{await m.connect(process.env.MONGO_URI);try{await require('./migrations/guard').assertDatasetUnmigrated('sim-p2-demo-v1:local');}finally{await m.disconnect();}})().catch(e=>{console.error(e.message);process.exitCode=1});"]);expect(guarded.code).toBe(1);expect(guarded.stderr).toContain('transferred records');
    const p=await withDatabase(db=>db.collection('products').findOne({createdBy:new ObjectId(id),sku:'MEDICAL-07'}));
    await call('post','/sales',{product:String(p._id),quantity:1},h(medical),201);const refuseRollback=await cli('rollback',...args);expect(refuseRollback.code).toBe(1);expect(refuseRollback.stderr).toContain('dependencies');
    // Reverse only the exact extra test sale and its movement to exercise positive recovery.
    await withDatabase(async db=>{const sale=await db.collection('sales').findOne({product:p._id,date:{$gt: new Date(audit.appliedAt)}});expect(sale).not.toBeNull();await db.collection('stocktransactions').deleteOne({product:p._id,reason:'Sale '+sale._id});await db.collection('sales').deleteOne({_id:sale._id});await db.collection('products').replaceOne({_id:p._id},p);});
    const reverted=await cli('rollback',...args);expect(reverted.code,reverted.stderr).toBe(0);const restored=await snapshot();expect(restored.users).toEqual(before.users);
    // Normal stock APIs increment only the internal Store write revision; preserve that later metadata.
    for(const name of Object.keys(before).filter(n=>n!=='stores'))expect(restored[name]).toEqual(before[name]);
    expect((await cli('apply',...args)).code).toBe(1);expect((await request.post(base+'/auth/login',{data:{email:targetAccount.email,password:targetAccount.password}})).status()).toBe(200);
    // Remove only this test's manifest-proven identities so later tests can seed their own presentation fixtures.
    await withDatabase(async db=>{for(const namespace of ['local','presentation']){const manifest=await db.collection('demodatasets').findOne({_id:'sim-p2-demo-v1:'+namespace});for(const owner of manifest.owners){const user=await db.collection('users').findOne({_id:owner.userId,email:owner.email,name:owner.name});expect(user).not.toBeNull();for(const name of ['expiryalerts','sales','stocktransactions','products','suppliers','stores'])await db.collection(name).deleteMany({createdBy:owner.userId});await db.collection('users').deleteOne({_id:owner.userId,email:owner.email,name:owner.name});}await db.collection('demodatasets').deleteOne({_id:manifest._id});}await db.collection('inventorymigrations').deleteMany({_id:{$in:['prior-test-transfer','demo-consolidation-to:'+id]}});});
  }finally{if(fs.existsSync(file))fs.unlinkSync(file);}
});
