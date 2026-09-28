import { io } from 'socket.io-client';

// Connect to current origin so Vite proxies /socket.io seamlessly (or use env override if set)
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5000');

export const socket = io(SOCKET_URL, {
  autoConnect: true,
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelay: 500,
  reconnectionAttempts: Infinity,
  timeout: 5000
});

socket.on('connect', () => {
  console.log('[Socket] Connected to Argus realtime server:', socket.id);
});

socket.on('disconnect', (reason) => {
  console.log('[Socket] Disconnected:', reason);
});

socket.on('connect_error', (err) => {
  console.warn('[Socket] Connect error:', err.message);
});
