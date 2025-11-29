const socket = io();

// Global variables
let localStream;
let peers = {};
let roomId;
let userId;
let userName = '';
let isAudioEnabled = true;
let isVideoEnabled = true;
let isCaptionsEnabled = false;
let activeCaptions = new Map(); // Track captions from all users
let captionTimeouts = new Map(); // Track timeouts for clearing captions
let participants = new Map(); // Track all participants {userId: {name, isAudioEnabled, isVideoEnabled}}
let currentChatMode = 'everyone'; // 'everyone' or 'private'
let privateRecipient = '';
let typingTimeout;
let audioContext;
let audioAnalyser;
let isSpeaking = false;
let mediaRecorder;
let audioChunks = [];
let isTranscribing = false;
let targetTranslationLanguage = null;
let availableLanguages = [];
let useClientSideCaption = false;
let recognition = null;

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
const translationLanguageSelect = document.getElementById('translation-language');
const translationStatus = document.getElementById('translation-status');
const toggleSettingsBtn = document.getElementById('toggle-settings');
const settingsPanel = document.getElementById('settings-panel');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const micSensitivitySlider = document.getElementById('mic-sensitivity');
const micSensitivityValue = document.getElementById('mic-sensitivity-value');
const audioOutputSelect = document.getElementById('audio-output-select');

// Audio settings
let micSensitivity = 0.5; // 0-1 range
let participantVolumes = new Map(); // Track volume for each participant

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
    if (localStream) {
        localStream.getTracks().forEach(track => {
            console.log(`Adding ${track.kind} track to peer connection for ${otherUserId}`);
            peerConnection.addTrack(track, localStream);
        });
    } else {
        console.error('Local stream not available when creating peer connection');
    }

    // Handle incoming stream
    peerConnection.ontrack = (event) => {
        console.log('Received track:', event.track.kind, 'from stream:', event.streams[0].id);
        const stream = event.streams[0];
        console.log('Stream audio tracks:', stream.getAudioTracks().map(t => ({
            id: t.id,
            enabled: t.enabled,
            muted: t.muted,
            readyState: t.readyState
        })));
        console.log('Stream video tracks:', stream.getVideoTracks().map(t => ({
            id: t.id,
            enabled: t.enabled,
            muted: t.muted,
            readyState: t.readyState
        })));
        addVideoElement(otherUserId, stream);
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
        console.log(`Peer connection state with ${otherUserId}:`, peerConnection.connectionState);
        if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'disconnected') {
            console.warn(`Connection ${peerConnection.connectionState} with ${otherUserId}, attempting to reconnect...`);
        }
    };

    // Handle ICE connection state changes
    peerConnection.oniceconnectionstatechange = () => {
        console.log(`ICE connection state with ${otherUserId}:`, peerConnection.iceConnectionState);
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
    const existingVideo = document.getElementById(`video-${userId}`);
    if (existingVideo) {
        console.log(`Video element for ${userId} already exists, updating stream`);
        existingVideo.srcObject = stream;
        return;
    }

    const videoContainer = document.createElement('div');
    videoContainer.className = 'video-container';
    videoContainer.id = `container-${userId}`;
    videoContainer.setAttribute('data-user-id', userId);

    const video = document.createElement('video');
    video.id = `video-${userId}`;
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;
    video.playsinline = true; // For iOS
    video.setAttribute('webkit-playsinline', ''); // For older iOS
    video.muted = false; // Important: remote videos should NOT be muted
    
    // Set initial volume from saved preference
    const savedVolume = participantVolumes.get(userId) || 100;
    video.volume = savedVolume / 100;
    
    // Ensure video plays (handle autoplay policy) - critical for mobile
    const attemptPlay = () => {
        video.play()
            .then(() => {
                console.log(`Video for ${userId} is playing`);
            })
            .catch(err => {
                console.warn('Autoplay prevented, will retry on interaction:', err);
                // Retry on any user interaction
                const playOnInteraction = () => {
                    video.play()
                        .then(() => {
                            console.log(`Video for ${userId} started after user interaction`);
                            document.removeEventListener('click', playOnInteraction);
                            document.removeEventListener('touchstart', playOnInteraction);
                        })
                        .catch(e => console.error('Failed to play video:', e));
                };
                document.addEventListener('click', playOnInteraction, { once: true });
                document.addEventListener('touchstart', playOnInteraction, { once: true });
            });
    };

    // Try to play immediately and after a short delay
    setTimeout(attemptPlay, 100);
    setTimeout(attemptPlay, 500);

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
    
    console.log(`Added video element for ${userId}, audio tracks: ${stream.getAudioTracks().length}, video tracks: ${stream.getVideoTracks().length}`);
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

// Settings panel toggle
if (toggleSettingsBtn) {
    toggleSettingsBtn.addEventListener('click', () => {
        settingsPanel.classList.toggle('hidden');
        chatPanel.classList.add('hidden');
        participantsPanel.classList.add('hidden');
        
        // Load audio output devices
        loadAudioOutputDevices();
    });
}

if (closeSettingsBtn) {
    closeSettingsBtn.addEventListener('click', () => {
        settingsPanel.classList.add('hidden');
    });
}

// Microphone sensitivity control
if (micSensitivitySlider) {
    micSensitivitySlider.addEventListener('input', (e) => {
        const value = e.target.value;
        micSensitivity = value / 100;
        micSensitivityValue.textContent = `${value}%`;
        
        // Apply sensitivity to audio context
        if (audioContext && audioAnalyser) {
            adjustMicrophoneSensitivity(micSensitivity);
        }
    });
}

// Audio output device selector
if (audioOutputSelect) {
    audioOutputSelect.addEventListener('change', async (e) => {
        const deviceId = e.target.value;
        await setAudioOutputDevice(deviceId);
    });
}

// Load audio output devices
async function loadAudioOutputDevices() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioOutputs = devices.filter(device => device.kind === 'audiooutput');
        
        audioOutputSelect.innerHTML = '<option value="">Default Speaker</option>';
        audioOutputs.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label || `Speaker ${audioOutputs.indexOf(device) + 1}`;
            audioOutputSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading audio output devices:', error);
    }
}

