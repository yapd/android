/**
 * Profile Controller — Lista perfis disponíveis
 */
const asyncHandler = require('express-async-handler');
const { DEVICE_PROFILES } = require('../models/deviceProfiles');

const listProfiles = asyncHandler(async (_req, res) => {
  const profiles = Object.values(DEVICE_PROFILES).map(({ id, label, brand, model, screenWidth, screenHeight, screenDpi, ram }) => ({
    id, label, brand, model, screenWidth, screenHeight, screenDpi, ram,
  }));
  res.json({ success: true, data: profiles });
});

const getProfile = asyncHandler(async (req, res) => {
  const profile = DEVICE_PROFILES[req.params.id];
  if (!profile) {
    res.status(404);
    throw new Error(`Perfil não encontrado: ${req.params.id}`);
  }
  res.json({ success: true, data: profile });
});

module.exports = { listProfiles, getProfile };
