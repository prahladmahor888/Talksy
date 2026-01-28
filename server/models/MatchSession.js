const mongoose = require('mongoose');

const matchSessionSchema = new mongoose.Schema({
    socketId: { type: String, required: true, unique: true }, // Using a generated UUID as "socketId"
    state: { type: String, enum: ['idle', 'waiting', 'matched'], default: 'idle' },

    // User Profile Snapshot
    name: { type: String, default: 'Stranger' },
    city: { type: String, default: 'Unknown' },
    country: { type: String, default: 'Unknown' },
    gender: { type: String, default: 'any' },
    preference: { type: String, default: 'any' },

    // Match Info
    partnerId: { type: String, default: null },

    // Serverless Signaling/Messaging Inbox
    // Clients poll this array and clear it after reading
    inbox: [{
        type: { type: String }, // 'matched', 'offer', 'answer', 'ice-candidate', 'message', 'partner_left'
        payload: { type: mongoose.Schema.Types.Mixed },
        createdAt: { type: Date, default: Date.now }
    }],

    lastActive: { type: Date, default: Date.now } // For cleanup
});

// Auto-delete stale sessions after 2 minutes of inactivity
matchSessionSchema.index({ lastActive: 1 }, { expireAfterSeconds: 120 });

module.exports = mongoose.model('MatchSession', matchSessionSchema);
