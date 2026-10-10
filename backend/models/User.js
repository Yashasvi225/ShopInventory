const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { SHOP_TYPES } = require('../domain/storeTypes');
const userSchema = new mongoose.Schema({
  name:{type:String,required:true,trim:true}, email:{type:String,required:true,unique:true,lowercase:true,trim:true},
  password:{type:String,required:true,minlength:6,select:false}, shopType:{type:String,enum:[...SHOP_TYPES,null],default:null},
  shopName:{type:String,trim:true,default:''}, createdAt:{type:Date,default:Date.now}
},{versionKey:false});
userSchema.pre('save',async function(){if(this.isModified('password'))this.password=await bcrypt.hash(this.password,12)});
userSchema.methods.comparePassword=function(candidate){return bcrypt.compare(candidate,this.password)};
userSchema.methods.toJSON=function(){const o=this.toObject();delete o.password;return o};
module.exports=mongoose.model('User',userSchema);
