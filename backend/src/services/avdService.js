/**
 * AVD Service — Android Virtual Devices via Redroid (Docker)
 * ARM64 host: docker run redroid/redroid:13.0.0-latest
 *
 * Redroid requirements (host):
 *   modprobe binder_linux
 *   mount -t binder binder /dev/binderfs
 *
 * Key design decisions:
 *  - ro.* props injected as docker run CMD args (NOT setprop — read-only after boot)
 *  - androidboot.qemu=0 ALWAYS set to avoid QEMU/emulator detection
 *  - androidboot.redroid_gpu_mode=guest for headless/CI environments (no GPU needed)
 *  - Boot timeout 10 min (first boot initialises /data, takes longer)
 *  - GSM spoofing via setprop gsm.* (writable at runtime)
 *  - Battery via `dumpsys battery set`
 *  - GPS via LocationManager mock broadcast
 *  - SMS via android.provider.Telephony.SMS_RECEIVED broadcast
 */

const { exec, spawn } = require('child_process');
const { promisify }   = require('util');
const path  = require('path');
const fs    = require('fs');
const net   = require('net');
const logger = require('../utils/logger');

const execAsync = promisify(exec);

const FARM_DIR  = process.env.FARM_BASE_DIR    || '/opt/android-farm';
const ADB       = path.join(
  process.env.ANDROID_SDK_ROOT || '/opt/android-farm/sdk',
  'platform-tools/adb'
);

// Redroid Docker image
const REDROID_IMAGE  = process.env.REDROID_IMAGE  || 'redroid/redroid:13.0.0-latest';
const REDROID_PREFIX = 'redroid-farm';

// ADB port base
const BASE_ADB_PORT = parseInt(process.env.EMULATOR_BASE_PORT || '5554', 10);
const MAX_INSTANCES = parseInt(process.env.MAX_INSTANCES      || '20',   10);

// Map instanceId → { containerId, adbPort }
const runningProcesses = new Map();

// ─── Port utilities ───────────────────────────────────────────────────────────
function isPortFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, '127.0.0.1');
  });
}

async function findFreePort(start = BASE_ADB_PORT) {
  for (let p = start; p < start + MAX_INSTANCES * 2; p += 1) {
    if (await isPortFree(p)) return p;
  }
  throw new Error('No free ADB port available.');
}

// ─── Kernel modules (binder required by Redroid) ─────────────────────────────
async function ensureKernelModules() {
  try {
    await execAsync('modprobe binder_linux 2>/dev/null; modprobe ashmem_linux 2>/dev/null; true');
    const { stdout: mounts } = await execAsync('mount | grep binder || true');
    if (!mounts.includes('binder')) {
      await execAsync('mkdir -p /dev/binderfs && mount -t binder binder /dev/binderfs 2>/dev/null || true');
    }
  } catch (e) {
    logger.warn(`[Redroid] kernel module hint: ${e.message}`);
  }
}

