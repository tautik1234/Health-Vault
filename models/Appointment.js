const mongoose = require('mongoose');
const { encryptField, decryptField } = require('../lib/crypto');
const Counter=require('./Counter');

const apptSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.String, ref: 'User', required: true },
  appointmentId: {type:Number,unique:true},
  doctorName: { type: String, required: true },
  datetime: { type: String, required: true },
  notes: { type: String },
  status: { type: String, enum: ['scheduled','done','cancelled'], default: 'scheduled' }
});

apptSchema.pre('save', async function(next)
    {
        if(!this.appointmentId) {
            const counter=await Counter.findByIdAndUpdate(
                {_id: 'appointment_id'},
                {$inc:{seq:1}},
                {new:true,upsert:true}
            );
            this.appointmentId=counter.seq;
        }
    }
);

apptSchema.pre('save', function(next) {
  if (this.isModified('notes') && this.notes) {
    this.notes = encryptField(this.notes);
  }
  next();
});

apptSchema.methods.toDecrypted = function() {
  const obj = this.toObject();
  obj.notes = decryptField(obj.notes);
  return obj;
};

module.exports = mongoose.model('Appointment', apptSchema);
