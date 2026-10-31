import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface PairedDevice {
  token: string;
  deviceId: string;
  deviceName: string;
  client: string;
  pairedAt: string;
  lastSeen: string;
  pairedLocally: boolean;
}

function getDevicesFilePath(): string {
  const custom = process.env.DATA_DIR;
  const targetDir = custom || path.join(process.cwd(), 'data');

  try {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    fs.accessSync(targetDir, fs.constants.W_OK);
    return path.join(targetDir, 'devices.json');
  } catch {
    const fallbackDir = path.join('/tmp', 'homeflix-data');
    if (!fs.existsSync(fallbackDir)) {
      fs.mkdirSync(fallbackDir, { recursive: true });
    }
    return path.join(fallbackDir, 'devices.json');
  }
}

export function loadDevices(): Record<string, PairedDevice> {
  const filePath = getDevicesFilePath();
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) || {};
    }
  } catch (e) {
    console.error('Failed reading devices.json:', e);
  }
  return {};
}

export function saveDevices(devices: Record<string, PairedDevice>): void {
  const filePath = getDevicesFilePath();
  try {
    const tmp = `${filePath}.tmp.${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(devices, null, 2), { encoding: 'utf-8', mode: 0o600 });
    fs.renameSync(tmp, filePath);
  } catch (e) {
    console.error('Failed saving devices.json:', e);
  }
}

export function registerDevice(
  deviceId: string,
  deviceName: string,
  client = 'android',
  pairedLocally = true
): PairedDevice {
  const devices = loadDevices();
  const cleanId = (deviceId || '').trim();

  // If this device was already paired, update its record
  for (const dev of Object.values(devices)) {
    if (dev.deviceId === cleanId && cleanId.length > 0) {
      dev.deviceName = deviceName || dev.deviceName;
      dev.lastSeen = new Date().toISOString();
      saveDevices(devices);
      return dev;
    }
  }

  // Generate a cryptographically secure token
  const token = `hst_dev_${crypto.randomBytes(24).toString('hex')}`;
  const now = new Date().toISOString();
  const newDevice: PairedDevice = {
    token,
    deviceId: cleanId || crypto.randomUUID(),
    deviceName: deviceName || 'HomeStream Mobile Device',
    client,
    pairedAt: now,
    lastSeen: now,
    pairedLocally,
  };

  devices[token] = newDevice;
  saveDevices(devices);
  return newDevice;
}

export function isValidDeviceToken(token: string): boolean {
  if (!token || typeof token !== 'string' || !/^hst_dev_[a-f0-9]{48}$/.test(token)) return false;
  const devices = loadDevices();
  const dev = Object.prototype.hasOwnProperty.call(devices, token) ? devices[token] : undefined;
  if (dev && dev.token === token && dev.client !== 'android-jellyfin') {
    // Avoid rewriting device credentials for every image or progress request.
    if (Date.now() - Date.parse(dev.lastSeen) > 60000) {
      dev.lastSeen = new Date().toISOString();
      saveDevices(devices);
    }
    return true;
  }
  return false;
}
