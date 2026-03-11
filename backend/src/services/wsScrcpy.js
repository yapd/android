/**
 * ws-scrcpy bridge
 * Inicia scrcpy em modo headless e expõe via WebSocket
 * para controle remoto no browser (Paper View)
 */
const WebSocket  = require('ws');
const { spawn }  = require('child_process');
const net        = require('net');
const logger     = require('./logger') || console;

const ADB = '/opt/android-farm/sdk/platform-tools/adb';
const WS_PORT = parseInt(process.env.SCRCPY_WS_PORT || '8886', 10);

let wss = null;

function startWsScrcpy() {
  if (wss) return;

  wss = new WebSocket.Server({ port: WS_PORT }, () => {
    console.log(`[ws-scrcpy] WebSocket server listening on ws://0.0.0.0:${WS_PORT}`);
  });

  wss.on('connection', (ws, req) => {
    // Query: ?port=5554
    const url    = new URL(req.url, `http://localhost`);
    const adbPort = url.searchParams.get('port') || '5554';
    const serial  = `127.0.0.1:${adbPort}`;

    console.log(`[ws-scrcpy] New client for device ${serial}`);

    // Start scrcpy in server mode on the device
    // scrcpy --tcpip forwards H264 stream over the ADB socket
    const scrcpy = spawn('scrcpy', [
      '--serial', serial,
      '--no-display',
      '--bit-rate', '2M',
      '--max-size', '720',
      '--record', `/tmp/scrcpy-${adbPort}.mp4`,
      '--record-format', 'mp4',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    scrcpy.stdout.on('data', d => ws.readyState === WebSocket.OPEN && ws.send(d));
    scrcpy.stderr.on('data', d => console.log(`[scrcpy:${adbPort}] ${d.toString().trim()}`));

    ws.on('close', () => { scrcpy.kill(); console.log(`[ws-scrcpy] Client disconnected ${serial}`); });
    ws.on('error', () => scrcpy.kill());

    scrcpy.on('exit', code => {
      console.log(`[ws-scrcpy] scrcpy exited (${code}) for ${serial}`);
      if (ws.readyState === WebSocket.OPEN) ws.close();
    });
  });
}

function stopWsScrcpy() {
  if (wss) { wss.close(); wss = null; }
}

module.exports = { startWsScrcpy, stopWsScrcpy, WS_PORT };
