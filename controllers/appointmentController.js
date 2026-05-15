const Appointment=require('../models/Appointment')
const User=require('../models/User')

exports.createAppointment =async(req,res) => {
    try {
        const a=new Appointment(req.body);
        await a.save();
        res.status(201).send({id:a._id});
        }
        catch(err) {
            return res.status(500).send({error:err.message});
        }
};

exports.fetchAppointments = async(req,res) => {
    try {
            const appts=await Appointment.find({user: req.params.username});
            const deappts=appts.map(appt => appt.toDecrypted());
            res.json(deappts);
        }
            catch(err) {
                return res.status(500).send({error: err.message});
            }
};

/**
 * 
 * app.post('/appointment',async(req,res) => {
 });
 * 
 */