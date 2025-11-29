const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.static(path.join(__dirname, '../../client')));

// Store active rooms and users
const rooms = new Map(); // roomId -> Set of {userId, userName, socketId}

io.on('connection', (socket) => {
  console.log('New user connected:', socket.id);

  // User joins a room
  socket.on('join-room', (roomId, userInfo) => {
    const userId = userInfo.userId || userInfo;
    const userName = userInfo.userName || `User${socket.id.substr(0, 4)}`;
    
    socket.join(roomId);
    
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Map());
    }
    
    // Store user info
    rooms.get(roomId).set(userId, {
      userId,
      userName,
      socketId: socket.id
    });

    // Send existing users to the new user
    const existingUsers = [];
    rooms.get(roomId).forEach((user, id) => {
      if (id !== userId) {
        existingUsers.push({ userId: user.userId, userName: user.userName });
      }
    });
    socket.emit('existing-users', existingUsers);

    // Notify others in the room about new user
    socket.to(roomId).emit('user-connected', { userId, userName });
    console.log(`User ${userName} (${userId}) joined room ${roomId}`);

    // Handle WebRTC signaling
    socket.on('offer', (data) => {
      socket.to(roomId).emit('offer', data);
    });

    socket.on('answer', (data) => {
      socket.to(roomId).emit('answer', data);
    });

    socket.on('ice-candidate', (data) => {
      socket.to(roomId).emit('ice-candidate', data);
    });

    // Handle chat messages
    socket.on('chat-message', (data) => {
      io.to(data.roomId).emit('chat-message', {
        userId: data.userId,
        userName: data.userName,
        message: data.message,
        timestamp: new Date().toISOString()
      });
    });

    // Handle private messages
    socket.on('private-message', (data) => {
      const room = rooms.get(data.roomId);
      if (room) {
        const recipient = room.get(data.to);
        if (recipient) {
          // Send to recipient
          io.to(recipient.socketId).emit('private-message', {
            userId: data.from,
            userName: data.fromName,
            message: data.message,
            timestamp: new Date().toISOString(),
            isPrivate: true,
            fromName: data.fromName
          });
        }
      }
    });

    // Handle typing indicator
    socket.on('typing', (data) => {
      socket.to(data.roomId).emit('user-typing', {
        userName: data.userName
      });
    });

    socket.on('stop-typing', (data) => {
      socket.to(data.roomId).emit('user-stopped-typing');
    });

    // Handle media state changes
    socket.on('media-state-change', (data) => {
      socket.to(data.roomId).emit('user-media-state', {
        userId: data.userId,
        isAudioEnabled: data.isAudioEnabled,
        isVideoEnabled: data.isVideoEnabled
      });
    });

    // Handle captions/transcription
    socket.on('caption-text', (data) => {
      socket.to(roomId).emit('caption-text', {
        userId: data.userId,
        text: data.text,
        isFinal: data.isFinal,
        timestamp: new Date().toISOString()
      });
    });

    // Handle user disconnection
    socket.on('disconnect', () => {
      rooms.forEach((users, roomId) => {
        users.forEach((user, userId) => {
          if (user.socketId === socket.id) {
            users.delete(userId);
            if (users.size === 0) {
              rooms.delete(roomId);
            }
            socket.to(roomId).emit('user-disconnected', { userId, userName: user.userName });
            console.log(`User ${user.userName} (${userId}) disconnected from room ${roomId}`);
          }
        });
      });
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} to start`);
});
