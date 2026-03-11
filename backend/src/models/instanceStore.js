/**
 * In-Memory Instance Store (substituível por SQLite/PostgreSQL)
 */
const { v4: uuidv4 } = require('uuid');

class InstanceStore {
  constructor() {
    this.instances = new Map();
  }

  create(data) {
    const id = uuidv4();
    const instance = {
      id,
      name: data.name || `Farm-${id.slice(0, 8)}`,
      avdName: data.avdName || `avd_${id.slice(0, 8)}`,
      status: 'creating',         // creating | stopped | starting | running | error
      profile: data.profile || null,
      emulatorPort: data.emulatorPort || null,
      adbPort: null,
      wsScrcpyPort: data.wsScrcpyPort || null,
      pid: null,
      createdAt: new Date().toISOString(),
      lastStartedAt: null,
      cpuUsage: 0,
      ramUsageMb: 0,
      gpsLat: data.gpsLat || -23.5505,
      gpsLng: data.gpsLng || -46.6333,
      batteryLevel: data.batteryLevel || 85,
      batteryStatus: data.batteryStatus || 'charging',
      networkOperator: data.networkOperator || 'Android',
      networkStrength: data.networkStrength || 4,
      error: null,
    };
    this.instances.set(id, instance);
    return instance;
  }

  getById(id) {
    return this.instances.get(id) || null;
  }

  getAll() {
    return Array.from(this.instances.values());
  }

  update(id, patch) {
    const inst = this.instances.get(id);
    if (!inst) return null;
    const updated = { ...inst, ...patch };
    this.instances.set(id, updated);
    return updated;
  }

  delete(id) {
    return this.instances.delete(id);
  }
}

// Singleton
const store = new InstanceStore();
module.exports = store;
