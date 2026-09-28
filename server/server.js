require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { Server } = require('socket.io');

const authRoutes = require('./routes/auth');
const casesRoutes = require('./routes/cases');
const transactionsRoutes = require('./routes/transactions');
const apiRoutes = require('./routes/api');

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO with CORS enabled for frontend
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH']
  }
});

// Attach io instance to express app so routes and services can access it
app.set('io', io);

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/cases', casesRoutes);
app.use('/api/transactions', transactionsRoutes);
app.use('/api', apiRoutes); // backward-compatible root routes

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Argus API & Agent Orchestration Server',
    mongoState: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`[Socket.io] Client connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`[Socket.io] Client disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/argus';

// Start server immediately so frontend & API are immediately operational
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Argus Server running on http://localhost:${PORT}`);
});

// Attempt MongoDB Connection in the background
mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 2500 })
  .then(() => {
    console.log(`[MongoDB] Connected successfully to ${MONGO_URI}`);
  })
  .catch((err) => {
    console.warn(`[MongoDB] Local MongoDB offline (${err.message}). Argus is operating in high-performance in-memory dataset mode.`);
  });

module.exports = { app, server, io };
