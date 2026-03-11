/**
 * AVD Service — Gerenciamento de Android Virtual Devices
 * Orquestra criação, start, stop e spoofing de emuladores.
 */
const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');
const net = require('net');
const logger = require('../utils/logger');

const execAsync = promisify(exec);

const SDK_ROOT  = process.env.ANDROID_SDK_ROOT || '/opt/android-farm/sdk';
const AVD_HOME  = process.env.ANDROID_AVD_HOME || '/opt/android-farm/avds';
const FARM_DIR  = process.env.FARM_BASE_DIR    || '/opt/android-farm';

const SDKMANAGER = path.join(SDK_ROOT, 'cmdline-tools/latest/bin/sdkmanager');
const AVDMANAGER = path.join(SDK_ROOT, 'cmdline-tools/latest/bin/avdmanager');
const EMULATOR   = path.join(SDK_ROOT, 'emulator/emulator');
const ADB        = path.join(SDK_ROOT, 'platform-tools/adb');

const SYSTEM_IMAGE = 'system-images;android-33;google_apis_playstore;arm64-v8a';
const BASE_PORT    = parseInt(process.env.EMULATOR_BASE_PORT || '5554', 10);
const MAX_INSTANCES = parseInt(process.env.MAX_INSTANCES || '20', 10);

// Mapa de processos em execução: instanceId → ChildProcess
const runningProcesses = new Map();

// ─── Utilitários ──────────────────────────────────────────────────────────────
function getEnv() {
  return {
    ...process.env,
    ANDROID_SDK_ROOT: SDK_ROOT,
    ANDROID_HOME: SDK_ROOT,
    ANDROID_AVD_HOME: AVD_HOME,
    JAVA_HOME: process.env.JAVA_HOME || '/usr/lib/jvm/java-17-openjdk-arm64',
    PATH: `${SDK_ROOT}/cmdline-tools/latest/bin:${SDK_ROOT}/emulator:${SDK_ROOT}/platform-tools:${process.env.PATH}`,
  };
}

async function findFreePort(start = BASE_PORT) {
  // Portas do emulador são sempre pares (console+adb)
  for (let p = start; p < start + MAX_INSTANCES * 2; p += 2) {
    const free = await isPortFree(p);
    if (free) return p;
  }
  throw new Error('Nenhuma porta livre disponível para o emulador.');
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, '127.0.0.1');
  });
}

async function waitForEmulatorBoot(port, timeoutMs = 300000) {
  const adbSerial = `emulator-${port}`;
  const deadline = Date.now() + timeoutMs;
  logger.info(`[AVD] Aguardando boot do emulador ${adbSerial}...`);

  while (Date.now() < deadline) {
    try {
      const { stdout } = await execAsync(
        `${ADB} -s ${adbSerial} shell getprop sys.boot_completed`,
        { env: getEnv(), timeout: 10000 }
      );
      if (stdout.trim() === '1') {
        logger.info(`[AVD] Emulador ${adbSerial} bootou com sucesso!`);
        return true;
      }
    } catch (_) {
      // ainda aguardando
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`Timeout aguardando boot do emulador ${adbSerial}`);
}

// ─── Criação do AVD ───────────────────────────────────────────────────────────
async function createAVD(instanceId, name, profile) {
  const avdName = `farm_${instanceId.replace(/-/g, '_')}`;
  const avdDir  = path.join(AVD_HOME, `${avdName}.avd`);

  logger.info(`[AVD] Criando AVD: ${avdName} (perfil: ${profile.id})`);

  // Cria o AVD via avdmanager
  const cmd = [
    AVDMANAGER, '--silent', 'create', 'avd',
    '--name', avdName,
    '--package', SYSTEM_IMAGE,
    '--device', profile.avdDevice || 'pixel_6',
    '--force',
    '--path', avdDir,
  ].join(' ');

  await execAsync(`echo "no" | ${cmd}`, { env: getEnv(), timeout: 120000 });
  logger.info(`[AVD] AVD ${avdName} criado em ${avdDir}`);

  // ── Aplicar config.ini do perfil ─────────────────────────────────────────
  await applyConfigIni(avdName, avdDir, profile);

  return { avdName, avdDir };
}

async function applyConfigIni(avdName, avdDir, profile) {
  const configPath = path.join(avdDir, 'config.ini');

  // Lê config existente
  let config = '';
  if (fs.existsSync(configPath)) {
    config = fs.readFileSync(configPath, 'utf8');
  }

  const overrides = {
    'hw.device.name':    profile.avdDevice || 'pixel_6',
    'hw.ramSize':        String(profile.ram || 4096),
    'hw.gpu.enabled':    'yes',
    'hw.gpu.mode':       'swiftshader_indirect',
    'hw.keyboard':       'yes',
    'hw.sensors.proximity':     'yes',
    'hw.sensors.accelerometer': 'yes',
    'hw.sensors.gyroscope':     'yes',
    'hw.sensors.magnetic_field':'yes',
    'hw.gsmModem':       'yes',
    'hw.gps':            'yes',
    'hw.battery':        'yes',
    'hw.camera.back':    'emulated',
    'hw.camera.front':   'emulated',
    'disk.dataPartition.size': '8192M',
    // Tela
    'hw.lcd.width':      String(profile.screenWidth || 1080),
    'hw.lcd.height':     String(profile.screenHeight || 1920),
    'hw.lcd.density':    String(profile.screenDpi || 420),
    // Spoofing de fabricante a nível de config
    'hw.product.manufacturer': profile.manufacturer,
    'hw.product.model':        profile.model,
  };

  // Parse e merge no config.ini
  const lines = config.split('\n');
  const configMap = {};
  for (const line of lines) {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) configMap[match[1].trim()] = match[2].trim();
  }

  const merged = { ...configMap, ...overrides };
  const newConfig = Object.entries(merged)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n') + '\n';

  fs.writeFileSync(configPath, newConfig, 'utf8');
  logger.info(`[AVD] config.ini aplicado para ${avdName}`);
}

