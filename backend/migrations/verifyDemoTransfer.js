const path=require('node:path');const mongoose=require('mongoose');
require('dotenv').config({path:path.join(__dirname,'../.env'),quiet:true});
const {readBackup,hash}=require('./backup');const {keyFor,verify}=require('./demoTransfer');
async function preservation(client,file,targetId){
  const {data,sha256}=readBackup(file),db=client.db();
  if(data.database!==db.databaseName)throw new Error('Backup database mismatch');
  const audit=await db.collection('inventorymigrations').findOne({_id:keyFor(targetId),state:'APPLIED'});
  if(!audit||audit.backupHash!==sha256)throw new Error('Applied audit does not match snapshot');
  await verify(db,audit);
  const affected=new Map(audit.records.map(r=>[`${r.collection}:${r.id}`,r]));
  const retired=new Set(audit.retired?audit.sources.flatMap(s=>[`users:${s.userId}`,`stores:${s.storeId}`]):[]);
  let unchanged=0,updated=0,consolidated=0,retiredDocuments=0;
  for(const collection of data.collections){
    const actual=new Map((await db.collection(collection.name).find().toArray()).map(d=>[String(d._id),d]));
    for(const original of collection.documents){
      const key=`${collection.name}:${original._id}`,entry=affected.get(key),current=actual.get(String(original._id));
      if(entry){
        if(hash(original)!==entry.beforeHash)throw new Error('Original snapshot/audit mismatch');
        if(entry.afterHash===null){if(current)throw new Error('Consolidated duplicate still exists');consolidated++;}
        else {if(!current||hash(current)!==entry.afterHash)throw new Error('Transferred values changed since audit');updated++;}
      }else if(retired.has(key)){if(current)throw new Error('Retired account/store still exists');retiredDocuments++;}
      else{if(!current||hash(current)!==hash(original))throw new Error('Unrelated original record changed');unchanged++;}
    }
  }
  return {verified:true,targetId:String(audit.targetId),unchangedOriginalDocuments:unchanged,transferredOrConsolidatedCanonicalRecords:updated,consolidatedDuplicateDocuments:consolidated,retiredAccountAndStoreDocuments:retiredDocuments,counts:audit.counts,sourceCounts:audit.sourceCounts,accountsRetired:audit.retired?audit.sources.length:0};
}
if(require.main===module)(async()=>{
  const [file,targetId]=process.argv.slice(2);if(!file||!mongoose.isValidObjectId(targetId))throw new Error('Backup path and verified target ID required');
  await mongoose.connect(process.env.MONGO_URI,{serverSelectionTimeoutMS:10000});
  try{console.log(JSON.stringify(await preservation(mongoose.connection.getClient(),file,targetId),null,2));}finally{await mongoose.disconnect();}
})().catch(e=>{console.error(e.name==='Error'&&!e.code?e.message:'Preservation verification failed; credentials withheld.');process.exitCode=1;});
module.exports={preservation};
