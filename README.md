# Video Confrencing

A fully functional video conferencing application built with WebRTC, Socket.io, and Express.

## Features

- 🎥 Real-time video calling with multiple participants
- 🎤 Audio/Video toggle controls
- 💬 In-meeting text chat with private messaging
- 🗣️ **AI-Powered Live Captions with Translation** (Whisper + LibreTranslate)
- 🌍 Multi-language support with real-time translation
- 🖥️ Screen sharing capability
- 👥 Participants panel with live status
- 📝 Typing indicators
- 🔊 Speaking indicators with audio detection
- 📱 Responsive design for mobile and desktop
- 🔗 Simple room code sharing
- 🎨 Premium dark theme UI with glassmorphism

## Technologies Used

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Backend**: Node.js, Express
- **Real-time Communication**: Socket.io, WebRTC
- **Video/Audio**: getUserMedia API, MediaRecorder API
- **AI Transcription**: Whisper (local or OpenAI API)
- **Translation**: LibreTranslate (self-hosted or public endpoint)

## Installation & Setup

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### Steps to Run Locally

1. Clone the repository
2. Navigate to the server directory:
   ```bash
   cd server
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Start the server:
   ```bash
   npm start
   ```

5. **(Optional)** Set up Whisper for transcription:
   ```bash
   # See WHISPER_SETUP.md for detailed instructions
   cp .env.example .env
   # Edit .env with your Whisper and LibreTranslate endpoints
   ```

6. Open your browser and go to:
   ```
   http://localhost:3000
   ```

## Usage

### Creating a Meeting
1. Enter your name (optional)
2. Click "Create New Meeting" button
3. Allow camera and microphone permissions
4. Share the room code with others

### Joining a Meeting
1. Enter your name (optional)
2. Enter the room code provided by the host
3. Click "Join Meeting"
4. Allow camera and microphone permissions

### Controls
- 🎤 Toggle microphone on/off
- 📹 Toggle camera on/off
- 💬 Enable live captions with translation
- 💭 Open/close chat panel (Everyone or Private messaging)
- 👥 View participants list
- 🖥️ Share your screen
- 📞 Leave the meeting

### Using AI Captions with Translation
1. Click the 💬 (Captions) button during a call
2. Select a target language from the dropdown (optional)
3. Start speaking to see live transcriptions
4. All participants will see captions in real-time
5. If translation is enabled, both original and translated text will be shown

**Setup Required**: See [WHISPER_SETUP.md](WHISPER_SETUP.md) for configuring local Whisper or using OpenAI's API.

### Private Messaging
1. Click the 💭 (Chat) button
2. Switch from "Everyone" to "Private"
3. Select a participant from the dropdown
4. Send private messages that only they can see

## Project Structure

```
code-connect/
├── client/
│   ├── index.html      # Main HTML file
│   ├── app.js          # WebRTC, Socket.io, and audio streaming
│   └── styles.css      # Premium UI styling
├── server/
│   ├── src/
│   │   ├── index.js           # Express & Socket.io server
│   │   └── transcription.js   # Whisper + LibreTranslate service
│   ├── package.json    # Dependencies
│   └── .env.example    # Configuration template
├── WHISPER_SETUP.md    # Transcription setup guide
└── README.md
```

## How It Works

1. **Server**: Express server handles HTTP requests and Socket.io manages real-time signaling
2. **WebRTC**: Peer-to-peer connections for video/audio streaming
3. **Socket.io**: Signaling server for WebRTC and audio streaming for transcription
4. **STUN Server**: Google's STUN server helps with NAT traversal
5. **Whisper**: Local or cloud-based speech-to-text transcription
6. **LibreTranslate**: Real-time translation service

## Browser Support

- Chrome (recommended)
- Firefox
- Edge
- Safari (iOS 11+)

## License

MIT License - Feel free to use this project for learning and development.
