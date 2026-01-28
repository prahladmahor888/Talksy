const matchmaker = require('./matchmaker');

module.exports = (io, socket) => {
    console.log(`User connected: ${socket.id}`);
    matchmaker.addUser(socket.id);

    // User wants to start a chat
    socket.on('start_chat', (data) => {
        const gender = data?.gender || 'any';
        const preference = data?.preference || 'any';
        const name = data?.name || 'Stranger';
        const city = data?.city || 'Unknown';
        const country = data?.country || 'Unknown';

        const match = matchmaker.addToQueue(socket.id, gender, preference, name, city, country);

        if (match) {
            const u1 = matchmaker.getUser(match.user1);
            const u2 = matchmaker.getUser(match.user2);

            io.to(match.user1).emit('matched', {
                initiator: true,
                partner: { name: u2.name, city: u2.city, country: u2.country }
            });
            io.to(match.user2).emit('matched', {
                initiator: false,
                partner: { name: u1.name, city: u1.city, country: u1.country }
            });
        } else {
            socket.emit('waiting');
        }
    });

    // Text Chat
    socket.on('message', (msg) => {
        const partnerId = matchmaker.getPartner(socket.id);
        if (partnerId) {
            io.to(partnerId).emit('message', { sender: 'partner', text: msg });
        }
    });

    // WebRTC Signaling
    socket.on('offer', (payload) => {
        const partnerId = matchmaker.getPartner(socket.id);
        if (partnerId) {
            io.to(partnerId).emit('offer', payload);
        }
    });

    socket.on('answer', (payload) => {
        const partnerId = matchmaker.getPartner(socket.id);
        if (partnerId) {
            io.to(partnerId).emit('answer', payload);
        }
    });

    socket.on('ice-candidate', (payload) => {
        const partnerId = matchmaker.getPartner(socket.id);
        if (partnerId) {
            io.to(partnerId).emit('ice-candidate', payload);
        }
    });

    // Handle skip
    socket.on('next', (data) => {
        const gender = data?.gender || 'any';
        const preference = data?.preference || 'any';
        const name = data?.name || 'Stranger';
        const city = data?.city || 'Unknown';
        const country = data?.country || 'Unknown';

        const partnerId = matchmaker.getPartner(socket.id);
        if (partnerId) {
            io.to(partnerId).emit('partner_left');
            // Force partner to re-queue or show state
            // matchmaker.addToQueue(partnerId); // Depends on UX. Let's let client decide.
            // Usually client receives 'partner_left' and auto-searches or waits.
        }

        // Reset current user state internally without full remove
        // Use matchmaker helper if we had one, or just re-add
        matchmaker.removeUser(socket.id); // Clear current state
        matchmaker.addUser(socket.id);    // Re-add user fresh

        const match = matchmaker.addToQueue(socket.id, gender, preference, name, city, country);
        if (match) {
            const u1 = matchmaker.getUser(match.user1);
            const u2 = matchmaker.getUser(match.user2);

            io.to(match.user1).emit('matched', {
                initiator: true,
                partner: { id: match.user2, name: u2.name, city: u2.city, country: u2.country }
            });
            io.to(match.user2).emit('matched', {
                initiator: false,
                partner: { id: match.user1, name: u1.name, city: u1.city, country: u1.country }
            });
        } else {
            socket.emit('waiting');
        }
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        const result = matchmaker.removeUser(socket.id);
        if (result && result.remainingPartner) {
            io.to(result.remainingPartner).emit('partner_left');
        }
    });
};