// Set audio output device for all remote videos
async function setAudioOutputDevice(deviceId) {
    const remoteVideos = document.querySelectorAll('.video-container:not(.local) video');
    
    for (const video of remoteVideos) {
        if (typeof video.setSinkId === 'function') {
            try {
                await video.setSinkId(deviceId || '');
                console.log('Audio output device set:', deviceId || 'default');
            } catch (error) {
                console.error('Error setting audio output device:', error);
            }
        }
    }
}

// Adjust microphone sensitivity
function adjustMicrophoneSensitivity(sensitivity) {
    if (!localStream) return;
    
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack && audioTrack.applyConstraints) {
        audioTrack.applyConstraints({
            autoGainControl: true,
            noiseSuppression: true,
            echoCancellation: true,
            sampleRate: 48000,
            volume: sensitivity
        }).catch(err => console.error('Error adjusting mic sensitivity:', err));
    }
}

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

    // Stop transcription
    if (isTranscribing) {
        socket.emit('stop-transcription', { userId });
        stopAudioStreaming();
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

// Initialize Audio Streaming for Whisper transcription
function initAudioStreaming() {
    if (!localStream) {
        console.warn('No local stream available for transcription');
        return;
    }

    try {
        // Create MediaRecorder to capture audio
        const audioTrack = localStream.getAudioTracks()[0];
        if (!audioTrack) {
            console.warn('No audio track available');
            return;
        }

        const audioStream = new MediaStream([audioTrack]);
        mediaRecorder = new MediaRecorder(audioStream, {
            mimeType: 'audio/webm;codecs=opus'
        });

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0 && isTranscribing) {
                // Convert blob to base64 and send to server
                const reader = new FileReader();
                reader.onloadend = () => {
                    const base64Audio = reader.result.split(',')[1];
                    socket.emit('audio-chunk', {
                        userId,
                        audioData: base64Audio
                    });
                };
                reader.readAsDataURL(event.data);
            }
        };

        mediaRecorder.onerror = (error) => {
            console.error('MediaRecorder error:', error);
        };

        // Capture audio in chunks every 1 second
        mediaRecorder.start(1000);
        console.log('Audio streaming started');

    } catch (error) {
        console.error('Failed to initialize audio streaming:', error);
    }
}

// Stop audio streaming
function stopAudioStreaming() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        mediaRecorder = null;
        console.log('Audio streaming stopped');
    }
}

