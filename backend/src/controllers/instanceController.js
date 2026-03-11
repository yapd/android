/**
 * Instance Controller — CRUD + Lifecycle de Emuladores
 */
const asyncHandler = require('express-async-handler');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const store = require('../models/instanceStore');
const { DEVICE_PROFILES } = require('../models/deviceProfiles');
const avdService = require('../services/avdService');
const { emitInstanceUpdate, emitToAll } = require('../services/socketService');

// ─── GET /api/instances ───────────────────────────────────────────────────────
const listInstances = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: store.getAll() });
});

// ─── GET /api/instances/:id ───────────────────────────────────────────────────
const getInstance = asyncHandler(async (req, res) => {
  const inst = store.getById(req.params.id);
  if (!inst) {
    res.status(404);
    throw new Error('Instância não encontrada.');
  }
  res.json({ success: true, data: inst });
});

// ─── POST /api/instances ──────────────────────────────────────────────────────
const createInstance = asyncHandler(async (req, res) => {
  const {
    name,
    profileId = 'pixel-7',
    gpsLat, gpsLng,
    batteryLevel, batteryStatus,
    networkOperator, networkStrength,
  } = req.body;

  const profile = DEVICE_PROFILES[profileId];
  if (!profile) {
    res.status(400);
    throw new Error(`Perfil de dispositivo inválido: "${profileId}"`);
  }

  // Cria registro
  const inst = store.create({
    name: name || `${profile.label} - ${Date.now()}`,
    profile,
    gpsLat:          parseFloat(gpsLat)          || -23.5505,
    gpsLng:          parseFloat(gpsLng)           || -46.6333,
    batteryLevel:    parseInt(batteryLevel)        || 85,
    batteryStatus:   batteryStatus                 || 'charging',
    networkOperator: networkOperator               || 'Android',
    networkStrength: parseInt(networkStrength)     || 4,
  });

  // Responde imediatamente e processa em background
  res.status(202).json({ success: true, data: inst });
  emitToAll('instances:list', store.getAll());

  // ─── Processo assíncrono de criação ──────────────────────────────────────
  (async () => {
    try {
      store.update(inst.id, { status: 'creating' });
      emitInstanceUpdate(inst.id, store.getById(inst.id));

      // Encontra porta livre
      const emulatorPort = await avdService.findFreePort();
      store.update(inst.id, { emulatorPort });

      // Cria o AVD no disco
      const { avdName } = await avdService.createAVD(inst.id, inst.name, profile);
      store.update(inst.id, { avdName, status: 'stopped' });
      emitInstanceUpdate(inst.id, store.getById(inst.id));
      emitToAll('instances:list', store.getAll());

      logger.info(`[CTRL] Instância ${inst.id} criada com sucesso (AVD: ${avdName})`);
    } catch (err) {
      logger.error(`[CTRL] Falha ao criar instância ${inst.id}: ${err.message}`);
      store.update(inst.id, { status: 'error', error: err.message });
      emitInstanceUpdate(inst.id, store.getById(inst.id));
    }
  })();
});

// ─── POST /api/instances/:id/start ───────────────────────────────────────────
const startInstance = asyncHandler(async (req, res) => {
  const inst = store.getById(req.params.id);
  if (!inst) { res.status(404); throw new Error('Instância não encontrada.'); }
  if (inst.status === 'running') {
    return res.json({ success: true, message: 'Instância já está rodando.', data: inst });
  }

  store.update(inst.id, { status: 'starting' });
  emitInstanceUpdate(inst.id, store.getById(inst.id));
  res.json({ success: true, message: 'Iniciando emulador...', data: store.getById(inst.id) });

  (async () => {
    try {
      const port = inst.emulatorPort || await avdService.findFreePort();
      store.update(inst.id, { emulatorPort: port });

      const proc = await avdService.startEmulator(inst.id, inst.avdName, port);
      store.update(inst.id, { pid: proc.pid, status: 'starting' });

      await avdService.waitForEmulatorBoot(port);

      // Aplica spoofing de build.prop
      if (inst.profile) {
        await avdService.applyBuildPropSpoofing(port, inst.profile);
      }

      // Aplica GPS inicial
      await avdService.setGPS(port, inst.gpsLat, inst.gpsLng).catch(() => {});

      // Aplica bateria inicial
      await avdService.setBattery(port, inst.batteryLevel, inst.batteryStatus).catch(() => {});

      store.update(inst.id, { status: 'running', lastStartedAt: new Date().toISOString() });
      emitInstanceUpdate(inst.id, store.getById(inst.id));
      emitToAll('instances:list', store.getAll());

      logger.info(`[CTRL] Instância ${inst.id} (${inst.avdName}) rodando na porta ${port}`);
    } catch (err) {
      logger.error(`[CTRL] Falha ao iniciar ${inst.id}: ${err.message}`);
      store.update(inst.id, { status: 'error', error: err.message });
      emitInstanceUpdate(inst.id, store.getById(inst.id));
    }
  })();
});

// ─── POST /api/instances/:id/stop ────────────────────────────────────────────
const stopInstance = asyncHandler(async (req, res) => {
  const inst = store.getById(req.params.id);
  if (!inst) { res.status(404); throw new Error('Instância não encontrada.'); }

  store.update(inst.id, { status: 'stopping' });
  emitInstanceUpdate(inst.id, store.getById(inst.id));
  res.json({ success: true, message: 'Parando emulador...', data: store.getById(inst.id) });

  (async () => {
    try {
      await avdService.stopEmulator(inst.id, inst.emulatorPort);
      store.update(inst.id, { status: 'stopped', pid: null });
      emitInstanceUpdate(inst.id, store.getById(inst.id));
      emitToAll('instances:list', store.getAll());
    } catch (err) {
      logger.error(`[CTRL] Falha ao parar ${inst.id}: ${err.message}`);
      store.update(inst.id, { status: 'error', error: err.message });
      emitInstanceUpdate(inst.id, store.getById(inst.id));
    }
  })();
});

