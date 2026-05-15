const HealthRecord=require("../models/HealthRecord")

exports.createRecord = async(requestAnimationFrame,res) => {
    try {
        const rec = new HealthRecord(req.body);
        await rec.save();
        res.status(201).send({ message: `${rec._id} registered!` });
    } 
    catch (err) {
        res.status(400).send({ error: err.message });
    }
};

exports.fetchRecord = async(req,res) => {
    try {
        const recid=await HealthRecord.findOne({recordId: req.params.recordId});
        if(!recid) return res.status(404).send({error: 'ID not found'});
        res.send(recid);
    }
    catch(err) {
        res.status(500).send({error: err.message});
    }
};

exports.deleteRecord= async(req,res) => {
    try{
        const rec=await HealthRecord.findOneAndDelete({recordId:req.params.recordId});
        if(!rec) return res.status(404).send({error: 'ID not found'});
        res.send(rec);
    }
    catch(err) {
        res.status(500).send({error: err.message});
    }
};