const socket = io();

// Global variables
let localStream;
let peers = {};
let roomId;
let userId;
let userName = '';
let isAudioEnabled = true;
let isVideoEnabled = true;
let recognition;
let isCaptionsEnabled = false;
let finalTranscript = '';
let interimTranscript = '';
let activeCaptions = new Map(); // Track captions from all users
let captionTimeouts = new Map(); // Track timeouts for clearing captions
let participants = new Map(); // Track all participants {userId: {name, isAudioEnabled, isVideoEnabled}}
let currentChatMode = 'everyone'; // 'everyone' or 'private'
let privateRecipient = '';
let typingTimeout;
let audioContext;
let audioAnalyser;
let isSpeaking = false;

// DOM elements
const homeScreen = document.getElementById('home-screen');
const videoScreen = document.getElementById('video-screen');
const roomInput = document.getElementById('room-input');
const userNameInput = document.getElementById('user-name-input');
const joinBtn = document.getElementById('join-btn');
const createBtn = document.getElementById('create-btn');
const localVideo = document.getElementById('local-video');
const videoGrid = document.getElementById('video-grid');
const toggleAudioBtn = document.getElementById('toggle-audio');
const toggleVideoBtn = document.getElementById('toggle-video');
const toggleChatBtn = document.getElementById('toggle-chat');
const toggleParticipantsBtn = document.getElementById('toggle-participants');
const shareScreenBtn = document.getElementById('share-screen');
const leaveBtn = document.getElementById('leave-btn');
const chatPanel = document.getElementById('chat-panel');
const closeChatBtn = document.getElementById('close-chat-btn');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const copyCodeBtn = document.getElementById('copy-code-btn');
const roomIdDisplay = document.getElementById('room-id');
const toggleCaptionsBtn = document.getElementById('toggle-captions');
const captionsPanel = document.getElementById('captions-panel');
const captionsText = document.getElementById('captions-text');
const participantsPanel = document.getElementById('participants-panel');
const closeParticipantsBtn = document.getElementById('close-participants-btn');
const participantsList = document.getElementById('participants-list');
const participantCount = document.getElementById('participant-count');
const everyoneBtn = document.getElementById('everyone-btn');
const privateBtn = document.getElementById('private-btn');
const privateChatSelector = document.getElementById('private-chat-selector');
const privateRecipientSelect = document.getElementById('private-recipient-select');
const typingIndicator = document.getElementById('typing-indicator');
const typingUser = document.getElementById('typing-user');
const currentUserNameDisplay = document.getElementById('current-user-name');
const userInfoBadge = document.getElementById('user-info');

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
    userName = userNameInput.value.trim() || 'Guest';
    roomId = 'room_' + Math.random().toString(36).substr(2, 9);
    joinRoom();
});

