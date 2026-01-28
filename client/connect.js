// detect if we are on localhost or strict ssl
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

// --- Polling Manager (Simulates Socket.io for Serverless) ---
class PollManager {
    constructor() {
        this.socketId = 'user_' + Math.floor(Math.random() * 10000000);
        this.pollInterval = null;
        this.listeners = {};
        this.partnerId = null;
    }

    on(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    }

    emit(event, data) {
        // Map abstract events to API calls
        if (event === 'start_chat') {
            this.joinQueue(data);
        } else if (event === 'next') {
            this.leaveQueue(() => this.joinQueue(data));
        } else if (['offer', 'answer', 'ice-candidate', 'message'].includes(event)) {
            this.sendSignal(event, data);
        } else if (event === 'friend_request') {
            // Not implemented in poll mode yet
            alert('Friend requests not supported in serverless mode yet.');
        }
    }

    // --- API Calls ---
    async joinQueue(data) {
        try {
            const res = await fetch('/api/queue/join', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...data, socketId: this.socketId })
            });
            const result = await res.json();

            if (result.status === 'matched') {
                this.partnerId = result.data.partner.id;
                this.trigger('matched', result.data);
            } else {
                this.trigger('waiting');
            }
            this.startPolling();
        } catch (e) {
            console.error(e);
        }
    }

    async leaveQueue(callback) {
        try {
            await fetch('/api/queue/leave', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ socketId: this.socketId })
            });
            this.partnerId = null;
            if (callback) callback();
        } catch (e) { console.error(e); }
    }

    async sendSignal(type, payload) {
        if (!this.partnerId) return;
        try {
            await fetch('/api/queue/signal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    from: this.socketId,
                    to: this.partnerId,
                    type,
                    payload: type === 'message' ? { text: payload } : payload
                })
            });
        } catch (e) { console.error(e); }
    }

    startPolling() {
        if (this.pollInterval) clearInterval(this.pollInterval);
        this.pollInterval = setInterval(async () => {
            try {
                const res = await fetch(`/api/queue/poll/${this.socketId}`);
                if (!res.ok) return;
                const data = await res.json();

                // Sync Partner ID if not set
                if (data.partnerId && !this.partnerId) {
                    this.partnerId = data.partnerId;
                }

                // Process Inbox
                if (data.messages && data.messages.length > 0) {
                    data.messages.forEach(msg => {
                        if (msg.type === 'matched') {
                            this.partnerId = msg.payload.partner.socketId || msg.payload.partner.id;
                            this.trigger('matched', msg.payload);
                        } else if (msg.type === 'message') {
                            this.trigger('message', msg.payload); // payload has {text: '...'}
                        } else if (msg.type === 'partner_left') {
                            this.trigger('partner_left');
                        } else {
                            // Signaling
                            this.trigger(msg.type, msg.payload);
                        }
                    });
                }
            } catch (e) { console.error('Poll error', e); }
        }, 1000); // Poll every 1 second
    }

    trigger(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => cb(data));
        }
    }
}

// Instantiate Polling Manager (Replaces Socket.io)
const socket = new PollManager();


// DOM Elements
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const statusOverlay = document.getElementById('statusOverlay');
const statusText = document.getElementById('statusText');
const nextBtn = document.getElementById('nextBtn');
const stopBtn = document.getElementById('stopBtn');
const toggleMicBtn = document.getElementById('toggleMicBtn');
const toggleCamBtn = document.getElementById('toggleCamBtn');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const chatMessages = document.getElementById('chatMessages');

// Partner Info Elements
const partnerInfo = document.getElementById('partnerInfo');
const partnerName = document.getElementById('partnerName');
const partnerLocation = document.getElementById('partnerLocation');

// Profile Data from Session Storage
const myProfile = JSON.parse(sessionStorage.getItem('talksy_profile')) || { name: 'Stranger', city: 'Unknown', country: 'Unknown' };
const selectedGender = sessionStorage.getItem('talksy_gender') || 'any';
const selectedInterest = sessionStorage.getItem('talksy_interest') || 'any';

// Redirect if no profile
if (!sessionStorage.getItem('talksy_profile')) {
    window.location.href = '/index.html';
}

// WebRTC State
let localStream;
let peerConnection;
const config = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ]
};
let isConnected = false;

// --- Helper Functions ---
function addMessage(text, type) {
    const div = document.createElement('div');
    div.classList.add('message', type); // 'you', 'partner', 'system'
    div.innerText = text;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function setStatus(text, showOverlay = true) {
    statusText.innerText = text;
    if (showOverlay) {
        statusOverlay.classList.remove('hidden');
        partnerInfo.classList.add('hidden');
    } else {
        statusOverlay.classList.add('hidden');
    }
}

function updateControls(connected) {
    isConnected = connected;
    chatInput.disabled = !connected;
    sendBtn.disabled = !connected;
    nextBtn.disabled = false;

    // Reset remote video if disconnected
    if (!connected) {
        remoteVideo.srcObject = null;
    }
}

// --- Initialization ---
let hasPermissions = false;

async function requestPermissions() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        hasPermissions = true;

        // Hide start overlay if I add one
        const startOverlay = document.getElementById('startOverlay');
        if (startOverlay) startOverlay.style.display = 'none';

        startSearch();
    } catch (err) {
        alert("Camera and Microphone access IS REQUIRED to use Talksy. Please allow access.");
        console.error(err);
        // window.location.href = '/index.html'; // Don't redirect immediately, let them try again
    }
}

