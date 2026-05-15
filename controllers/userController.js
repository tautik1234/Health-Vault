const User=require("../models/User")

exports.registerUser = async(req,res) => {
    try {
     const { username, email, password } = req.body;
     const u = new User({ username, email, password });
     await u.save();
     res.status(201).send({ message: 'user created' });
    } 
    catch (err) {
     res.status(400).send({ error: err.message });
    }
};

exports.loginUser = async(req,res) => {
    const { email, password } = req.body;
    const user = await User.findOne({email});
    if (!user) return res.status(401).send({ error: 'invalid credentials' });
    const ok = await user.comparePassword(password);
    if (!ok) return res.status(401).send({ error: 'invalid credentials' });
    res.send({ message: 'ok', userId: user._id });
};