// ─── Iniciar Emulador ─────────────────────────────────────────────────────────
async function startEmulator(instanceId, avdName, emulatorPort) {
  logger.info(`[AVD] Iniciando emulador ${avdName} na porta ${emulatorPort}...`);

  const args = [
    '-avd', avdName,
    '-port', String(emulatorPort),
    '-no-window',
    '-no-audio',
    '-no-boot-anim',
    '-gpu', 'swiftshader_indirect',
    '-memory', '4096',
    '-cores', '2',
    '-accel', 'auto',
    '-no-snapshot-save',
  ];

  const proc = spawn(EMULATOR, args, {
    env: getEnv(),
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  runningProcesses.set(instanceId, proc);

  proc.stdout.on('data', (d) => logger.debug(`[EMU-${emulatorPort}] ${d.toString().trim()}`));
  proc.stderr.on('data', (d) => logger.debug(`[EMU-${emulatorPort}] ${d.toString().trim()}`));

  proc.on('exit', (code) => {
    logger.warn(`[AVD] Emulador ${avdName} encerrado com código ${code}`);
    runningProcesses.delete(instanceId);
  });

  return proc;
}

// ─── Parar Emulador ───────────────────────────────────────────────────────────
async function stopEmulator(instanceId, emulatorPort) {
  const adbSerial = `emulator-${emulatorPort}`;
  logger.info(`[AVD] Parando emulador ${adbSerial}...`);

  try {
    await execAsync(`${ADB} -s ${adbSerial} emu kill`, {
      env: getEnv(), timeout: 15000,
    });
  } catch (_) { /* pode já estar morto */ }

  const proc = runningProcesses.get(instanceId);
  if (proc) {
    try { proc.kill('SIGTERM'); } catch (_) {}
    runningProcesses.delete(instanceId);
  }
  logger.info(`[AVD] Emulador ${adbSerial} parado.`);
}

// ─── Aplicar Build.prop (Spoofing) ────────────────────────────────────────────
async function applyBuildPropSpoofing(emulatorPort, profile) {
  const adbSerial = `emulator-${emulatorPort}`;
  logger.info(`[SPOOF] Injetando build.prop no emulador ${adbSerial}...`);

  // Remonta /system como leitura-escrita
  try {
    await execAsync(`${ADB} -s ${adbSerial} root`, { env: getEnv(), timeout: 10000 });
    await new Promise((r) => setTimeout(r, 2000));
    await execAsync(`${ADB} -s ${adbSerial} remount`, { env: getEnv(), timeout: 10000 });
  } catch (e) {
    logger.warn(`[SPOOF] remount falhou (pode ser normal): ${e.message}`);
  }

  const props = profile.buildProps || {};
  const cmds = Object.entries(props).map(
    ([k, v]) => `${ADB} -s ${adbSerial} shell "setprop ${k} '${v}'"`
  );

  for (const cmd of cmds) {
    try {
      await execAsync(cmd, { env: getEnv(), timeout: 8000 });
    } catch (e) {
      logger.warn(`[SPOOF] setprop falhou: ${e.message}`);
    }
  }

  logger.info(`[SPOOF] Build.prop aplicado para ${adbSerial}.`);
}

// ─── GPS Spoofing ─────────────────────────────────────────────────────────────
async function setGPS(emulatorPort, lat, lng) {
  return sendConsoleCommand(emulatorPort, `geo fix ${lng} ${lat}`);
}

// ─── Battery Spoofing ─────────────────────────────────────────────────────────
async function setBattery(emulatorPort, level, status) {
  const statusMap = { charging: 'charging', discharging: 'not-charging', full: 'full' };
  const s = statusMap[status] || 'charging';
  await sendConsoleCommand(emulatorPort, `power capacity ${level}`);
  await sendConsoleCommand(emulatorPort, `power status ${s}`);
}

// ─── GSM Spoofing ─────────────────────────────────────────────────────────────
async function setGSM(emulatorPort, { strength, operator }) {
  if (strength !== undefined) {
    await sendConsoleCommand(emulatorPort, `gsm signal ${strength}`);
  }
  if (operator) {
    await sendConsoleCommand(emulatorPort, `gsm operator ${operator}`);
  }
}

// ─── Injetar SMS ──────────────────────────────────────────────────────────────
async function sendSMS(emulatorPort, from, message) {
  return sendConsoleCommand(emulatorPort, `sms send ${from} "${message}"`);
}

// ─── Console Telnet ──────────────────────────────────────────────────────────
function sendConsoleCommand(emulatorPort, command) {
  return new Promise((resolve, reject) => {
    const consolePort = emulatorPort; // porta de console = porta do emulador
    const client = net.createConnection({ port: consolePort, host: '127.0.0.1' });
    let buffer = '';
    let authenticated = false;

    const timeout = setTimeout(() => {
      client.destroy();
      reject(new Error(`Timeout no console do emulador (porta ${consolePort})`));
    }, 10000);

    client.on('connect', () => {
      logger.debug(`[CONSOLE] Conectado ao emulador na porta ${consolePort}`);
    });

    client.on('data', (data) => {
      buffer += data.toString();
      // Aguarda o prompt "OK" antes de autenticar
      if (!authenticated && buffer.includes('OK')) {
        authenticated = true;
        client.write(`auth $(cat ~/.emulator_console_auth_token 2>/dev/null || echo '')\n`);
        setTimeout(() => {
          client.write(`${command}\n`);
        }, 200);
      }
      if (authenticated && buffer.includes('OK\r\n') && buffer.split('OK').length > 2) {
        clearTimeout(timeout);
        client.write('quit\n');
        client.end();
        resolve(buffer);
      }
    });

    client.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    client.on('close', () => {
      clearTimeout(timeout);
      resolve(buffer);
    });
  });
}

// ─── Wipe AVD Data ────────────────────────────────────────────────────────────
async function wipeAVD(avdName) {
  logger.info(`[AVD] Limpando dados do AVD ${avdName}...`);
  const avdDir = path.join(AVD_HOME, `${avdName}.avd`);
  const filesToDelete = ['userdata.img', 'userdata-qemu.img', 'cache.img', 'sdcard.img'];

  for (const f of filesToDelete) {
    const fp = path.join(avdDir, f);
    if (fs.existsSync(fp)) {
      fs.unlinkSync(fp);
      logger.debug(`[AVD] Removido: ${fp}`);
    }
  }
  logger.info(`[AVD] Wipe concluído para ${avdName}.`);
}

// ─── Excluir AVD ──────────────────────────────────────────────────────────────
async function deleteAVD(avdName) {
  logger.info(`[AVD] Excluindo AVD ${avdName}...`);
  try {
    await execAsync(`${AVDMANAGER} delete avd --name ${avdName}`, {
      env: getEnv(), timeout: 30000,
    });
  } catch (e) {
    logger.warn(`[AVD] avdmanager delete falhou: ${e.message}`);
  }

  // Força remoção do diretório
  const avdDir = path.join(AVD_HOME, `${avdName}.avd`);
  if (fs.existsSync(avdDir)) {
    fs.rmSync(avdDir, { recursive: true, force: true });
  }
  const iniFile = path.join(AVD_HOME, `${avdName}.ini`);
  if (fs.existsSync(iniFile)) fs.unlinkSync(iniFile);

  logger.info(`[AVD] AVD ${avdName} excluído.`);
}

// ─── Métricas do Emulador ─────────────────────────────────────────────────────
async function getEmulatorMetrics(emulatorPort) {
  const adbSerial = `emulator-${emulatorPort}`;
  try {
    const { stdout: cpu } = await execAsync(
      `${ADB} -s ${adbSerial} shell "top -bn1 | grep 'Cpu\\|cpu'"`,
      { env: getEnv(), timeout: 8000 }
    );
    const { stdout: mem } = await execAsync(
      `${ADB} -s ${adbSerial} shell "free -m | grep Mem"`,
      { env: getEnv(), timeout: 8000 }
    );
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
