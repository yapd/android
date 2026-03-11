/**
 * WsScrcpyService — WebSocket bridge for scrcpy remote control
 *
 * Architecture:
 *   Browser ←→ WebSocket (port 8886) ←→ scrcpy-server on Android device
 *
 * For each connected instance:
 *   1. Push scrcpy-server.jar to the device
 *   2. Start scrcpy-server in "no-display" mode
 *   3. Forward scrcpy local socket via ADB
 *   4. Bridge that TCP socket ↔ WebSocket client
 *
 * Usage (standalone):  node wsScrcpyService.js
 * Usage (from server): require('./wsScrcpyService').startWsScrcpy(httpServer)
 */

const { WebSocketServer } = require('ws');
const net     = require('net');
const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const path    = require('path');
const fs      = require('fs');
const logger  = require('../utils/logger');

const execAsync = promisify(exec);

const ADB           = path.join(
  process.env.ANDROID_SDK_ROOT || '/opt/android-farm/sdk',
  'platform-tools/adb'
);
const SCRCPY_SERVER = '/usr/share/scrcpy/scrcpy-server';
const SCRCPY_VERSION = '1.21';
const WS_PORT        = parseInt(process.env.WS_SCRCPY_BASE_PORT || '8886', 10);

// Map adbSerial → { forwardPort, scrcpyProc }
const sessions = new Map();

// ─── Push scrcpy-server.jar and start it on device ───────────────────────────
async function startScrcpyServer(adbSerial) {
  // Push scrcpy-server if not already there
  try {
    await execAsync(
      `${ADB} -s ${adbSerial} push ${SCRCPY_SERVER} /data/local/tmp/scrcpy-server.jar`,
      { timeout: 15000 }
    );
  } catch (e) {
    logger.warn(`[WsScrcpy] push failed for ${adbSerial}: ${e.message}`);
  }

  // Find a free local port for the TCP forward
  let localPort = 27183;
  for (let p = 27183; p < 27283; p++) {
    try {
      await execAsync(`ss -tlnp | grep :${p}`, { timeout: 3000 });
    } catch (_) {
      localPort = p;
      break;
    }
  }

  // ADB forward: local TCP port → Android abstract socket scrcpy
  await execAsync(
    `${ADB} -s ${adbSerial} forward tcp:${localPort} localabstract:scrcpy`,
    { timeout: 8000 }
  );

  // Start scrcpy-server on device
  const scrcpyProc = spawn(ADB, [
    '-s', adbSerial,
    'shell',
    `CLASSPATH=/data/local/tmp/scrcpy-server.jar`,
    `app_process`,
    `/`,
    `com.genymobile.scrcpy.Server`,
    SCRCPY_VERSION,
    `log_level=info`,
    `bit_rate=2000000`,
    `tunnel_forward=true`,
    `control=true`,
    `stay_awake=false`,
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  scrcpyProc.stdout.on('data', d => logger.debug(`[WsScrcpy] ${adbSerial}: ${d.toString().trim()}`));
  scrcpyProc.stderr.on('data', d => logger.debug(`[WsScrcpy] ${adbSerial} err: ${d.toString().trim()}`));

  // Wait for the server to be ready
  await new Promise(r => setTimeout(r, 1500));

  return { localPort, scrcpyProc };
}

// ─── Bridge WebSocket ↔ TCP socket ───────────────────────────────────────────
function bridgeWsToTcp(ws, localPort, adbSerial) {
  const tcp = net.connect(localPort, '127.0.0.1');

  tcp.on('connect', () => {
    logger.info(`[WsScrcpy] TCP bridge established ${adbSerial}:${localPort}`);
  });

  tcp.on('data', data => {
    if (ws.readyState === ws.OPEN) ws.send(data);
  });

  tcp.on('close', () => {
    logger.info(`[WsScrcpy] TCP closed for ${adbSerial}`);
    if (ws.readyState === ws.OPEN) ws.close();
  });

  tcp.on('error', err => {
    logger.warn(`[WsScrcpy] TCP error ${adbSerial}: ${err.message}`);
    if (ws.readyState === ws.OPEN) ws.close();
  });

  ws.on('message', data => {
    if (tcp.writable) tcp.write(data);
  });

  ws.on('close', () => {
    logger.info(`[WsScrcpy] WS closed for ${adbSerial}`);
    tcp.destroy();
  });

  ws.on('error', err => {
    logger.warn(`[WsScrcpy] WS error ${adbSerial}: ${err.message}`);
    tcp.destroy();
  });
}

// ─── Start WebSocket Server ───────────────────────────────────────────────────
/**
 * @param {http.Server} httpServer  — attach to existing HTTP server (optional)
 * @param {number}      port        — port if running standalone
 */
function startWsScrcpy(httpServer = null, port = WS_PORT) {
  const wssOptions = httpServer
    ? { server: httpServer, path: '/ws-scrcpy' }
    : { port, host: '0.0.0.0' };

  const wss = new WebSocketServer(wssOptions);

  wss.on('listening', () => {
    const addr = httpServer
      ? `HTTP server path /ws-scrcpy`
      : `ws://0.0.0.0:${port}`;
    logger.info(`[WsScrcpy] WebSocket server listening on ${addr}`);
  });

  /**
   * URL format: ws://<host>:<port>/ws-scrcpy?serial=127.0.0.1:5554
   * The client passes the ADB serial of the target device.
   */
  wss.on('connection', async (ws, req) => {
    const params = new URL(req.url || '/', `http://localhost`).searchParams;
    let adbSerial = params.get('serial') || '';

    // Default to first running device if no serial specified
    if (!adbSerial) {
      try {
        const { stdout } = await execAsync(`${ADB} devices | grep device$ | head -1 | awk '{print $1}'`);
        adbSerial = stdout.trim();
      } catch (_) {}
    }

    if (!adbSerial) {
      ws.close(1008, 'No ADB device serial specified');
      return;
    }

    logger.info(`[WsScrcpy] New connection → ${adbSerial}`);

    try {
      // Reuse existing session if available
      let session = sessions.get(adbSerial);
      if (!session) {
        session = await startScrcpyServer(adbSerial);
        sessions.set(adbSerial, session);
      }
      bridgeWsToTcp(ws, session.localPort, adbSerial);
    } catch (err) {
      logger.error(`[WsScrcpy] Setup failed for ${adbSerial}: ${err.message}`);
      ws.close(1011, `Setup failed: ${err.message}`);
    }
  });

  wss.on('error', err => {
    logger.error(`[WsScrcpy] Server error: ${err.message}`);
  });

  return wss;
}

// ─── Cleanup on stop ──────────────────────────────────────────────────────────
async function stopScrcpySession(adbSerial) {
  const session = sessions.get(adbSerial);
  if (session) {
    try { session.scrcpyProc.kill(); } catch (_) {}
    try {
      await execAsync(`${ADB} -s ${adbSerial} forward --remove tcp:${session.localPort}`);
    } catch (_) {}
    sessions.delete(adbSerial);
    logger.info(`[WsScrcpy] Session stopped for ${adbSerial}`);
  }
}

module.exports = { startWsScrcpy, stopScrcpySession };
