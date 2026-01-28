const socket = io();

// DOM Elements
const entryModal = document.getElementById('entryModal');
const mainApp = document.getElementById('mainApp');
const enterBtn = document.getElementById('enterBtn');
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

// Selection State
const nameInput = document.getElementById('nameInput');
const cityInput = document.getElementById('cityInput');
const countryInput = document.getElementById('countryInput');
const partnerInfo = document.getElementById('partnerInfo');
const partnerName = document.getElementById('partnerName');
const partnerLocation = document.getElementById('partnerLocation');

let selectedGender = 'male';
let selectedInterest = 'any';
let myProfile = { name: '', city: '', country: '' };

// WebRTC State
let localStream;
let peerConnection;
const config = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ]
};
let isConnected = false;

// --- UI Interaction ---

// Gender Selection Logic
document.querySelectorAll('.gender-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.gender-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedGender = btn.dataset.value;
    });
});

document.querySelectorAll('.interest-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.interest-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedInterest = btn.dataset.value;
    });
});

// Enter Button
enterBtn.addEventListener('click', async () => {
    const name = nameInput.value.trim() || 'Stranger';
    const city = cityInput.value.trim() || 'Unknown';
    const country = countryInput.value.trim() || 'Unknown';

    myProfile = { name, city, country };

    const success = await startCamera();
    if (success) {
        entryModal.classList.add('hidden');
        entryModal.style.display = 'none'; // Ensure it's gone
        mainApp.classList.remove('hidden');
        startSearch();
    }
});

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
        partnerInfo.classList.add('hidden'); // Hide info when searching
    } else {
        statusOverlay.classList.add('hidden');
    }
}

function updateControls(connected) {
    isConnected = connected;
    chatInput.disabled = !connected;
    sendBtn.disabled = !connected;
    nextBtn.disabled = false; // Always allow skip
    // nextBtn functionality alternates between "Skip" and "New" functionality effectively
}

// --- Media ---
async function startCamera() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        return true;
    } catch (err) {
        alert("Camera/Microphone access required!");
        console.error(err);
        return false;
    }
}

// Controls
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

        // Update Local UI
        const localCard = document.querySelector('.video-card.local');
        if (videoTrack.enabled) {
            localCard.classList.remove('camera-off');
        } else {
            localCard.classList.add('camera-off');
        }
    }
});

stopBtn.addEventListener('click', () => {
    // Return to home essentially
    location.reload();
});

nextBtn.addEventListener('click', () => {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    remoteVideo.srcObject = null;
    updateControls(false);
    setStatus('Skipping... Searching for new partner...');

    // Clear Chat
    chatMessages.innerHTML = '<div class="system-msg">New Chat Started</div>';

    socket.emit('next', {
        gender: selectedGender,
        preference: selectedInterest,
        name: myProfile.name,
        city: myProfile.city,
        country: myProfile.country
    });
});

// Chat
function sendMessage() {
    const text = chatInput.value.trim();
    if (text && isConnected) {
        addMessage(text, 'you');
        socket.emit('message', text);
        chatInput.value = '';
    }
}

// Keyboard Shortcuts
document.addEventListener('keyup', (e) => {
    if (e.key === 'Escape' || e.key === 'ArrowRight') {
        if (!nextBtn.disabled && !entryModal.classList.contains('hidden')) {
            nextBtn.click();
        }
    }
});

// Swipe Shortcuts (Mobile)
const videoGrid = document.querySelector('.video-grid');
let touchStartX = 0;
let touchEndX = 0;

videoGrid.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
});

videoGrid.addEventListener('touchend', e => {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
});

function handleSwipe() {
    // Swipe Left to Skip (Drag from right to left)
    if (touchEndX < touchStartX - 50) {
        if (!nextBtn.disabled && !entryModal.classList.contains('hidden')) {
            // Optional: Animation feedback?
            nextBtn.click();
        }
    }
}

sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
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
        country: myProfile.country
    });
}

function createPeerConnection() {
    if (peerConnection) peerConnection.close();
    peerConnection = new RTCPeerConnection(config);

    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

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

// Socket Events
socket.on('waiting', () => {
    setStatus('Waiting for someone to join...');
});

socket.on('matched', async ({ initiator, partner }) => {
    setStatus('Found a match! Connecting...');

    // Update Partner Info
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

    // Auto re-search handled by server logic or we can manual trigger?
    // Current socket.js 'next' logic handles re-queueing self. 
    // But 'partner_left' means *they* left. WE are still here.
    // We should probably emit 'start_chat' again to re-queue ourselves explicitly if we want auto-next.
    // Or users can click Next. 

    // Let's Auto-Next for seamless experience:
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
