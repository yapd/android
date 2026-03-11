/**
 * Persistent Instance Store — uses JSON file for state persistence
 * Falls back gracefully if file is unreadable.
 */
const { v4: uuidv4 } = require('uuid');
const fs   = require('fs');
const path = require('path');

const STORE_FILE = process.env.INSTANCE_STORE_FILE
  || path.join(process.env.FARM_BASE_DIR || '/opt/android-farm', 'instances', 'store.json');

function loadFromDisk() {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, 'utf8');
      const arr = JSON.parse(raw);
      const map = new Map();
      for (const inst of arr) {
        // Reset transient running states on load (process died on restart)
        if (['running', 'starting', 'stopping', 'creating'].includes(inst.status)) {
          inst.status = 'stopped';
          inst.pid    = null;
        }
        // Limpa erro de "Timeout aguardando boot" (versão antiga usava emulator-PORT)
        if (inst.error && inst.error.includes('Timeout aguardando boot do emulador emulator-')) {
          inst.error  = null;
          inst.status = 'stopped';
        }
        map.set(inst.id, inst);
      }
      return map;
    }
  } catch (e) {
    console.error('[InstanceStore] Could not load from disk:', e.message);
  }
  return new Map();
}

function saveToDisk(map) {
  try {
    const dir = path.dirname(STORE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STORE_FILE, JSON.stringify(Array.from(map.values()), null, 2), 'utf8');
  } catch (e) {
    console.error('[InstanceStore] Could not save to disk:', e.message);
  }
}

class InstanceStore {
  constructor() {
    this.instances = loadFromDisk();
  }

  create(data) {
    const id = uuidv4();
    const instance = {
      id,
      name:            data.name            || `Farm-${id.slice(0, 8)}`,
      avdName:         data.avdName         || `avd_${id.slice(0, 8)}`,
      status:          'creating',
      profile:         data.profile         || null,
      emulatorPort:    data.emulatorPort     || null,
      adbPort:         null,
      wsScrcpyPort:    data.wsScrcpyPort     || null,
      pid:             null,
      createdAt:       new Date().toISOString(),
      lastStartedAt:   null,
      cpuUsage:        0,
      ramUsageMb:      0,
      gpsLat:          data.gpsLat          || -23.5505,
      gpsLng:          data.gpsLng          || -46.6333,
      batteryLevel:    data.batteryLevel     || 85,
      batteryStatus:   data.batteryStatus    || 'charging',
      networkOperator: data.networkOperator  || 'Android',
      networkStrength: data.networkStrength  || 4,
      error:           null,
    };
    this.instances.set(id, instance);
    saveToDisk(this.instances);
    return instance;
  }

  getById(id)  { return this.instances.get(id) || null; }
  getAll()     { return Array.from(this.instances.values()); }

  update(id, patch) {
    const inst = this.instances.get(id);
    if (!inst) return null;
    const updated = { ...inst, ...patch };
    this.instances.set(id, updated);
    saveToDisk(this.instances);
    return updated;
  }

  delete(id) {
    const result = this.instances.delete(id);
    saveToDisk(this.instances);
    return result;
  }
}

const store = new InstanceStore();
module.exports = store;
