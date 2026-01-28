require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const { Server } = require('socket.io');
const socketHandler = require('./socket');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// Middleware
app.use(helmet({
    contentSecurityPolicy: false // Disabled for simplicity in dev (videos/WebRTC)
}));
app.use(compression());
app.use(morgan('dev'));
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

const User = require('./models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const auth = require('./middleware/auth');

// Auth Routes
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ username, email, password: hashedPassword });
        await user.save();

        const payload = { user: { id: user.id } };
        jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' }, (err, token) => {
            if (err) throw err;
            res.status(201).json({ token, message: 'User registered successfully' });
        });
    } catch (err) {
        console.error(err);
        res.status(400).json({ error: 'Username or Email already exists' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ error: 'Invalid credentials' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

        const payload = { user: { id: user.id } };
        jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' }, (err, token) => {
            if (err) throw err;
            res.json({
                token,
                message: 'Login successful',
                user: {
                    id: user._id,
                    username: user.username,
                    email: user.email,
                    profile: user.profile
                }
            });
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Profile Routes (Protected)
app.get('/api/profile', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.put('/api/profile', auth, async (req, res) => {
    try {
        const { name, city, country, gender, lookingFor } = req.body;
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (name) user.profile.name = name;
        if (city) user.profile.city = city;
        if (country) user.profile.country = country;
        if (gender) user.profile.gender = gender;
        if (lookingFor) user.profile.lookingFor = lookingFor;

        await user.save();
        res.json({ message: 'Profile updated', profile: user.profile });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

const MatchSession = require('./models/MatchSession');

// --- Stateless Signaling (Polling) Routes for Vercel ---

// 1. Join Queue / Heartbeat
app.post('/api/queue/join', async (req, res) => {
    try {
        const { socketId, name, city, country, gender, preference } = req.body;

        // Upsert session
        let session = await MatchSession.findOne({ socketId });
        if (!session) {
            session = new MatchSession({ socketId, name, city, country, gender, preference, state: 'waiting' });
        } else {
            session.lastActive = new Date();
            session.name = name;
            session.city = city;
            session.country = country;
            session.gender = gender;
            session.preference = preference;
            if (session.state === 'idle') session.state = 'waiting';
        }
        await session.save();

        // Try Match
        const match = await findMatch(session);
        if (match) {
            // If we found a match immediately (we are the 2nd person)
            return res.json({ status: 'matched', data: match });
        }

        res.json({ status: 'waiting' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// 2. Poll for updates (Inbox)
app.get('/api/queue/poll/:socketId', async (req, res) => {
    try {
        const { socketId } = req.params;
        const session = await MatchSession.findOne({ socketId });

        if (!session) return res.status(404).json({ error: 'Session expired' });

        // Update heartbeat
        session.lastActive = new Date();

        const messages = session.inbox || [];
        if (messages.length > 0) {
            // Clear inbox after reading
            session.inbox = [];
        }
        await session.save();

        res.json({ messages, state: session.state, partnerId: session.partnerId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// 3. Send Signal (Offer/Answer/ICE/Message)
app.post('/api/queue/signal', async (req, res) => {
    try {
        const { from, to, type, payload } = req.body;

        const partnerSession = await MatchSession.findOne({ socketId: to });
        if (!partnerSession) return res.status(404).json({ error: 'Partner gone' });

        partnerSession.inbox.push({ type, payload });
        await partnerSession.save();

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// 4. Leave / Skip
app.post('/api/queue/leave', async (req, res) => {
    try {
        const { socketId } = req.body;
        const session = await MatchSession.findOne({ socketId });

        if (session && session.partnerId) {
            // Notify partner
            const partner = await MatchSession.findOne({ socketId: session.partnerId });
            if (partner) {
                partner.inbox.push({ type: 'partner_left', payload: {} });
                partner.partnerId = null;
                partner.state = 'idle';
                await partner.save();
            }
        }

        if (session) {
            session.partnerId = null;
            session.state = 'idle';
            await session.save();
        }

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});


// Helper: Database Matchmaker
async function findMatch(userSession) {
    if (userSession.state !== 'waiting') return null;

    // Find someone else waiting
    const query = {
        state: 'waiting',
        socketId: { $ne: userSession.socketId },
        lastActive: { $gt: new Date(Date.now() - 15000) } // Active in last 15s
    };

    if (userSession.preference !== 'any') {
        query.gender = userSession.preference;
    }

    const partner = await MatchSession.findOne(query);

    if (partner) {
        // Check mutual preference
        if (partner.preference !== 'any' && partner.preference !== userSession.gender) {
            return null;
        }

        // Link them
        userSession.state = 'matched';
        userSession.partnerId = partner.socketId;

        partner.state = 'matched';
        partner.partnerId = userSession.socketId;

        // Notify partner via inbox (Partner will see this on next poll)
        partner.inbox.push({
            type: 'matched',
            payload: {
                initiator: false,
                partner: { id: userSession.socketId, name: userSession.name, city: userSession.city, country: userSession.country }
            }
        });
        await partner.save();
        await userSession.save();

        // Return match data for the current user (Immediate response)
        return {
            initiator: true,
            partner: { id: partner.socketId, name: partner.name, city: partner.city, country: partner.country }
        };
    }
    return null;
}

// Serve Actions
app.use(express.static(path.join(__dirname, '../client')));

// Socket
io.on('connection', (socket) => {
    socketHandler(io, socket);
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
    server.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

module.exports = app;