// Initialize Web Speech API (fallback when Whisper unavailable)
function initWebSpeechAPI() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
        console.warn('Web Speech API not supported in this browser');
        return false;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = async (event) => {
        let interimTranscript = '';
        let finalTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            
            if (event.results[i].isFinal) {
                finalTranscript += transcript + ' ';
                
                // Translate if language is selected
                let translatedText = null;
                if (targetTranslationLanguage) {
                    try {
                        translatedText = await translateText(transcript, targetTranslationLanguage);
                    } catch (error) {
                        console.error('Translation error:', error);
                    }
                }
                
                // Send to server to broadcast to other users
                socket.emit('client-caption-text', {
                    userId,
                    text: transcript,
                    translated: translatedText,
                    targetLanguage: targetTranslationLanguage,
                    isFinal: true
                });
                
                // Update local caption with translation
                activeCaptions.set('local-user', {
                    userId: 'You',
                    original: transcript,
                    translated: translatedText,
                    targetLanguage: targetTranslationLanguage,
                    timestamp: Date.now()
                });
            } else {
                interimTranscript += transcript;
                
                // Update local caption (interim)
                activeCaptions.set('local-user', {
                    userId: 'You',
                    original: interimTranscript,
                    translated: null,
                    timestamp: Date.now()
                });
            }
        }
        
        // Clear existing timeout
        if (captionTimeouts.has('local-user')) {
            clearTimeout(captionTimeouts.get('local-user'));
        }
        
        // Set new timeout to clear local caption
        const timeout = setTimeout(() => {
            activeCaptions.delete('local-user');
            renderAllCaptions();
        }, 5000);
        
        captionTimeouts.set('local-user', timeout);
        renderAllCaptions();
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'no-speech' && isCaptionsEnabled) {
            setTimeout(() => {
                try {
                    recognition.start();
                } catch (e) {
                    console.log('Recognition already started');
                }
            }, 1000);
        }
    };

    recognition.onend = () => {
        if (isCaptionsEnabled && useClientSideCaption) {
            try {
                recognition.start();
            } catch (e) {
                console.log('Recognition already started');
            }
        }
    };

    return true;
}

// Translate text using MyMemory Translation API (free, no API key required)
async function translateText(text, targetLang) {
    if (!text || !targetLang) {
        console.log('Translation skipped: missing text or target language');
        return null;
    }
    
    console.log(`Translating "${text.substring(0, 50)}..." to ${targetLang}`);
    
    if (translationStatus) {
        translationStatus.textContent = `Translating to ${targetLang}...`;
    }
    
    try {
        // MyMemory Translation API - completely free, no API key needed
        const encodedText = encodeURIComponent(text);
        const url = `https://api.mymemory.translated.net/get?q=${encodedText}&langpair=en|${targetLang}`;
        
        const response = await fetch(url);
        
        if (!response.ok) {
            console.error('Translation API error:', response.status, response.statusText);
            if (translationStatus) {
                translationStatus.textContent = `Translation error: ${response.status}`;
            }
            return null;
        }
        
        const data = await response.json();
        console.log('Translation result:', data.responseData.translatedText);
        
        if (translationStatus) {
            translationStatus.textContent = `✓ Translating to ${targetLang}`;
        }
        
        return data.responseData.translatedText || text;
    } catch (error) {
        console.error('Translation failed:', error);
        if (translationStatus) {
            translationStatus.textContent = `Translation failed: ${error.message}`;
        }
        return null;
    }
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
        const originalText = caption.original || caption.text || '';
        const translatedText = caption.translated || '';
        
        html += `
            <div class="caption-item ${colorClass}">
                <span class="user-name">${escapeHtml(caption.userId)}:</span>
                <span class="caption-content">${escapeHtml(originalText)}</span>
                ${translatedText ? `<span class="translated-caption">${escapeHtml(translatedText)}</span>` : ''}
            </div>
        `;
    });
    
    captionsText.innerHTML = html;
    captionsText.scrollTop = captionsText.scrollHeight;
}

// Display captions from other users (with translation support)
function displayRemoteCaption(data) {
    if (!captionsText || !isCaptionsEnabled) return;
    
    const participant = participants.get(data.userId);
    const displayName = participant ? participant.name : (data.userName || data.userId.substr(0, 10));
    const captionKey = `remote-${data.userId}`;
    
    // Update caption for this user
    activeCaptions.set(captionKey, {
        userId: displayName,
        original: data.original || data.text || '',
        translated: data.translated || null,
        targetLanguage: data.targetLanguage || null,
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
            
            toggleCaptionsBtn.classList.add('active');
            captionsText.innerHTML = '<span class="caption-hint">🎤 Initializing captions...</span>';
            
            // Try to use server-side transcription first
            useClientSideCaption = false;
            
            // Initialize and start audio streaming for Whisper
            if (!mediaRecorder) {
                initAudioStreaming();
            }
            
            isTranscribing = true;
            
            // Notify server to start transcription
            socket.emit('start-transcription', {
                userId,
                targetLanguage: targetTranslationLanguage
            });
            
            captionsText.innerHTML = '<span class="caption-hint">🎤 Listening... Speak now!</span>';
        } else {
            // Hide captions panel
            if (captionsPanel) {
                captionsPanel.classList.add('hidden');
            }
            
            // Stop transcription
            isTranscribing = false;
            useClientSideCaption = false;
            stopAudioStreaming();
            
            // Stop Web Speech API if it was being used
            if (recognition) {
                recognition.stop();
            }
            
            toggleCaptionsBtn.classList.remove('active');
            
            // Notify server to stop transcription
            socket.emit('stop-transcription', { userId });
            
            // Clear all captions and timeouts
            captionTimeouts.forEach(timeout => clearTimeout(timeout));
            captionTimeouts.clear();
            activeCaptions.clear();
        }
    });
}

