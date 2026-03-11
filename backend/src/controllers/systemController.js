/**
 * System Controller — Métricas do servidor host
 */
const asyncHandler = require('express-async-handler');
const si = require('systeminformation');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const getSystemMetrics = asyncHandler(async (_req, res) => {
  const [cpu, mem, disk, load] = await Promise.all([
    si.cpu(),
    si.mem(),
    si.fsSize(),
    si.currentLoad(),
  ]);

  res.json({
    success: true,
    data: {
      cpu: {
        manufacturer: cpu.manufacturer,
        brand: cpu.brand,
        cores: cpu.physicalCores,
        threads: cpu.cores,
        speed: cpu.speed,
        load: Math.round(load.currentLoad),
      },
      memory: {
        total: Math.round(mem.total / 1024 / 1024),
        used: Math.round(mem.active / 1024 / 1024),
        free: Math.round(mem.available / 1024 / 1024),
        usedPercent: Math.round((mem.active / mem.total) * 100),
      },
      disk: disk.map((d) => ({
        fs: d.fs,
        size: Math.round(d.size / 1024 / 1024 / 1024),
        used: Math.round(d.used / 1024 / 1024 / 1024),
        usedPercent: d.use,
      })),
      timestamp: new Date().toISOString(),
    },
  });
});

const getAdbDevices = asyncHandler(async (_req, res) => {
  const SDK_ROOT = process.env.ANDROID_SDK_ROOT || '/opt/android-farm/sdk';
  const ADB = `${SDK_ROOT}/platform-tools/adb`;

  try {
    const { stdout } = await execAsync(`${ADB} devices -l`, { timeout: 10000 });
    const lines = stdout.split('\n').slice(1).filter((l) => l.trim());
    const devices = lines.map((line) => {
      const parts = line.split(/\s+/);
      return { serial: parts[0], status: parts[1], info: parts.slice(2).join(' ') };
    });
    res.json({ success: true, data: devices });
  } catch (err) {
    res.json({ success: true, data: [], error: err.message });
  }
});

module.exports = { getSystemMetrics, getAdbDevices };
