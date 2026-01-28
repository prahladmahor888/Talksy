class Matchmaker {
    constructor() {
        this.queue = [];
        this.users = new Map(); // socketId -> userState
    }

    addUser(socketId) {
        this.users.set(socketId, {
            id: socketId,
            partner: null,
            state: 'idle', // idle, waiting, matched
            gender: 'any',
            preference: 'any',
            name: 'Stranger',
            city: 'Unknown',
            country: 'Unknown'
        });
    }

    getUser(socketId) {
        return this.users.get(socketId);
    }

    removeUser(socketId) {
        const user = this.users.get(socketId);
        if (!user) return null;

        // Remove from queue
        this.queue = this.queue.filter(id => id !== socketId);

        // Notify partner if matched
        if (user.partner) {
            const partner = this.users.get(user.partner);
            if (partner) {
                partner.partner = null;
                partner.state = 'idle';
                return { disconnectedPeer: socketId, remainingPartner: partner.id };
            }
        }

        this.users.delete(socketId);
        return null;
    }

    addToQueue(socketId, gender = 'any', preference = 'any', name = 'Stranger', city = 'Unknown', country = 'Unknown') {
        const user = this.users.get(socketId);
        if (!user) return;

        if (user.state === 'waiting') return;

        user.state = 'waiting';
        user.gender = gender;
        user.preference = preference;
        user.name = name;
        user.city = city;
        user.country = country;
        user.partner = null;

        this.queue.push(socketId);
        return this.tryMatch();
    }

    tryMatch() {
        if (this.queue.length < 2) return null;

        // Simple matchmaking: Find the first compatible pair
        // We iterate to find a match for anyone in the queue, prioritizing strictly FIFO for the first user
        // But if the first user can't match, we shouldn't block others (though for simplicity, maybe we scan all)

        for (let i = 0; i < this.queue.length; i++) {
            const user1Id = this.queue[i];
            const user1 = this.users.get(user1Id);

            if (!user1) {
                this.queue.splice(i, 1);
                i--;
                continue;
            }

            for (let j = i + 1; j < this.queue.length; j++) {
                const user2Id = this.queue[j];
                const user2 = this.users.get(user2Id);

                if (!user2) {
                    this.queue.splice(j, 1);
                    j--;
                    continue;
                }

                if (this.isMatch(user1, user2)) {
                    // Remove both from queue
                    this.queue.splice(j, 1); // Remove higher index first
                    this.queue.splice(i, 1);

                    user1.state = 'matched';
                    user2.state = 'matched';
                    user1.partner = user2Id;
                    user2.partner = user1Id;

                    return { user1: user1Id, user2: user2Id };
                }
            }
        }

        return null;
    }

    isMatch(user1, user2) {
        // User 1 must be satisfied with User 2
        const match1 = user1.preference === 'any' || user1.preference === user2.gender;
        // User 2 must be satisfied with User 1
        const match2 = user2.preference === 'any' || user2.preference === user1.gender;

        return match1 && match2;
    }

    getPartner(socketId) {
        const user = this.users.get(socketId);
        return user ? user.partner : null;
    }
}

module.exports = new Matchmaker();
