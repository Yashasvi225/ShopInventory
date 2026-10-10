// Read-only preservation check against the protected pre-backfill snapshot.
require('dotenv').config({quiet:true});
const mongoose=require('mongoose');
const {readBackup,hash,localPath}=require('./backup');
const migration=require('./stores');
const scoped=new Set(['products','suppliers','sales','stocktransactions','expiryalerts']);
async function verify(){
  const file=process.argv[2];if(!file)throw new Error('Backup path required');
  const saved=readBackup(localPath(file));
  await mongoose.connect(process.env.MONGO_URI,{autoIndex:false,serverSelectionTimeoutMS:10000});
  try{
    const client=mongoose.connection.getClient(),db=client.db();if(saved.data.database!==db.databaseName)throw new Error('Wrong verification database');
    await migration.verifyApplied(client);let untouched=0,scopedRecords=0;
    for(const collection of saved.data.collections){
      if(collection.name==='stores')continue;
      const actual=await db.collection(collection.name).find({}).sort({_id:1}).toArray();
      if(actual.length!==collection.documents.length)throw new Error('Original collection count changed');
      for(let i=0;i<actual.length;i++){
        const copy={...actual[i]};if(scoped.has(collection.name)){if(!copy.store)throw new Error('Missing scope');delete copy.store;scopedRecords++;}else untouched++;
        if(hash(copy)!==hash(collection.documents[i]))throw new Error('Original field/identity changed');
      }
    }
    const stores=await db.collection('stores').find({}).toArray();
    const audit=await db.collection('storemigrations').findOne({_id:'owned-stores-v1',state:'APPLIED'});
    if(!audit||audit.sha256!==saved.sha256||stores.length!==audit.stores.length)throw new Error('Backfill audit mismatch');
    const result={verified:true,unchangedOriginalDocuments:untouched,onlyStoreAdded:scopedRecords,stores:stores.length,users:await db.collection('users').countDocuments({})};
    console.log(JSON.stringify(result,null,2));
  }finally{await mongoose.disconnect();}
}
verify().catch(()=>{console.error('Store preservation verification failed; credentials and document values withheld.');process.exitCode=1;});
