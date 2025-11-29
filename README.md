# Video Meet - Google Meet Clone

A fully functional video conferencing application built with WebRTC, Socket.io, and Express.

## Features

- 🎥 Real-time video calling with multiple participants
- 🎤 Audio/Video toggle controls
- 💬 In-meeting text chat
- 🖥️ Screen sharing capability
- 📱 Responsive design for mobile and desktop
- 🔗 Simple room code sharing

## Technologies Used

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Backend**: Node.js, Express
- **Real-time Communication**: Socket.io, WebRTC
- **Video/Audio**: getUserMedia API

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

5. Open your browser and go to:
   ```
   http://localhost:3000
   ```

## Usage

### Creating a Meeting
1. Click "Create New Meeting" button
2. Allow camera and microphone permissions
3. Share the room code with others

### Joining a Meeting
1. Enter the room code provided by the host
2. Click "Join Meeting"
3. Allow camera and microphone permissions

### Controls
- 🎤 Toggle microphone on/off
- 📹 Toggle camera on/off
- 💬 Open/close chat panel
- 🖥️ Share your screen
- 📞 Leave the meeting

## Project Structure

```
code-connect/
├── client/
│   ├── index.html      # Main HTML file
│   ├── app.js          # WebRTC and Socket.io logic
│   └── styles.css      # Styling
└── server/
    ├── src/
    │   └── index.js    # Express & Socket.io server
    └── package.json    # Dependencies
```

## How It Works

1. **Server**: Express server handles HTTP requests and Socket.io manages real-time signaling
2. **WebRTC**: Peer-to-peer connections for video/audio streaming
3. **Socket.io**: Signaling server for WebRTC connection establishment
4. **STUN Server**: Google's STUN server helps with NAT traversal

## Browser Support

- Chrome (recommended)
- Firefox
- Edge
- Safari (limited support)

## License

MIT License - Feel free to use this project for learning and development.