// ─── POST /api/instances/:id/reboot ──────────────────────────────────────────
const rebootInstance = asyncHandler(async (req, res) => {
  const inst = store.getById(req.params.id);
  if (!inst) { res.status(404); throw new Error('Instância não encontrada.'); }

  res.json({ success: true, message: 'Reiniciando emulador...' });

  (async () => {
    try {
      await avdService.stopEmulator(inst.id, inst.emulatorPort);
      store.update(inst.id, { status: 'starting' });
      emitInstanceUpdate(inst.id, store.getById(inst.id));

      await new Promise((r) => setTimeout(r, 3000));

      const proc = await avdService.startEmulator(inst.id, inst.avdName, inst.emulatorPort);
      store.update(inst.id, { pid: proc.pid });
      await avdService.waitForEmulatorBoot(inst.emulatorPort);

      if (inst.profile) await avdService.applyBuildPropSpoofing(inst.emulatorPort, inst.profile);

      store.update(inst.id, { status: 'running', lastStartedAt: new Date().toISOString() });
      emitInstanceUpdate(inst.id, store.getById(inst.id));
      emitToAll('instances:list', store.getAll());
    } catch (err) {
      store.update(inst.id, { status: 'error', error: err.message });
      emitInstanceUpdate(inst.id, store.getById(inst.id));
    }
  })();
});

// ─── POST /api/instances/:id/wipe ────────────────────────────────────────────
const wipeInstance = asyncHandler(async (req, res) => {
  const inst = store.getById(req.params.id);
  if (!inst) { res.status(404); throw new Error('Instância não encontrada.'); }
  if (inst.status === 'running') {
    res.status(400);
    throw new Error('Para o emulador antes de fazer o Wipe.');
  }

  await avdService.wipeAVD(inst.avdName);
  res.json({ success: true, message: 'Dados do AVD apagados com sucesso.' });
});

// ─── DELETE /api/instances/:id ────────────────────────────────────────────────
const deleteInstance = asyncHandler(async (req, res) => {
  const inst = store.getById(req.params.id);
  if (!inst) { res.status(404); throw new Error('Instância não encontrada.'); }

  // Para o emulador se estiver rodando
  if (inst.status === 'running') {
    await avdService.stopEmulator(inst.id, inst.emulatorPort).catch(() => {});
  }

  if (inst.avdName) {
    await avdService.deleteAVD(inst.avdName).catch(() => {});
  }

  store.delete(inst.id);
  emitToAll('instances:list', store.getAll());
  res.json({ success: true, message: 'Instância excluída com sucesso.' });
});

// ─── PATCH /api/instances/:id/gps ────────────────────────────────────────────
const setGPS = asyncHandler(async (req, res) => {
  const inst = store.getById(req.params.id);
  if (!inst) { res.status(404); throw new Error('Instância não encontrada.'); }

  const { lat, lng } = req.body;
  if (lat === undefined || lng === undefined) {
    res.status(400); throw new Error('Informe lat e lng.');
  }

  await avdService.setGPS(inst.emulatorPort, parseFloat(lat), parseFloat(lng));
  store.update(inst.id, { gpsLat: parseFloat(lat), gpsLng: parseFloat(lng) });
  emitInstanceUpdate(inst.id, store.getById(inst.id));
  res.json({ success: true, message: 'GPS atualizado.' });
});

// ─── PATCH /api/instances/:id/battery ────────────────────────────────────────
const setBattery = asyncHandler(async (req, res) => {
  const inst = store.getById(req.params.id);
  if (!inst) { res.status(404); throw new Error('Instância não encontrada.'); }

  const { level = 85, status = 'charging' } = req.body;
  await avdService.setBattery(inst.emulatorPort, level, status);
  store.update(inst.id, { batteryLevel: level, batteryStatus: status });
  emitInstanceUpdate(inst.id, store.getById(inst.id));
  res.json({ success: true, message: 'Bateria atualizada.' });
});

// ─── PATCH /api/instances/:id/gsm ────────────────────────────────────────────
const setGSM = asyncHandler(async (req, res) => {
  const inst = store.getById(req.params.id);
  if (!inst) { res.status(404); throw new Error('Instância não encontrada.'); }

  const { strength, operator } = req.body;
  await avdService.setGSM(inst.emulatorPort, { strength, operator });
  store.update(inst.id, {
    networkStrength: strength ?? inst.networkStrength,
    networkOperator: operator ?? inst.networkOperator,
  });
  emitInstanceUpdate(inst.id, store.getById(inst.id));
  res.json({ success: true, message: 'GSM atualizado.' });
});

// ─── POST /api/instances/:id/sms ─────────────────────────────────────────────
const sendSMS = asyncHandler(async (req, res) => {
  const inst = store.getById(req.params.id);
  if (!inst) { res.status(404); throw new Error('Instância não encontrada.'); }

  const { from = '+5511999999999', message = 'Test SMS' } = req.body;
  await avdService.sendSMS(inst.emulatorPort, from, message);
  res.json({ success: true, message: 'SMS injetado.' });
});

module.exports = {
  listInstances,
  getInstance,
  createInstance,
  startInstance,
  stopInstance,
  rebootInstance,
  wipeInstance,
  deleteInstance,
  setGPS,
  setBattery,
  setGSM,
  sendSMS,
};
