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
const rooms = new Map();

io.on('connection', (socket) => {
  console.log('New user connected:', socket.id);

  // User joins a room
  socket.on('join-room', (roomId, userId) => {
    socket.join(roomId);
    
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }
    rooms.get(roomId).add(userId);

    // Notify others in the room
    socket.to(roomId).emit('user-connected', userId);
    console.log(`User ${userId} joined room ${roomId}`);

    // Send current users in room to the new user
    const usersInRoom = Array.from(rooms.get(roomId)).filter(id => id !== userId);
    socket.emit('existing-users', usersInRoom);

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
    socket.on('chat-message', (message) => {
      io.to(roomId).emit('chat-message', {
        userId,
        message,
        timestamp: new Date().toISOString()
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
      if (rooms.has(roomId)) {
        rooms.get(roomId).delete(userId);
        if (rooms.get(roomId).size === 0) {
          rooms.delete(roomId);
        }
      }
      socket.to(roomId).emit('user-disconnected', userId);
      console.log(`User ${userId} disconnected from room ${roomId}`);
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} to start`);
});
