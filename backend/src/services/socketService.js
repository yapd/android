/**
 * Socket.IO Service — Real-time events e broadcast
 */
const logger = require('../utils/logger');
const store = require('../models/instanceStore');
const si = require('systeminformation');

let ioInstance = null;

function initSocketHandlers(io) {
  ioInstance = io;

  io.on('connection', (socket) => {
    logger.info(`[WS] Cliente conectado: ${socket.id}`);

    // Envia lista inicial
    socket.emit('instances:list', store.getAll());

    socket.on('disconnect', () => {
      logger.info(`[WS] Cliente desconectado: ${socket.id}`);
    });

    // Subscription para updates de instância específica
    socket.on('instance:subscribe', (instanceId) => {
      socket.join(`instance:${instanceId}`);
      logger.debug(`[WS] ${socket.id} inscrito em instance:${instanceId}`);
    });

    socket.on('instance:unsubscribe', (instanceId) => {
      socket.leave(`instance:${instanceId}`);
    });
  });

  // Polling de métricas do sistema a cada 5 segundos
  setInterval(async () => {
    try {
      const [cpu, mem] = await Promise.all([
        si.currentLoad(),
        si.mem(),
      ]);
      io.emit('system:metrics', {
        cpuLoad: Math.round(cpu.currentLoad),
        ramUsedMb: Math.round(mem.active / 1024 / 1024),
        ramTotalMb: Math.round(mem.total / 1024 / 1024),
        timestamp: Date.now(),
      });
    } catch (_) {}
  }, 5000);

  // Broadcast da lista de instâncias a cada 10s
  setInterval(() => {
    io.emit('instances:list', store.getAll());
  }, 10000);
}

function emitInstanceUpdate(instanceId, data) {
  if (!ioInstance) return;
  ioInstance.emit('instance:update', { id: instanceId, ...data });
  ioInstance.to(`instance:${instanceId}`).emit('instance:detail', data);
}

function emitToAll(event, data) {
  if (!ioInstance) return;
  ioInstance.emit(event, data);
}

module.exports = { initSocketHandlers, emitInstanceUpdate, emitToAll };
