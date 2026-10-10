const {test}=require('node:test');
const assert=require('node:assert/strict');
const {SHOP_TYPES}=require('../domain/storeTypes');
const {selectedStores}=require('../utils/storeSelection');
const {scope}=require('../utils/storeScope');
const {register}=require('../controllers/authController');
const User=require('../models/User');const Store=require('../models/Store');const mongoose=require('mongoose');
for(let mask=1;mask<16;mask++){
  const types=SHOP_TYPES.filter((_,i)=>mask&(1<<i));
  test(`Registration selection accepts ${types.join(', ')}`,()=>assert.deepEqual(selectedStores(types),types));
}
test('Empty, duplicate, invalid and forged store selections fail closed',()=>{
  for(const invalid of [[],null,undefined,'GROCERY',['OTHER'],['grocery'],['GROCERY','GROCERY'],[{}],SHOP_TYPES.concat('GROCERY')])assert.throws(()=>selectedStores(invalid),{statusCode:400});
});
test('Inventory scope requires an authenticated owned store',()=>{
  assert.deepEqual(scope({user:{_id:'owner'},store:{_id:'store',createdBy:'owner'}}),{createdBy:'owner',store:'store'});
  for(const store of [null,{_id:'store',createdBy:'other'}])assert.throws(()=>scope({user:{_id:'owner'},store}),{statusCode:400});
});
test('Multi-store registration uses one user and a single transaction without changing credential policy',async context=>{
  const secret=process.env.JWT_SECRET;process.env.JWT_SECRET='multi-store-unit-only';
  const session={unit:true};let savedUser,savedStores;
  context.mock.method(User,'exists',async()=>false);
  context.mock.method(mongoose.connection,'transaction',async work=>work(session));
  context.mock.method(User,'create',async([fields],options)=>{assert.equal(options.session,session);savedUser=fields;return [{...fields,_id:'000000000000000000000001'}];});
  context.mock.method(Store,'create',async(fields,options)=>{assert.equal(options.session,session);assert.equal(options.ordered,true);savedStores=fields;return fields;});
  try{
    let status,result;await register({body:{name:'Owner',email:'OWNER@EXAMPLE.COM',password:' StrongPass@123 ',shopTypes:SHOP_TYPES}},
      {status(value){status=value;return this},json(value){result=value}},error=>assert.fail(error));
    assert.equal(status,201);assert.equal(typeof result.token,'string');assert.equal(savedUser.password,' StrongPass@123 ');
    assert.equal(savedUser.email,'owner@example.com');assert.equal(savedUser.shopType,'MEDICAL');assert.equal(savedStores.length,4);
    assert.ok(savedStores.every(store=>store.createdBy===result.user._id));
  }finally{if(secret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=secret;}
});
