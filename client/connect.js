const socket = io();

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
}

// --- Initialization ---
async function init() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        startSearch();
    } catch (err) {
        alert("Camera/Microphone access required!");
        console.error(err);
        window.location.href = '/index.html';
    }
}

// Start immediately
init();

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

    chatMessages.innerHTML = '<div class="system-msg">New Chat Started</div>';

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


// --- Socket Events ---
socket.on('waiting', () => {
    setStatus('Waiting for someone to join...');
});

socket.on('matched', async ({ initiator, partner }) => {
    setStatus('Found a match! Connecting...');

    // Show friend button if logged in
    const addFriendBtn = document.getElementById('addFriendBtn');
    if (localStorage.getItem('talksy_user')) {
        addFriendBtn.style.display = 'block';
        addFriendBtn.disabled = false;

        // Save partner ID if available
        if (partner && partner.id) {
            addFriendBtn.onclick = () => {
                const myUser = JSON.parse(localStorage.getItem('talksy_user'));
                socket.emit('friend_request', {
                    from: myUser.id,
                    to: partner.id
                });
                alert('Friend request sent!');
                addFriendBtn.disabled = true;
            };
        }
    } else {
        addFriendBtn.style.display = 'none';
    }

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

socket.on('friend_request_received', () => {
    alert("You received a friend request! (Check Profile to accept - TODO)");
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