// ─── Wait for Android to boot via ADB ────────────────────────────────────────
async function waitForEmulatorBoot(adbPort, timeoutMs = 600000) {
  const adbSerial = `127.0.0.1:${adbPort}`;
  const deadline  = Date.now() + timeoutMs;
  logger.info(`[Redroid] Aguardando ADB ${adbSerial} (timeout ${timeoutMs / 1000}s)...`);

  while (Date.now() < deadline) {
    try {
      await execAsync(`${ADB} connect ${adbSerial}`, { timeout: 8000 });
      const { stdout } = await execAsync(
        `${ADB} -s ${adbSerial} shell getprop sys.boot_completed`,
        { timeout: 10000 }
      );
      if (stdout.trim() === '1') {
        logger.info(`[Redroid] Dispositivo ${adbSerial} iniciado com sucesso!`);
        return adbSerial;
      }
    } catch (_) { /* ainda inicializando */ }
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error(`Timeout aguardando boot do emulador ${adbSerial}`);
}

// ─── Container name ───────────────────────────────────────────────────────────
function containerName(instanceId) {
  return `${REDROID_PREFIX}-${instanceId.replace(/-/g, '').slice(0, 12)}`;
}

// ─── createAVD (no-op para Redroid) ──────────────────────────────────────────
async function createAVD(instanceId, name, profile) {
  const avdName = `farm_${instanceId.replace(/-/g, '_')}`;
  logger.info(`[Redroid] Slot AVD pronto: ${avdName} (perfil: ${profile.id || profile.label})`);
  return { avdName, avdDir: path.join(FARM_DIR, 'instances', instanceId) };
}

async function applyConfigIni(_avdName, _avdDir, _profile) { /* no-op */ }

// ─── Build Samsung S23 docker args from profile ───────────────────────────────
function buildDockerArgs(adbPort, instanceId, profile) {
  const cname      = containerName(instanceId);
  // Named Docker volume: avoids host UID issues that slow first-boot data init
  const volumeName = `redroid-data-${instanceId.replace(/-/g, '').slice(0, 12)}`;

  // Base props from profile buildProps (injected as CMD args for read-only props)
  const props = profile.buildProps || {};

  const args = [
    'run', '-d',
    '--name', cname,
    '--privileged',
    // Use Docker named volume for /data — much faster first-boot than host bind
    '-v', `${volumeName}:/data`,
    // Binder (required for Redroid)
    '-v', '/dev/binderfs:/dev/binderfs',
    // Port: host adbPort → container 5555
    '-p', `127.0.0.1:${adbPort}:5555`,
    // Memory limit
    '--memory', '3g',
    '--memory-swap', '3g',
    REDROID_IMAGE,
    // ─── Android boot params ──────────────────────────────────────────────
    'androidboot.hardware=redroid',
    'androidboot.redroid_width=1080',
    'androidboot.redroid_height=1920',
    'androidboot.redroid_density=420',
    // CRITICAL: qemu=0 prevents emulator detection by apps
    'androidboot.qemu=0',
    // Use guest/software GPU (no physical GPU needed, works headless)
    'androidboot.redroid_gpu_mode=guest',
  ];

  // Inject all ro.* build props as docker CMD args
  for (const [k, v] of Object.entries(props)) {
    args.push(`${k}=${v}`);
  }

  return args;
}

// ─── Start Redroid Container ──────────────────────────────────────────────────
async function startEmulator(instanceId, avdName, adbPort, profileArg) {
  logger.info(`[Redroid] Iniciando container para ${avdName}, porta ADB ${adbPort}...`);
  await ensureKernelModules();

  const cname = containerName(instanceId);

  // Remove stale container if exists
  try { await execAsync(`docker rm -f ${cname} 2>/dev/null || true`); } catch (_) {}

  // Default Samsung S23 profile if none provided
  const defaultProfile = {
    buildProps: {
      'ro.product.brand':            'samsung',
      'ro.product.manufacturer':     'samsung',
      'ro.product.model':            'SM-S911B',
      'ro.product.name':             'dm1q',
      'ro.product.device':           'dm1q',
      'ro.product.board':            'kalama',
      'ro.hardware':                 'qcom',
      'ro.build.fingerprint':        'samsung/dm1qxxx/dm1q:13/TP1A.220624.014/S911BXXU3CWC1:user/release-keys',
      'ro.build.description':        'dm1q-user 13 TP1A.220624.014 S911BXXU3CWC1 release-keys',
      'ro.build.display.id':         'TP1A.220624.014.S911BXXU3CWC1',
      'ro.build.id':                 'TP1A.220624.014',
      'ro.build.version.incremental':'S911BXXU3CWC1',
      'ro.build.tags':               'release-keys',
      'ro.build.type':               'user',
      'ro.build.user':               'dpi',
      'ro.build.host':               'SWDK9605',
      'ro.build.flavor':             'dm1qxxx-user',
      'ro.boot.hardware':            'qcom',
      'ro.product.cpu.abi':          'arm64-v8a',
    }
  };

  // Use passed profile, fallback to store lookup, then default
  let profile = profileArg || defaultProfile;
  if (!profile.buildProps) {
    try {
      const store = require('../models/instanceStore');
      const inst  = store.getAll().find(i => i.avdName === avdName);
      if (inst && inst.profile && inst.profile.buildProps) profile = inst.profile;
      else profile = defaultProfile;
    } catch (_) { profile = defaultProfile; }
  }

  const args = buildDockerArgs(adbPort, instanceId, profile);

  logger.debug(`[Redroid] docker ${args.join(' ')}`);

  const proc = spawn('docker', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let containerId = '';
  proc.stdout.on('data', d => { containerId += d.toString().trim(); });
  proc.stderr.on('data', d => logger.debug(`[Redroid] stderr: ${d.toString().trim()}`));

  await new Promise((resolve, reject) => {
    proc.on('exit',  code => code === 0 ? resolve() : reject(new Error(`docker run falhou (code ${code})`)));
    proc.on('error', reject);
  });

  containerId = containerId.trim().slice(0, 12);
  logger.info(`[Redroid] Container iniciado: ${cname} (${containerId}), ADB 127.0.0.1:${adbPort}`);
  runningProcesses.set(instanceId, { containerId: cname, adbPort });
  return proc;
}

// ─── Stop Container ───────────────────────────────────────────────────────────
async function stopEmulator(instanceId, adbPort) {
  const adbSerial = `127.0.0.1:${adbPort}`;
  logger.info(`[Redroid] Parando container ${adbSerial}...`);
  try {
    await execAsync(`${ADB} -s ${adbSerial} shell reboot -p 2>/dev/null || true`, { timeout: 8000 });
  } catch (_) {}
  const cname = containerName(instanceId);
  try {
    await execAsync(`docker stop ${cname} 2>/dev/null || true`);
    await execAsync(`docker rm   ${cname} 2>/dev/null || true`);
  } catch (_) {}
  try { await execAsync(`${ADB} disconnect ${adbSerial}`, { timeout: 5000 }); } catch (_) {}
  runningProcesses.delete(instanceId);
  logger.info(`[Redroid] Container ${cname} parado.`);
}

// ─── Build prop spoofing (runtime writable props only) ────────────────────────
async function applyBuildPropSpoofing(adbPort, profile) {
  // ro.* props are already set via docker run CMD args at container start
  // This function handles only runtime-writable props (gsm.*, debug.*, etc.)
  const adbSerial = `127.0.0.1:${adbPort}`;
  logger.info(`[Spoof] Props ro.* já injetadas via docker args em ${adbSerial}`);

  try {
    await execAsync(`${ADB} -s ${adbSerial} root`, { timeout: 10000 });
    await new Promise(r => setTimeout(r, 1500));
  } catch (_) {}

  // Only set runtime-writable props here
  const runtimeProps = {
    'gsm.operator.alpha': profile.networkOperator || 'Android',
    'gsm.network.type':   'LTE',
    'gsm.sim.state':      'READY',
    'gsm.operator.numeric': '72404',
  };

  for (const [k, v] of Object.entries(runtimeProps)) {
    try {
      await execAsync(`${ADB} -s ${adbSerial} shell "setprop '${k}' '${v}'"`, { timeout: 8000 });
    } catch (e) {
      logger.warn(`[Spoof] setprop ${k}: ${e.message}`);
    }
  }
  logger.info(`[Spoof] Runtime props aplicados em ${adbSerial}.`);
}

// ─── GPS ──────────────────────────────────────────────────────────────────────
async function setGPS(adbPort, lat, lng) {
  const serial = `127.0.0.1:${adbPort}`;
  try {
    // Enable mock locations
    await execAsync(
      `${ADB} -s ${serial} shell "settings put global development_settings_enabled 1"`,
      { timeout: 8000 }
    );
    await execAsync(
      `${ADB} -s ${serial} shell "settings put secure mock_location 1"`,
      { timeout: 8000 }
    );
    // Broadcast mock location
    await execAsync(
      `${ADB} -s ${serial} shell "am broadcast -a android.intent.action.MOCK_LOCATION --ef lat ${lat} --ef lng ${lng}"`,
      { timeout: 8000 }
    );
    logger.debug(`[GPS] ${serial} → ${lat},${lng}`);
  } catch (e) {
    logger.warn(`[GPS] Erro em ${serial}: ${e.message}`);
  }
}

// ─── Battery ──────────────────────────────────────────────────────────────────
async function setBattery(adbPort, level, status) {
  const serial = `127.0.0.1:${adbPort}`;
  try {
    await execAsync(`${ADB} -s ${serial} shell "dumpsys battery set level ${level}"`, { timeout: 8000 });
    const plugged = (status === 'charging') ? 1 : 0;
    await execAsync(`${ADB} -s ${serial} shell "dumpsys battery set ac ${plugged}"`, { timeout: 8000 });
    await execAsync(`${ADB} -s ${serial} shell "dumpsys battery set status ${plugged ? 2 : 3}"`, { timeout: 8000 });
    logger.debug(`[Battery] ${serial} → ${level}% ${status}`);
  } catch (e) {
    logger.warn(`[Battery] Erro em ${serial}: ${e.message}`);
  }
}

// ─── GSM ──────────────────────────────────────────────────────────────────────
async function setGSM(adbPort, { strength, operator }) {
  const serial = `127.0.0.1:${adbPort}`;
  try {
    if (operator) {
      await execAsync(`${ADB} -s ${serial} shell "setprop gsm.operator.alpha '${operator}'"`, { timeout: 8000 });
      await execAsync(`${ADB} -s ${serial} shell "setprop gsm.sim.operator.alpha '${operator}'"`, { timeout: 8000 });
    }
    if (strength !== undefined) {
      // signal strength: 0-4 mapped to dBm (-113 to -51)
      const dbm = -113 + (strength * 16);
      await execAsync(
        `${ADB} -s ${serial} shell "am broadcast -a android.intent.action.PHONE_STATE --ei signal_strength ${dbm}"`,
        { timeout: 8000 }
      );
    }
    logger.debug(`[GSM] ${serial} → operador=${operator}, sinal=${strength}`);
  } catch (e) {
    logger.warn(`[GSM] Erro em ${serial}: ${e.message}`);
  }
}

// ─── SMS injection ────────────────────────────────────────────────────────────
async function sendSMS(adbPort, from, message) {
  const serial = `127.0.0.1:${adbPort}`;
  try {
    await execAsync(
      `${ADB} -s ${serial} shell "am broadcast -a android.provider.Telephony.SMS_RECEIVED --es from '${from}' --es body '${message}'"`,
      { timeout: 8000 }
    );
    logger.debug(`[SMS] ${serial} ← de ${from}: ${message.substring(0, 30)}`);
  } catch (e) {
    logger.warn(`[SMS] Erro em ${serial}: ${e.message}`);
  }
}

// ─── Console (no-op para Redroid) ─────────────────────────────────────────────
function sendConsoleCommand(_port, _command) {
  return Promise.resolve('');
}

// ─── Wipe: remove /data Docker volume ───────────────────────────────────────
async function wipeAVD(avdName) {
  logger.info(`[Redroid] Limpando ${avdName}...`);
  const instanceId = avdName.replace('farm_', '').replace(/_/g, '-');
  const volumeName = `redroid-data-${instanceId.replace(/-/g, '').slice(0, 12)}`;
  try { await execAsync(`docker volume rm ${volumeName} 2>/dev/null || true`); } catch (_) {}
  // Also clean host data dir if it exists (legacy)
  const dataDir = path.join(FARM_DIR, 'instances', instanceId);
  if (fs.existsSync(dataDir)) {
    fs.rmSync(dataDir,  { recursive: true, force: true });
    fs.mkdirSync(dataDir, { recursive: true });
  }
  logger.info(`[Redroid] Wipe concluído para ${avdName}`);
}

// ─── Delete ───────────────────────────────────────────────────────────────────
async function deleteAVD(avdName) {
  logger.info(`[Redroid] Deletando ${avdName}...`);
  const instanceId = avdName.replace('farm_', '').replace(/_/g, '-');
  const cname      = containerName(instanceId);
  const volumeName = `redroid-data-${instanceId.replace(/-/g, '').slice(0, 12)}`;
  try { await execAsync(`docker rm -f ${cname} 2>/dev/null || true`); } catch (_) {}
  try { await execAsync(`docker volume rm ${volumeName} 2>/dev/null || true`); } catch (_) {}
  const dataDir = path.join(FARM_DIR, 'instances', instanceId);
  if (fs.existsSync(dataDir)) fs.rmSync(dataDir, { recursive: true, force: true });
  logger.info(`[Redroid] ${avdName} deletado.`);
}

// ─── Metrics ──────────────────────────────────────────────────────────────────
async function getEmulatorMetrics(adbPort) {
  const serial = `127.0.0.1:${adbPort}`;
  try {
    const { stdout: cpu } = await execAsync(
      `${ADB} -s ${serial} shell "top -bn1 | grep -i cpu"`, { timeout: 8000 });
    const { stdout: mem } = await execAsync(
      `${ADB} -s ${serial} shell "free -m | grep Mem"`,      { timeout: 8000 });
    return { cpu: cpu.trim(), mem: mem.trim() };
  } catch (_) {
    return { cpu: 'N/A', mem: 'N/A' };
  }
}

module.exports = {
  createAVD,
  startEmulator,
  stopEmulator,
  waitForEmulatorBoot,
  applyBuildPropSpoofing,
  applyConfigIni,
  setGPS,
  setBattery,
  setGSM,
  sendSMS,
  wipeAVD,
  deleteAVD,
  getEmulatorMetrics,
  sendConsoleCommand,
  findFreePort,
  runningProcesses,
};