// Join existing meeting
joinBtn.addEventListener('click', () => {
    userName = userNameInput.value.trim() || 'Guest';
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
        
        // Setup audio monitoring for speaking indicator
        setupAudioMonitoring();

        // Switch screens
        homeScreen.classList.add('hidden');
        videoScreen.classList.remove('hidden');
        roomIdDisplay.textContent = roomId;
        currentUserNameDisplay.textContent = userName;
        userInfoBadge.classList.remove('hidden');
        
        // Update local video label
        document.getElementById('local-video-label').textContent = userName + ' (You)';
        
        // Add self to participants
        participants.set(userId, { 
            name: userName, 
            isAudioEnabled: true, 
            isVideoEnabled: true,
            isSelf: true
        });
        updateParticipantsList();

        // Join room via socket with user info
        socket.emit('join-room', roomId, { userId, userName });

        // Listen for existing users
        socket.on('existing-users', (users) => {
            users.forEach(user => {
                participants.set(user.userId, {
                    name: user.userName,
                    isAudioEnabled: true,
                    isVideoEnabled: true,
                    isSelf: false
                });
                connectToUser(user.userId, true);
            });
            updateParticipantsList();
            updatePrivateRecipientOptions();
        });

        // Listen for new users
        socket.on('user-connected', (userData) => {
            console.log('User connected:', userData);
            participants.set(userData.userId, {
                name: userData.userName,
                isAudioEnabled: true,
                isVideoEnabled: true,
                isSelf: false
            });
            updateParticipantsList();
            updatePrivateRecipientOptions();
            
            // Show notification
            showNotification(`${userData.userName} joined the meeting`);
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
        socket.on('user-disconnected', (userInfo) => {
            if (peers[userInfo.userId]) {
                peers[userInfo.userId].close();
                delete peers[userInfo.userId];
                removeVideoElement(userInfo.userId);
            }
            const user = participants.get(userInfo.userId);
            if (user) {
                showNotification(`${user.name} left the meeting`);
                participants.delete(userInfo.userId);
                updateParticipantsList();
                updatePrivateRecipientOptions();
            }
        });

        // Chat messages
        socket.on('chat-message', (data) => {
            addChatMessage(data);
        });
        
        // Private messages
        socket.on('private-message', (data) => {
            addChatMessage(data, true);
        });
        
        // Typing indicator
        socket.on('user-typing', (data) => {
            showTypingIndicator(data.userName);
        });
        
        socket.on('user-stopped-typing', () => {
            hideTypingIndicator();
        });
        
        // Media state changes
        socket.on('user-media-state', (data) => {
            const participant = participants.get(data.userId);
            if (participant) {
                participant.isAudioEnabled = data.isAudioEnabled;
                participant.isVideoEnabled = data.isVideoEnabled;
                updateParticipantsList();
            }
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
    const participant = participants.get(userId);
    label.textContent = participant ? participant.name : userId.substr(0, 10);
    
    const speakingIndicator = document.createElement('div');
    speakingIndicator.className = 'speaking-indicator';
    speakingIndicator.id = `speaking-${userId}`;

    videoContainer.appendChild(video);
    videoContainer.appendChild(label);
    videoContainer.appendChild(speakingIndicator);
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
    toggleAudioBtn.setAttribute('data-tooltip', isAudioEnabled ? 'Mute microphone' : 'Unmute microphone');
    
    // Broadcast media state change
    socket.emit('media-state-change', {
        roomId,
        userId,
        isAudioEnabled,
        isVideoEnabled
    });
    
    // Update participants list
    const self = participants.get(userId);
    if (self) {
        self.isAudioEnabled = isAudioEnabled;
        updateParticipantsList();
    }
});

// Toggle video
toggleVideoBtn.addEventListener('click', () => {
    isVideoEnabled = !isVideoEnabled;
    localStream.getVideoTracks()[0].enabled = isVideoEnabled;
    toggleVideoBtn.classList.toggle('active');
    toggleVideoBtn.querySelector('.icon').textContent = isVideoEnabled ? '📹' : '🚫';
    toggleVideoBtn.setAttribute('data-tooltip', isVideoEnabled ? 'Turn off camera' : 'Turn on camera');
    
    // Broadcast media state change
    socket.emit('media-state-change', {
        roomId,
        userId,
        isAudioEnabled,
        isVideoEnabled
    });
    
    // Update participants list
    const self = participants.get(userId);
    if (self) {
        self.isVideoEnabled = isVideoEnabled;
        updateParticipantsList();
    }
});

// Toggle chat
toggleChatBtn.addEventListener('click', () => {
    chatPanel.classList.toggle('hidden');
    if (participantsPanel && !participantsPanel.classList.contains('hidden')) {
        participantsPanel.classList.add('hidden');
    }
});

closeChatBtn.addEventListener('click', () => {
    chatPanel.classList.add('hidden');
});

// Toggle participants
toggleParticipantsBtn.addEventListener('click', () => {
    participantsPanel.classList.toggle('hidden');
    if (chatPanel && !chatPanel.classList.contains('hidden')) {
        chatPanel.classList.add('hidden');
    }
});

closeParticipantsBtn.addEventListener('click', () => {
    participantsPanel.classList.add('hidden');
});

// Chat mode toggle
everyoneBtn.addEventListener('click', () => {
    currentChatMode = 'everyone';
    everyoneBtn.classList.add('active');
    privateBtn.classList.remove('active');
    privateChatSelector.classList.add('hidden');
    chatInput.placeholder = 'Send a message to everyone...';
    privateRecipient = '';
});

privateBtn.addEventListener('click', () => {
    currentChatMode = 'private';
    privateBtn.classList.add('active');
    everyoneBtn.classList.remove('active');
    privateChatSelector.classList.remove('hidden');
    chatInput.placeholder = 'Send a private message...';
});

privateRecipientSelect.addEventListener('change', (e) => {
    privateRecipient = e.target.value;
    if (privateRecipient) {
        const recipient = participants.get(privateRecipient);
        chatInput.placeholder = `Send a private message to ${recipient?.name || 'Unknown'}...`;
    }
});

// Typing indicator
chatInput.addEventListener('input', () => {
    if (typingTimeout) {
        clearTimeout(typingTimeout);
    }
    
    socket.emit('typing', { roomId, userName });
    
    typingTimeout = setTimeout(() => {
        socket.emit('stop-typing', { roomId });
    }, 1000);
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
        if (currentChatMode === 'private' && privateRecipient) {
            // Send private message
            socket.emit('private-message', {
                roomId,
                from: userId,
                fromName: userName,
                to: privateRecipient,
                toName: participants.get(privateRecipient)?.name || 'Unknown',
                message
            });
            // Show in own chat
            addChatMessage({
                userId,
                userName,
                message,
                timestamp: new Date().toISOString(),
                isPrivate: true,
                recipientName: participants.get(privateRecipient)?.name
            }, true);
        } else {
            // Send to everyone
            socket.emit('chat-message', { roomId, userId, userName, message });
        }
        chatInput.value = '';
        socket.emit('stop-typing', { roomId });
    }
}

// Add chat message to UI
function addChatMessage(data, isPrivateMsg = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message';
    
    const isOwn = data.userId === userId;
    messageDiv.classList.add(isOwn ? 'own-message' : 'other-message');
    
    if (isPrivateMsg || data.isPrivate) {
        messageDiv.classList.add('private-message');
    }

    const time = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    const displayName = data.userName || (isOwn ? 'You' : participants.get(data.userId)?.name || data.userId.substr(0, 10));
    
    let privateLabel = '';
    if (isPrivateMsg || data.isPrivate) {
        if (isOwn) {
            privateLabel = `<span class="private-label">Private to ${data.recipientName || data.toName}</span>`;
        } else {
            privateLabel = '<span class="private-label">Private Message</span>';
        }
    }
    
    messageDiv.innerHTML = `
        <div class="message-header">
            <span class="message-user">${isOwn ? 'You' : escapeHtml(displayName)}</span>
            ${privateLabel}
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

    // Stop speech recognition
    if (recognition) {
        recognition.stop();
    }

    // Close all peer connections
    Object.values(peers).forEach(peer => peer.close());
    peers = {};

    // Disconnect socket
    socket.disconnect();

    // Reload page
    window.location.reload();
}

// ==================== CAPTIONS FUNCTIONALITY ====================

// Initialize Speech Recognition (Web Speech API)
function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
        console.warn('Speech Recognition not supported in this browser');
        if (toggleCaptionsBtn) {
            toggleCaptionsBtn.style.display = 'none';
        }
        return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
        console.log('Speech recognition started');
    };

    recognition.onresult = (event) => {
        interimTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            
            if (event.results[i].isFinal) {
                finalTranscript += transcript + ' ';
                
                // Broadcast captions to other users
                socket.emit('caption-text', {
                    userId,
                    text: transcript,
                    isFinal: true
                });
            } else {
                interimTranscript += transcript;
            }
        }
        
        updateCaptionsDisplay();
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'no-speech') {
            // Restart recognition if no speech detected
            if (isCaptionsEnabled) {
                setTimeout(() => {
                    try {
                        recognition.start();
                    } catch (e) {
                        console.log('Recognition already started');
                    }
                }, 1000);
            }
        }
    };

    recognition.onend = () => {
        if (isCaptionsEnabled) {
            try {
                recognition.start();
            } catch (e) {
                console.log('Recognition already started');
            }
        }
    };
}

// Update captions display
function updateCaptionsDisplay() {
    if (!captionsText) return;
    
    const displayText = (finalTranscript + interimTranscript).trim();
    if (displayText) {
        // Update local user's caption
        activeCaptions.set('local-user', {
            userId: 'You',
            text: displayText,
            timestamp: Date.now()
        });
        
        // Clear existing timeout
        if (captionTimeouts.has('local-user')) {
            clearTimeout(captionTimeouts.get('local-user'));
        }
        
        // Set new timeout to clear local caption
        const timeout = setTimeout(() => {
            activeCaptions.delete('local-user');
            finalTranscript = '';
            interimTranscript = '';
            renderAllCaptions();
        }, 5000);
        
        captionTimeouts.set('local-user', timeout);
        renderAllCaptions();
    }
}

// Render all active captions
function renderAllCaptions() {
    if (!captionsText) return;
    
    if (activeCaptions.size === 0) {
        captionsText.innerHTML = '<div class="caption-hint">🎤 Speak to see captions...</div>';
        return;
    }
    
    let html = '';
    activeCaptions.forEach((caption, key) => {
        const colorClass = key === 'local-user' ? 'local-caption' : 'remote-caption';
        html += `
            <div class="caption-item ${colorClass}">
                <span class="user-name">${escapeHtml(caption.userId)}:</span>
                <span class="caption-content">${escapeHtml(caption.text)}</span>
            </div>
        `;
    });
    
    captionsText.innerHTML = html;
    captionsText.scrollTop = captionsText.scrollHeight;
}

// Display captions from other users
function displayRemoteCaption(data) {
    if (!captionsText || !isCaptionsEnabled) return;
    
    const participant = participants.get(data.userId);
    const displayName = participant ? participant.name : data.userId.substr(0, 10);
    const captionKey = `remote-${data.userId}`;
    
    // Update caption for this user
    activeCaptions.set(captionKey, {
        userId: displayName,
        text: data.text,
        timestamp: Date.now()
    });
    
    // Clear existing timeout for this user
    if (captionTimeouts.has(captionKey)) {
        clearTimeout(captionTimeouts.get(captionKey));
    }
    
    // Set new timeout to clear this user's caption
    const timeout = setTimeout(() => {
        activeCaptions.delete(captionKey);
        renderAllCaptions();
    }, 5000);
    
    captionTimeouts.set(captionKey, timeout);
    renderAllCaptions();
}

// Toggle captions
if (toggleCaptionsBtn) {
    toggleCaptionsBtn.addEventListener('click', () => {
        isCaptionsEnabled = !isCaptionsEnabled;
        
        if (isCaptionsEnabled) {
            // Show captions panel
            if (captionsPanel) {
                captionsPanel.classList.remove('hidden');
            }
            
            // Initialize and start recognition
            if (!recognition) {
                initSpeechRecognition();
            }
            
            if (recognition) {
                try {
                    recognition.start();
                    toggleCaptionsBtn.classList.add('active');
                    captionsText.innerHTML = '<span class="caption-hint">🎤 Listening... Speak now!</span>';
                } catch (e) {
                    console.log('Recognition already started');
                }
            }
        } else {
            // Hide captions panel
            if (captionsPanel) {
                captionsPanel.classList.add('hidden');
            }
            
            // Stop recognition
            if (recognition) {
                recognition.stop();
                toggleCaptionsBtn.classList.remove('active');
            }
            
            // Clear all captions and timeouts
            finalTranscript = '';
            interimTranscript = '';
            captionTimeouts.forEach(timeout => clearTimeout(timeout));
            captionTimeouts.clear();
            activeCaptions.clear();
        }
    });
}

// Listen for captions from other users
socket.on('caption-text', (data) => {
    displayRemoteCaption(data);
});

// ==================== NEW UTILITY FUNCTIONS ====================

// Update participants list
function updateParticipantsList() {
    participantsList.innerHTML = '';
    participantCount.textContent = participants.size;
    
    participants.forEach((participant, id) => {
        const participantDiv = document.createElement('div');
        participantDiv.className = 'participant-item';
        
        const micIcon = participant.isAudioEnabled ? '🎤' : '🔇';
        const camIcon = participant.isVideoEnabled ? '📹' : '🚫';
        const selfLabel = participant.isSelf ? ' (You)' : '';
        
        participantDiv.innerHTML = `
            <div class="participant-info">
                <span class="participant-name">${escapeHtml(participant.name)}${selfLabel}</span>
                <div class="participant-status">
                    <span class="status-icon" title="${participant.isAudioEnabled ? 'Mic on' : 'Mic off'}">${micIcon}</span>
                    <span class="status-icon" title="${participant.isVideoEnabled ? 'Camera on' : 'Camera off'}">${camIcon}</span>
                </div>
            </div>
        `;
        
        participantsList.appendChild(participantDiv);
    });
}

// Update private recipient options
function updatePrivateRecipientOptions() {
    const currentValue = privateRecipientSelect.value;
    privateRecipientSelect.innerHTML = '<option value="">Select participant...</option>';
    
    participants.forEach((participant, id) => {
        if (!participant.isSelf) {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = participant.name;
            privateRecipientSelect.appendChild(option);
        }
    });
    
    // Restore previous selection if still valid
    if (currentValue && participants.has(currentValue)) {
        privateRecipientSelect.value = currentValue;
    }
}

// Show typing indicator
function showTypingIndicator(userName) {
    typingUser.textContent = userName;
    typingIndicator.classList.remove('hidden');
}

// Hide typing indicator
function hideTypingIndicator() {
    typingIndicator.classList.add('hidden');
}

// Show notification
function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

// Setup audio monitoring for speaking indicator
function setupAudioMonitoring() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        audioAnalyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(localStream);
        source.connect(audioAnalyser);
        audioAnalyser.fftSize = 256;
        
        const bufferLength = audioAnalyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        function checkAudioLevel() {
            audioAnalyser.getByteFrequencyData(dataArray);
            const average = dataArray.reduce((a, b) => a + b) / bufferLength;
            
            const localSpeaking = document.getElementById('local-speaking');
            if (average > 30) { // Threshold for speaking
                if (!isSpeaking) {
                    isSpeaking = true;
                    if (localSpeaking) {
                        localSpeaking.classList.add('active');
                    }
                }
            } else {
                if (isSpeaking) {
                    isSpeaking = false;
                    if (localSpeaking) {
                        localSpeaking.classList.remove('active');
                    }
                }
            }
            
            requestAnimationFrame(checkAudioLevel);
        }
        
        checkAudioLevel();
    } catch (error) {
        console.error('Error setting up audio monitoring:', error);
    }
}
