/**
 * Android Device Farm — Main Server
 * Express + Socket.IO + WebSocket Bridge (ws-scrcpy)
 */
require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { Server: SocketIOServer } = require('socket.io');

const logger = require('./utils/logger');
const { errorHandler, notFound } = require('./middleware/errorMiddleware');
const instanceRoutes = require('./routes/instanceRoutes');
const profileRoutes = require('./routes/profileRoutes');
const systemRoutes = require('./routes/systemRoutes');
const { initSocketHandlers } = require('./services/socketService');
const { startWsScrcpy } = require('./services/wsScrcpyService');

const app = express();
const server = http.createServer(app);

// ── Socket.IO ────────────────────────────────────────────────────────────────
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
});

// ── Middlewares ───────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));
app.use(morgan('combined', {
  stream: { write: (msg) => logger.http(msg.trim()) },
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Injeta io em todas as requests
app.use((req, _res, next) => {
  req.io = io;
  next();
});

// ── Rotas ─────────────────────────────────────────────────────────────────────
app.use('/api/instances', instanceRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/system', systemRoutes);

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    service: 'Android Device Farm',
    wsScrcpy: `ws://0.0.0.0:${process.env.WS_SCRCPY_BASE_PORT || 8886}/ws-scrcpy?serial=<adb-serial>`,
  });
});

// ── Error Handlers ────────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Socket Handlers ───────────────────────────────────────────────────────────
initSocketHandlers(io);

// ── ws-scrcpy WebSocket Server (attached to HTTP server on /ws-scrcpy) ───────
const WS_SCRCPY_PORT = parseInt(process.env.WS_SCRCPY_BASE_PORT || '8886', 10);
// Start as standalone WebSocket server on dedicated port 8886
startWsScrcpy(null, WS_SCRCPY_PORT);
logger.info(`📱 ws-scrcpy listening on ws://0.0.0.0:${WS_SCRCPY_PORT}`);
logger.info(`   Usage: ws://<host>:${WS_SCRCPY_PORT}?serial=127.0.0.1:5554`);

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3001', 10);
server.listen(PORT, '0.0.0.0', () => {
  logger.info(`🚀 Android Device Farm API rodando na porta ${PORT}`);
  logger.info(`📡 Socket.IO ativo`);
  logger.info(`🌍 Ambiente: ${process.env.NODE_ENV}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM recebido. Encerrando servidor...');
  server.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  logger.info('SIGINT recebido. Encerrando servidor...');
  server.close(() => process.exit(0));
});

module.exports = { app, server, io };

