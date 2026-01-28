const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    profile: {
        name: { type: String, default: '' },
        city: { type: String, default: '' },
        country: { type: String, default: '' },
        gender: { type: String, default: 'any' },
        lookingFor: { type: String, default: 'any' }
    },
    friends: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        status: { type: String, enum: ['pending', 'accepted'], default: 'pending' }
    }],
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