// Don't auto-start. Wait for user.
document.addEventListener('DOMContentLoaded', () => {
    // Check if we have a start button (I will add this to HTML)
    const startBtn = document.getElementById('enableCameraBtn');
    if (startBtn) {
        startBtn.addEventListener('click', requestPermissions);
    } else {
        // Fallback for logic consistency
        requestPermissions();
    }
});

// --- Core Logic ---

function startSearch() {
    setStatus('Looking for a match...');
    updateControls(false);
    socket.emit('start_chat', {
        gender: selectedGender,
        preference: selectedInterest,
        name: myProfile.name,
        city: myProfile.city,
        country: myProfile.country,
        interests: sessionStorage.getItem('talksy_interests_list') || ''
    });
}

function createPeerConnection() {
    if (peerConnection) peerConnection.close();
    peerConnection = new RTCPeerConnection(config);

    if (localStream) {
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    }

    peerConnection.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
        setStatus('', false);
        updateControls(true);
        addMessage('You are connected to a stranger.', 'system');
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', event.candidate);
        }
    };
}

// --- Controls ---

toggleMicBtn.addEventListener('click', () => {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        toggleMicBtn.classList.toggle('active-off', !audioTrack.enabled);
        toggleMicBtn.innerHTML = audioTrack.enabled ? '<i class="fa-solid fa-microphone"></i>' : '<i class="fa-solid fa-microphone-slash"></i>';
    }
});

toggleCamBtn.addEventListener('click', () => {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        toggleCamBtn.classList.toggle('active-off', !videoTrack.enabled);
        toggleCamBtn.innerHTML = videoTrack.enabled ? '<i class="fa-solid fa-video"></i>' : '<i class="fa-solid fa-video-slash"></i>';

        const localBox = document.querySelector('.video-box.local-box');
        if (videoTrack.enabled) {
            localBox.classList.remove('camera-off');
        } else {
            localBox.classList.add('camera-off');
        }
    }
});

stopBtn.addEventListener('click', () => {
    window.location.href = '/index.html';
});

nextBtn.addEventListener('click', () => {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    remoteVideo.srcObject = null;
    updateControls(false);
    setStatus('Skipping... Searching for new partner...');

    chatMessages.innerHTML = '';
    addMessage('New Chat Started', 'system');

    socket.emit('next', {
        gender: selectedGender,
        preference: selectedInterest,
        name: myProfile.name,
        city: myProfile.city,
        country: myProfile.country,
        interests: sessionStorage.getItem('talksy_interests_list') || ''
    });
});

// --- Chat ---
function sendMessage() {
    const text = chatInput.value.trim();
    if (text && isConnected) {
        addMessage(text, 'you');
        socket.emit('message', text);
        chatInput.value = '';
    }
}

sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// --- Shortcuts ---
document.addEventListener('keyup', (e) => {
    if (e.key === 'Escape' || e.key === 'ArrowRight') {
        if (!nextBtn.disabled) {
            nextBtn.click();
        }
    }
});

// Swipe
const videoGrid = document.querySelector('.split-video-container');
let touchStartX = 0;
let touchEndX = 0;

videoGrid.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
});

videoGrid.addEventListener('touchend', e => {
    touchEndX = e.changedTouches[0].screenX;
    if (touchEndX < touchStartX - 50) {
        if (!nextBtn.disabled) {
            nextBtn.click();
        }
    }
});


// --- Socket (Polling) Events ---
socket.on('waiting', () => {
    setStatus('Waiting for someone to join...');
});

socket.on('matched', async ({ initiator, partner }) => {
    setStatus('Found a match! Connecting...');

    if (partner) {
        partnerName.textContent = partner.name || 'Stranger';
        partnerLocation.innerHTML = `<i class="fa-solid fa-location-dot"></i> ${partner.city || 'Unknown'}, ${partner.country || 'Unknown'}`;
        partnerInfo.classList.remove('hidden');
    }

    createPeerConnection();

    if (initiator) {
        try {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            socket.emit('offer', offer);
        } catch (e) {
            console.error(e);
        }
    }
});

socket.on('offer', async (offer) => {
    if (!peerConnection) createPeerConnection();
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer', answer);
    } catch (e) {
        console.error(e);
    }
});

socket.on('answer', async (answer) => {
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (e) {
        console.error(e);
    }
});

socket.on('ice-candidate', async (candidate) => {
    try {
        if (peerConnection) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
    } catch (e) {
        console.error(e);
    }
});

socket.on('message', (data) => {
    addMessage(data.text, 'partner');
});

socket.on('partner_left', () => {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    remoteVideo.srcObject = null;
    updateControls(false);
    setStatus('Stranger disconnected. Searching...');
    addMessage('Stranger has disconnected.', 'system');

    setTimeout(() => {
        socket.emit('next', {
            gender: selectedGender,
            preference: selectedInterest,
            name: myProfile.name,
            city: myProfile.city,
            country: myProfile.country
        });
    }, 1500);
});
