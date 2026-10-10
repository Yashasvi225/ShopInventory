const {test}=require('node:test');const assert=require('node:assert/strict');
const {clean}=require('../migrations/demoTransfer');
test('Consolidation removes seeded presentation labels while preserving clothing variant details and ordinary fields',()=>{
  assert.deepEqual(clean('products',{name:'[DEMO] T-shirts',sku:'DEMO-CLOTHING-01',description:'DEMO only. Sales pattern: FAST. Variant: size S, navy. Synthetic history for the existing application calculations.'}),{name:'T-shirts',sku:'CLOTHING-01',description:'Variant: size S, navy.'});
  assert.deepEqual(clean('products',{name:'Customer product',sku:'CUSTOM-1',description:'Recorded product description'}),{name:'Customer product',sku:'CUSTOM-1',description:'Recorded product description'});
  assert.deepEqual(clean('suppliers',{name:'[DEMO] MEDICAL Supplier 1',company:'Demo supplier 1',email:'demo-supplier-1@example.invalid',address:'Demo address - sample only'}),{name:'Medical Supplier 1',company:'',email:'',address:''});
  assert.deepEqual(clean('stocktransactions',{reason:'Sale 012345678901234567890123'}),{});
});
