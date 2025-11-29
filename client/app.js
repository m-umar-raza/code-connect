const socket = io();

// Global variables
let localStream;
let peers = {};
let roomId;
let userId;
let isAudioEnabled = true;
let isVideoEnabled = true;

// DOM elements
const homeScreen = document.getElementById('home-screen');
const videoScreen = document.getElementById('video-screen');
const roomInput = document.getElementById('room-input');
const joinBtn = document.getElementById('join-btn');
const createBtn = document.getElementById('create-btn');
const localVideo = document.getElementById('local-video');
const videoGrid = document.getElementById('video-grid');
const toggleAudioBtn = document.getElementById('toggle-audio');
const toggleVideoBtn = document.getElementById('toggle-video');
const toggleChatBtn = document.getElementById('toggle-chat');
const shareScreenBtn = document.getElementById('share-screen');
const leaveBtn = document.getElementById('leave-btn');
const chatPanel = document.getElementById('chat-panel');
const closeChatBtn = document.getElementById('close-chat-btn');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const copyCodeBtn = document.getElementById('copy-code-btn');
const roomIdDisplay = document.getElementById('room-id');

// ICE servers configuration (STUN/TURN)
const iceServers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Generate unique user ID
userId = 'user_' + Math.random().toString(36).substr(2, 9);

// Create new meeting
createBtn.addEventListener('click', () => {
    roomId = 'room_' + Math.random().toString(36).substr(2, 9);
    joinRoom();
});

// Join existing meeting
joinBtn.addEventListener('click', () => {
    roomId = roomInput.value.trim();
    if (roomId) {
        joinRoom();
    } else {
        alert('Please enter a room code');
    }
});

// Join room function
async function joinRoom() {
    try {
        // Get user media
        localStream = await navigator.mediaDevices.getUserMedia({
            video: { width: 1280, height: 720 },
            audio: true
        });

        localVideo.srcObject = localStream;

        // Switch screens
        homeScreen.classList.add('hidden');
        videoScreen.classList.remove('hidden');
        roomIdDisplay.textContent = roomId;

        // Join room via socket
        socket.emit('join-room', roomId, userId);

        // Listen for existing users
        socket.on('existing-users', (users) => {
            users.forEach(otherUserId => {
                connectToUser(otherUserId, true);
            });
        });

        // Listen for new users
        socket.on('user-connected', (otherUserId) => {
            console.log('User connected:', otherUserId);
        });

        // Handle WebRTC signaling
        socket.on('offer', async (data) => {
            await handleOffer(data);
        });

        socket.on('answer', async (data) => {
            await handleAnswer(data);
        });

        socket.on('ice-candidate', async (data) => {
            await handleIceCandidate(data);
        });

        // Handle user disconnection
        socket.on('user-disconnected', (otherUserId) => {
            if (peers[otherUserId]) {
                peers[otherUserId].close();
                delete peers[otherUserId];
                removeVideoElement(otherUserId);
            }
        });

        // Chat messages
        socket.on('chat-message', (data) => {
            addChatMessage(data);
        });

    } catch (error) {
        console.error('Error accessing media devices:', error);
        alert('Could not access camera/microphone. Please check permissions.');
    }
}

// Create peer connection
function createPeerConnection(otherUserId) {
    const peerConnection = new RTCPeerConnection(iceServers);

    // Add local stream tracks
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    // Handle incoming stream
    peerConnection.ontrack = (event) => {
        addVideoElement(otherUserId, event.streams[0]);
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                candidate: event.candidate,
                from: userId,
                to: otherUserId
            });
        }
    };

    peers[otherUserId] = peerConnection;
    return peerConnection;
}

// Connect to another user
async function connectToUser(otherUserId, isInitiator) {
    const peerConnection = createPeerConnection(otherUserId);

    if (isInitiator) {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        socket.emit('offer', {
            offer,
            from: userId,
            to: otherUserId
        });
    }
}

// Handle received offer
async function handleOffer(data) {
    const peerConnection = createPeerConnection(data.from);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    socket.emit('answer', {
        answer,
        from: userId,
        to: data.from
    });
}