// Listen for Whisper unavailable message
socket.on('whisper-unavailable', (data) => {
    console.log(data.message);
    
    if (data.useClientSide) {
        // Fall back to Web Speech API
        useClientSideCaption = true;
        stopAudioStreaming(); // Stop sending audio to server
        
        // Initialize and start Web Speech API
        if (initWebSpeechAPI()) {
            try {
                recognition.start();
                const translationMsg = targetTranslationLanguage ? ' with translation' : '';
                captionsText.innerHTML = `<span class="caption-hint">🎤 Using browser speech recognition${translationMsg}... Speak now!</span>`;
            } catch (e) {
                console.error('Failed to start Web Speech API:', e);
                captionsText.innerHTML = '<span class="caption-hint">❌ Speech recognition not available</span>';
            }
        } else {
            captionsText.innerHTML = '<span class="caption-hint">❌ Speech recognition not supported in this browser</span>';
        }
    }
});

// Language selector for translation
if (translationLanguageSelect) {
    translationLanguageSelect.addEventListener('change', (e) => {
        targetTranslationLanguage = e.target.value || null;
        
        console.log('Translation language changed to:', targetTranslationLanguage);
        
        // Update status message
        if (translationStatus) {
            if (targetTranslationLanguage) {
                translationStatus.textContent = `Translation enabled: ${e.target.options[e.target.selectedIndex].text}`;
            } else {
                translationStatus.textContent = '';
            }
        }
        
        // If captions are already running, update the translation language
        if (isTranscribing) {
            if (!useClientSideCaption) {
                // Server-side mode
                socket.emit('set-translation-language', {
                    userId,
                    targetLanguage: targetTranslationLanguage
                });
            } else {
                // Client-side mode - update message
                const translationMsg = targetTranslationLanguage ? ' with translation' : '';
                if (captionsText) {
                    captionsText.innerHTML = `<span class="caption-hint">🎤 Using browser speech recognition${translationMsg}... Speak now!</span>`;
                }
            }
        }
        
        console.log('Translation language set to:', targetTranslationLanguage || 'None');
    });
}

// Listen for captions from other users
socket.on('caption-text', (data) => {
    displayRemoteCaption(data);
});

// Listen for available languages from server
socket.on('available-languages', (languages) => {
    availableLanguages = languages;
    console.log('Available translation languages:', languages);
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
        
        // Get current volume for this participant (default 100%)
        const currentVolume = participantVolumes.get(id) || 100;
        
        participantDiv.innerHTML = `
            <div class="participant-info">
                <span class="participant-name">${escapeHtml(participant.name)}${selfLabel}</span>
                <div class="participant-status">
                    <span class="status-icon" title="${participant.isAudioEnabled ? 'Mic on' : 'Mic off'}">${micIcon}</span>
                    <span class="status-icon" title="${participant.isVideoEnabled ? 'Camera on' : 'Camera off'}">${camIcon}</span>
                </div>
            </div>
            ${!participant.isSelf ? `
                <div class="participant-volume-control">
                    <label>🔊 Volume:</label>
                    <input type="range" min="0" max="100" value="${currentVolume}" class="volume-slider" data-participant-id="${id}" />
                    <span class="volume-value">${currentVolume}%</span>
                </div>
            ` : ''}
        `;
        
        participantsList.appendChild(participantDiv);
        
        // Add volume control event listener
        if (!participant.isSelf) {
            const volumeSlider = participantDiv.querySelector('.volume-slider');
            const volumeValue = participantDiv.querySelector('.volume-value');
            
            volumeSlider.addEventListener('input', (e) => {
                const volume = e.target.value;
                volumeValue.textContent = `${volume}%`;
                participantVolumes.set(id, volume);
                setParticipantVolume(id, volume / 100);
            });
        }
    });
}

// Set volume for a specific participant's audio
function setParticipantVolume(participantId, volume) {
    const videoContainer = document.querySelector(`[data-user-id="${participantId}"]`);
    if (videoContainer) {
        const video = videoContainer.querySelector('video');
        if (video) {
            video.volume = Math.max(0, Math.min(1, volume));
            console.log(`Set volume for ${participantId} to ${volume}`);
        }
    }
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
