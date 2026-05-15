const mongoose = require('mongoose');
const { encryptField, decryptField } = require('../lib/crypto');
const Counter=require('./Counter');

const recordSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recordId: {type:Number,unique:true},
  recordDate: { type: Date, default: Date.now },
  diagnosis: { type: String },
  notes: { type: String },
  vitals: { type: String }
});

recordSchema.pre('save', async function(next)
    {
        if(!this.recordId) {
            const counter=await Counter.findByIdAndUpdate(
                {_id: 'record_id'},
                {$inc:{seq:1}},
                {new:true,upsert:true}
            );
            this.recordId=counter.seq;
        }
    }
);

recordSchema.pre('save', function(next) {
  if (this.isModified('diagnosis') && this.diagnosis) {
    this.diagnosis = encryptField(this.diagnosis);
  }
  if (this.isModified('notes') && this.notes) {
    this.notes = encryptField(this.notes);
  }
  if (this.isModified('vitals') && this.vitals) {
    this.vitals = encryptField(this.vitals);
  }
  next();
});

recordSchema.methods.toDecrypted = function() {
  const obj = this.toObject();
  obj.diagnosis = decryptField(obj.diagnosis);
  obj.notes = decryptField(obj.notes);
  obj.vitals = decryptField(obj.vitals);
  return obj;
};

module.exports = mongoose.model('HealthRecord', recordSchema);