// Handle received answer
async function handleAnswer(data) {
    const peerConnection = peers[data.from];
    if (peerConnection) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    }
}

// Handle ICE candidate
async function handleIceCandidate(data) {
    const peerConnection = peers[data.from];
    if (peerConnection) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
}

// Add video element for remote user
function addVideoElement(userId, stream) {
    // Check if video element already exists
    if (document.getElementById(`video-${userId}`)) {
        return;
    }

    const videoContainer = document.createElement('div');
    videoContainer.className = 'video-container';
    videoContainer.id = `container-${userId}`;

    const video = document.createElement('video');
    video.id = `video-${userId}`;
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;

    const label = document.createElement('div');
    label.className = 'video-label';
    label.textContent = userId.substr(0, 10);

    videoContainer.appendChild(video);
    videoContainer.appendChild(label);
    videoGrid.appendChild(videoContainer);
}

// Remove video element
function removeVideoElement(userId) {
    const container = document.getElementById(`container-${userId}`);
    if (container) {
        container.remove();
    }
}

// Toggle audio
toggleAudioBtn.addEventListener('click', () => {
    isAudioEnabled = !isAudioEnabled;
    localStream.getAudioTracks()[0].enabled = isAudioEnabled;
    toggleAudioBtn.classList.toggle('active');
    toggleAudioBtn.querySelector('.icon').textContent = isAudioEnabled ? '🎤' : '🔇';
});

// Toggle video
toggleVideoBtn.addEventListener('click', () => {
    isVideoEnabled = !isVideoEnabled;
    localStream.getVideoTracks()[0].enabled = isVideoEnabled;
    toggleVideoBtn.classList.toggle('active');
    toggleVideoBtn.querySelector('.icon').textContent = isVideoEnabled ? '📹' : '🚫';
});

// Toggle chat
toggleChatBtn.addEventListener('click', () => {
    chatPanel.classList.toggle('hidden');
});

closeChatBtn.addEventListener('click', () => {
    chatPanel.classList.add('hidden');
});

// Send chat message
sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

function sendMessage() {
    const message = chatInput.value.trim();
    if (message) {
        socket.emit('chat-message', message);
        chatInput.value = '';
    }
}

// Add chat message to UI
function addChatMessage(data) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message';
    
    const isOwn = data.userId === userId;
    messageDiv.classList.add(isOwn ? 'own-message' : 'other-message');

    const time = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    messageDiv.innerHTML = `
        <div class="message-header">
            <span class="message-user">${isOwn ? 'You' : data.userId.substr(0, 10)}</span>
            <span class="message-time">${time}</span>
        </div>
        <div class="message-text">${escapeHtml(data.message)}</div>
    `;

    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Share screen
shareScreenBtn.addEventListener('click', async () => {
    try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];

        // Replace video track in all peer connections
        Object.values(peers).forEach(peer => {
            const sender = peer.getSenders().find(s => s.track.kind === 'video');
            if (sender) {
                sender.replaceTrack(screenTrack);
            }
        });

        // Replace local video
        localVideo.srcObject = screenStream;

        // When screen sharing stops
        screenTrack.onended = () => {
            const videoTrack = localStream.getVideoTracks()[0];
            Object.values(peers).forEach(peer => {
                const sender = peer.getSenders().find(s => s.track.kind === 'video');
                if (sender) {
                    sender.replaceTrack(videoTrack);
                }
            });
            localVideo.srcObject = localStream;
        };

    } catch (error) {
        console.error('Error sharing screen:', error);
    }
});

// Copy meeting code
copyCodeBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(roomId).then(() => {
        const originalText = copyCodeBtn.textContent;
        copyCodeBtn.textContent = 'Copied!';
        setTimeout(() => {
            copyCodeBtn.textContent = originalText;
        }, 2000);
    });
});

// Leave call
leaveBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to leave the call?')) {
        leaveCall();
    }
});

function leaveCall() {
    // Stop all tracks
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }

    // Close all peer connections
    Object.values(peers).forEach(peer => peer.close());
    peers = {};

    // Disconnect socket
    socket.disconnect();

    // Reload page
    window.location.reload();
}
