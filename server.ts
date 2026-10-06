import express, { Request, Response } from 'express';
import http from 'http';
import net from 'net';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { GpsDevice, GpsPosition, Geofence, GpsAlert, CryptoPacketLog, TelemetryStats } from './src/types/gps';
import {
  generateDebianSystemdService,
  generateDebianMosquittoConf,
  generateDebianPythonScript,
  generateDebianInstallScript,
  AEGIS_APP_VERSION,
} from './src/utils/debianScripts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const TCP_PORT = parseInt(process.env.TCP_PORT || '5023', 10);

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// --- In-Memory Database & State ---

const devices: Map<string, GpsDevice> = new Map([
  [
    'dev-mercedes-7741',
    {
      id: 'dev-mercedes-7741',
      imei: '864201048821093',
      name: 'Camión Frigo Actros (Madrid-Zaragoza)',
      model: 'Teltonika FMC130 (Debian Gateway)',
      vehicleType: 'truck',
      protocol: 'aes-encrypted-json',
      aesKeyHex: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      speedLimit: 90,
      status: 'moving',
      color: '#06b6d4', // cyan-500
      activeGeofences: [],
    },
  ],
  [
    'dev-debian-patrol-04',
    {
      id: 'dev-debian-patrol-04',
      imei: '861928051283002',
      name: 'Unidad Móvil Debian IoT-04',
      model: 'Raspberry Pi 4 + Quectel EC25 (Debian 12)',
      vehicleType: 'car',
      protocol: 'aes-encrypted-json',
      aesKeyHex: 'a4f107bb4c3a27f6e0c98f8216d4e2a901fbc34d88e051e941a329d8924b17aa',
      speedLimit: 50,
      status: 'moving',
      color: '#10b981', // emerald-500
      activeGeofences: [],
    },
  ],
  [
    'dev-logis-van-92',
    {
      id: 'dev-logis-van-92',
      imei: '357281098471203',
      name: 'Furgoneta Reparto Express M-30',
      model: 'Quectel BG95 MQTT-TLS Client',
      vehicleType: 'van',
      protocol: 'mqtt-tls',
      aesKeyHex: '5f4dcc3b5aa765d61d8327deb882cf992b321a4f02d4f2d78a9c2b43d2c88421',
      speedLimit: 70,
      status: 'moving',
      color: '#f59e0b', // amber-500
      activeGeofences: [],
    },
  ],
  [
    'dev-drone-alpha',
    {
      id: 'dev-drone-alpha',
      imei: '869018274019284',
      name: 'Dron Inspección Perimetral',
      model: 'Pixhawk 4 GNSS + Debian Companion',
      vehicleType: 'drone',
      protocol: 'teltonika-avl',
      aesKeyHex: 'c8f7a6b5d4e3f2a10987654321fedcba1234567890abcdef1234567890abcdef',
      speedLimit: 60,
      status: 'moving',
      color: '#8b5cf6', // purple-500
      activeGeofences: [],
    },
  ],
]);

const positionsHistory: Map<string, GpsPosition[]> = new Map();

const geofences: Map<string, Geofence> = new Map([
  [
    'geo-coslada',
    {
      id: 'geo-coslada',
      name: 'Centro Logístico Coslada / Madrid',
      type: 'polygon',
      coordinates: [
        [40.435, -3.555],
        [40.442, -3.542],
        [40.430, -3.535],
        [40.422, -3.548],
      ],
      color: '#06b6d4',
      speedLimit: 40,
      alertOnEnter: true,
      alertOnExit: true,
      description: 'Área de carga y descarga prioritaria',
    },
  ],
  [
    'geo-barajas',
    {
      id: 'geo-barajas',
      name: 'Zona Restringida Aeroportuaria Barajas',
      type: 'circle',
      center: [40.492, -3.568],
      radius: 2200,
      color: '#ef4444',
      speedLimit: 30,
      alertOnEnter: true,
      alertOnExit: false,
      description: 'Espacio aéreo y terrestre de seguridad crítica',
    },
  ],
  [
    'geo-zaragoza',
    {
      id: 'geo-zaragoza',
      name: 'Depósito Intermodal Zaragoza PLAZA',
      type: 'circle',
      center: [41.645, -0.985],
      radius: 1800,
      color: '#10b981',
      speedLimit: 50,
      alertOnEnter: true,
      alertOnExit: true,
      description: 'Terminal ferroviaria y plataforma logística',
    },
  ],
]);

const alerts: GpsAlert[] = [];
const cryptoLogs: CryptoPacketLog[] = [];
let totalPacketsDecrypted = 0;
let totalDecryptionTimeMs = 0;
let simulationRunning = true;
let tcpServerStatus: 'listening' | 'error' | 'disabled' = 'disabled';

// SSE Clients List
const sseClients: Response[] = [];

function broadcastSse(eventType: string, data: unknown) {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (let i = sseClients.length - 1; i >= 0; i--) {
    const res = sseClients[i];
    try {
      res.write(payload);
    } catch {
      sseClients.splice(i, 1);
    }
  }
}

// --- Cryptographic AES Engine ---

/**
 * Decrypts AES-256-GCM encrypted payload
 */
export function decryptAesGcm(
  ciphertextHex: string,
  ivHex: string,
  authTagHex: string,
  keyHex: string
): { success: boolean; plaintext?: string; error?: string } {
  try {
    const key = Buffer.from(keyHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const ciphertext = Buffer.from(ciphertextHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    if (key.length !== 32) {
      return { success: false, error: 'Key must be 32 bytes (256-bit)' };
    }

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, undefined, 'utf8');
    decrypted += decipher.final('utf8');

    return { success: true, plaintext: decrypted };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Decryption failed';
    return { success: false, error: message };
  }
}

/**
 * Encrypts data with AES-256-GCM (server utility)
 */
export function encryptAesGcm(
  plaintext: string,
  keyHex: string
): { ciphertextHex: string; ivHex: string; authTagHex: string } {
  const key = Buffer.from(keyHex, 'hex');
  const iv = crypto.randomBytes(12); // 96-bit standard IV for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return {
    ciphertextHex: ciphertext,
    ivHex: iv.toString('hex'),
    authTagHex: authTag.toString('hex'),
  };
}

// --- Geofence & Alert Evaluator ---

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function isPointInPolygon(point: [number, number], vs: [number, number][]): boolean {
  const x = point[0];
  const y = point[1];
  let inside = false;

  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i][0];
    const yi = vs[i][1];
    const xj = vs[j][0];
    const yj = vs[j][1];

    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}

function checkGeofence(lat: number, lng: number, gf: Geofence): boolean {
  if (gf.type === 'circle' && gf.center && gf.radius) {
    return calculateDistance(lat, lng, gf.center[0], gf.center[1]) <= gf.radius;
  }
  if (gf.type === 'polygon' && gf.coordinates && gf.coordinates.length >= 3) {
    return isPointInPolygon([lat, lng], gf.coordinates);
  }
  return false;
}

function createAlert(alertData: Omit<GpsAlert, 'id' | 'read' | 'timestamp'>) {
  const alert: GpsAlert = {
    id: `alert-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    ...alertData,
    timestamp: new Date().toISOString(),
    read: false,
  };
  alerts.unshift(alert);
  if (alerts.length > 200) alerts.pop();
  broadcastSse('notification', alert);
  return alert;
}

function evaluatePositionRules(device: GpsDevice, pos: GpsPosition) {
  // 1. Speed limit violation
  if (pos.speed > device.speedLimit && pos.speed > 5) {
    createAlert({
      deviceId: device.id,
      deviceName: device.name,
      severity: pos.speed > device.speedLimit + 20 ? 'critical' : 'warning',
      type: 'speeding',
      message: `Exceso de velocidad: ${Math.round(pos.speed)} km/h (Límite: ${device.speedLimit} km/h)`,
      latitude: pos.latitude,
      longitude: pos.longitude,
    });
  }

  // 2. SOS emergency trigger
  if (pos.sos) {
    createAlert({
      deviceId: device.id,
      deviceName: device.name,
      severity: 'critical',
      type: 'sos',
      message: `¡BOTÓN DE PÁNICO / SOS ACTIVADO POR CONDUCTOR!`,
      latitude: pos.latitude,
      longitude: pos.longitude,
    });
  }

  // 3. Tamper / Sabotage trigger
  if (pos.tamper) {
    createAlert({
      deviceId: device.id,
      deviceName: device.name,
      severity: 'critical',
      type: 'tamper',
      message: `Sensor antimanipulación activado: posible desconexión o sabotaje de antena GNSS.`,
      latitude: pos.latitude,
      longitude: pos.longitude,
    });
  }

  // 4. Low battery
  if (pos.battery < 15 && pos.battery > 0) {
    createAlert({
      deviceId: device.id,
      deviceName: device.name,
      severity: 'warning',
      type: 'low-battery',
      message: `Batería crítica en dispositivo: ${pos.battery}%`,
      latitude: pos.latitude,
      longitude: pos.longitude,
    });
  }

  // 5. Geofences evaluation
  const currentInsideGfIds: string[] = [];
  const previouslyInsideGfIds = device.activeGeofences || [];

  for (const gf of geofences.values()) {
    const isInside = checkGeofence(pos.latitude, pos.longitude, gf);
    if (isInside) {
      currentInsideGfIds.push(gf.id);
      // Entered geofence?
      if (!previouslyInsideGfIds.includes(gf.id) && gf.alertOnEnter) {
        createAlert({
          deviceId: device.id,
          deviceName: device.name,
          severity: 'info',
          type: 'geofence-enter',
          message: `Entrada en zona: "${gf.name}"`,
          latitude: pos.latitude,
          longitude: pos.longitude,
        });
      }
      // Speed limit inside geofence?
      if (gf.speedLimit && pos.speed > gf.speedLimit) {
        createAlert({
          deviceId: device.id,
          deviceName: device.name,
          severity: 'warning',
          type: 'speeding',
          message: `Superado límite interno de zona "${gf.name}": ${Math.round(pos.speed)} km/h (máx ${gf.speedLimit} km/h)`,
          latitude: pos.latitude,
          longitude: pos.longitude,
        });
      }
    } else {
      // Exited geofence?
      if (previouslyInsideGfIds.includes(gf.id) && gf.alertOnExit) {
        createAlert({
          deviceId: device.id,
          deviceName: device.name,
          severity: 'warning',
          type: 'geofence-exit',
          message: `Salida de zona: "${gf.name}"`,
          latitude: pos.latitude,
          longitude: pos.longitude,
        });
      }
    }
  }

  device.activeGeofences = currentInsideGfIds;
}

// Ingestion Pipeline for processed positions
function ingestPosition(pos: GpsPosition, protocolSource = 'HTTPS'): void {
  const device = devices.get(pos.deviceId);
  if (!device) return;

  // Update status based on speed
  if (pos.speed > 5) {
    device.status = 'moving';
  } else if (pos.ignition) {
    device.status = 'idle';
  } else {
    device.status = 'stopped';
  }

  device.lastPosition = pos;
  device.lastSeen = pos.timestamp;

  // Add to history (keep max 300 per device in memory)
  let history = positionsHistory.get(pos.deviceId);
  if (!history) {
    history = [];
    positionsHistory.set(pos.deviceId, history);
  }
  history.push(pos);
  if (history.length > 400) {
    history.shift();
  }

  // Rule evaluation
  evaluatePositionRules(device, pos);

  // Broadcast to all SSE connected UI clients
  broadcastSse('position_update', {
    device,
    position: pos,
    protocolSource,
  });
}

// --- GPS Protocols Parsers ---

// 1. NMEA 0183 ($GPRMC parser)
function parseNmeaGprmc(sentence: string): Partial<GpsPosition> | null {
  const parts = sentence.trim().split(',');
  if (!parts[0].includes('RMC') || parts.length < 10) return null;

  // $GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*6A
  const status = parts[2];
  if (status !== 'A') return null; // 'V' is void/invalid fix

  const rawLat = parts[3];
  const latDir = parts[4];
  const rawLng = parts[5];
  const lngDir = parts[6];
  const speedKnots = parseFloat(parts[7]) || 0;
  const heading = parseFloat(parts[8]) || 0;

  // Convert NMEA DDMM.MMMM to Decimal Degrees
  const latDeg = parseInt(rawLat.substring(0, 2), 10);
  const latMin = parseFloat(rawLat.substring(2));
  let lat = latDeg + latMin / 60;
  if (latDir === 'S') lat = -lat;

  const lngDeg = parseInt(rawLng.substring(0, 3), 10);
  const lngMin = parseFloat(rawLng.substring(3));
  let lng = lngDeg + lngMin / 60;
  if (lngDir === 'W') lng = -lng;

  const speedKmH = speedKnots * 1.852;

  return {
    latitude: parseFloat(lat.toFixed(6)),
    longitude: parseFloat(lng.toFixed(6)),
    speed: parseFloat(speedKmH.toFixed(1)),
    heading: Math.round(heading),
  };
}

// 2. Teltonika AVL Codec 8 parser
function parseTeltonikaCodec8(hex: string): Partial<GpsPosition> | null {
  try {
    const clean = hex.replace(/\s+/g, '');
    if (clean.length < 50) return null;

    // Byte 8: Codec ID (0x08)
    const codecId = parseInt(clean.substring(16, 18), 16);
    if (codecId !== 8) return null;

    // Record 1 starts at byte 10 (offset 20 in hex)
    // Timestamp: 8 bytes (offset 20 to 36)
    // Priority: 1 byte (offset 36 to 38)
    // Longitude: 4 bytes (offset 38 to 46, signed int / 10000000)
    // Latitude: 4 bytes (offset 46 to 54, signed int / 10000000)
    // Altitude: 2 bytes (offset 54 to 58)
    // Angle: 2 bytes (offset 58 to 62)
    // Satellites: 1 byte (offset 62 to 64)
    // Speed: 2 bytes (offset 64 to 68)

    const lngRaw = parseInt(clean.substring(38, 46), 16);
    const latRaw = parseInt(clean.substring(46, 54), 16);
    // Convert two's complement 32-bit if negative
    const lngInt = lngRaw > 0x7fffffff ? lngRaw - 0x100000000 : lngRaw;
    const latInt = latRaw > 0x7fffffff ? latRaw - 0x100000000 : latRaw;

    const lng = lngInt / 10000000;
    const lat = latInt / 10000000;
    const alt = parseInt(clean.substring(54, 58), 16);
    const angle = parseInt(clean.substring(58, 62), 16);
    const sats = parseInt(clean.substring(62, 64), 16);
    const speed = parseInt(clean.substring(64, 68), 16);

    return {
      latitude: parseFloat(lat.toFixed(6)),
      longitude: parseFloat(lng.toFixed(6)),
      altitude: alt,
      heading: angle,
      satellites: sats,
      speed: speed,
    };
  } catch {
    return null;
  }
}

// --- Initial Seed Route Generation ---

function seedInitialDeviceRoutes() {
  // Initial points around Madrid and Aragón corridors
  const truckPoints = [
    { lat: 40.435, lng: -3.555, spd: 45, head: 52 },
    { lat: 40.452, lng: -3.520, spd: 78, head: 54 },
    { lat: 40.480, lng: -3.460, spd: 88, head: 60 },
    { lat: 40.520, lng: -3.360, spd: 90, head: 63 },
    { lat: 40.560, lng: -3.270, spd: 92, head: 65 },
  ];

  const now = Date.now();
  truckPoints.forEach((pt, i) => {
    const time = new Date(now - (truckPoints.length - i) * 15000).toISOString();
    const pos: GpsPosition = {
      id: `seed-truck-${i}`,
      deviceId: 'dev-mercedes-7741',
      latitude: pt.lat,
      longitude: pt.lng,
      altitude: 650 + i * 5,
      speed: pt.spd,
      heading: pt.head,
      satellites: 14,
      hdop: 0.9,
      battery: 98,
      ignition: true,
      tamper: false,
      sos: false,
      timestamp: time,
      encryption: {
        algorithm: 'AES-256-GCM',
        verified: true,
        iv: 'c0a80101b2a304f5e6d7c8b9',
        authTag: '8f9217bcae41258d6930ef11bca09214',
      },
    };
    ingestPosition(pos, 'SEED');
  });

  // Seed Patrol Car in Madrid Center
  const patrolPoints = [
    { lat: 40.4168, lng: -3.7038, spd: 35, head: 180 },
    { lat: 40.4120, lng: -3.7030, spd: 42, head: 175 },
    { lat: 40.4070, lng: -3.7000, spd: 28, head: 140 },
  ];
  patrolPoints.forEach((pt, i) => {
    const time = new Date(now - (patrolPoints.length - i) * 12000).toISOString();
    const pos: GpsPosition = {
      id: `seed-patrol-${i}`,
      deviceId: 'dev-debian-patrol-04',
      latitude: pt.lat,
      longitude: pt.lng,
      altitude: 660,
      speed: pt.spd,
      heading: pt.head,
      satellites: 16,
      hdop: 0.8,
      battery: 85,
      ignition: true,
      tamper: false,
      sos: false,
      timestamp: time,
      encryption: {
        algorithm: 'AES-256-GCM',
        verified: true,
      },
    };
    ingestPosition(pos, 'SEED');
  });

  // Seed Logistics Van
  const vanPos: GpsPosition = {
    id: `seed-van-0`,
    deviceId: 'dev-logis-van-92',
    latitude: 40.448,
    longitude: -3.670,
    altitude: 680,
    speed: 55,
    heading: 210,
    satellites: 12,
    hdop: 1.1,
    battery: 92,
    ignition: true,
    tamper: false,
    sos: false,
    timestamp: new Date().toISOString(),
    encryption: {
      algorithm: 'AES-256-GCM',
      verified: true,
    },
  };
  ingestPosition(vanPos, 'SEED');

  // Seed Drone
  const dronePos: GpsPosition = {
    id: `seed-drone-0`,
    deviceId: 'dev-drone-alpha',
    latitude: 40.438,
    longitude: -3.546,
    altitude: 120, // 120m AGL
    speed: 40,
    heading: 315,
    satellites: 18,
    hdop: 0.6,
    battery: 68,
    ignition: true,
    tamper: false,
    sos: false,
    timestamp: new Date().toISOString(),
    encryption: {
      algorithm: 'AES-256-CBC',
      verified: true,
    },
  };
  ingestPosition(dronePos, 'SEED');
}

seedInitialDeviceRoutes();

// --- Background Route Simulation ---

// Simulation waypoints step generator
let simStep = 0;
setInterval(() => {
  if (!simulationRunning) return;
  simStep++;

  // 1. Move Truck along A-2 corridor Madrid -> Guadalajara -> Zaragoza
  const truck = devices.get('dev-mercedes-7741');
  if (truck && truck.lastPosition) {
    const lp = truck.lastPosition;
    // Advance eastward with road curves
    const deltaLat = 0.0006 * Math.sin(simStep * 0.1) + 0.0008;
    const deltaLng = 0.0018 + 0.0003 * Math.cos(simStep * 0.15);
    const newLat = parseFloat((lp.latitude + deltaLat).toFixed(6));
    const newLng = parseFloat((lp.longitude + deltaLng).toFixed(6));
    
    // Speed variations (sometimes exceeds 90 km/h to test alerts)
    const baseSpeed = 82 + 12 * Math.sin(simStep * 0.25);
    const speed = parseFloat(Math.max(20, baseSpeed).toFixed(1));
    const heading = Math.round(55 + 10 * Math.sin(simStep * 0.2));

    const payloadObj = {
      deviceId: truck.id,
      latitude: newLat,
      longitude: newLng,
      altitude: Math.round(650 + (simStep % 100)),
      speed: speed,
      heading: heading,
      satellites: 14 + (simStep % 4),
      hdop: 0.9,
      battery: Math.max(30, 98 - Math.floor(simStep / 40)),
      ignition: true,
      tamper: false,
      sos: false,
      timestamp: new Date().toISOString(),
    };

    // Encrypt payload with truck's AES-256-GCM key
    const startTime = Date.now();
    const encrypted = encryptAesGcm(JSON.stringify(payloadObj), truck.aesKeyHex);
    const latency = Math.max(1, Date.now() - startTime);

    totalPacketsDecrypted++;
    totalDecryptionTimeMs += latency;

    const logEntry: CryptoPacketLog = {
      id: `log-${Date.now()}-${simStep}`,
      deviceId: truck.id,
      deviceName: truck.name,
      protocol: 'Teltonika AVL (AES-256-GCM)',
      transport: 'TCP',
      algorithm: 'AES-256-GCM',
      ivHex: encrypted.ivHex,
      ciphertextHex: encrypted.ciphertextHex,
      authTagHex: encrypted.authTagHex,
      decryptedPayload: payloadObj,
      verified: true,
      latencyMs: latency,
      timestamp: payloadObj.timestamp,
    };
    cryptoLogs.unshift(logEntry);
    if (cryptoLogs.length > 100) cryptoLogs.pop();
    broadcastSse('crypto_log', logEntry);

    const pos: GpsPosition = {
      id: `pos-${truck.id}-${Date.now()}`,
      ...payloadObj,
      encryption: {
        algorithm: 'AES-256-GCM',
        verified: true,
        iv: encrypted.ivHex,
        authTag: encrypted.authTagHex,
      },
    };
    ingestPosition(pos, 'TCP-AES');
  }

  // 2. Move Patrol Car in urban grid (unless actively driven by real Kali Linux host)
  const patrol = devices.get('dev-debian-patrol-04');
  const isKaliHostActive = patrol?.name.includes('Kali') && patrol.lastSeen && (Date.now() - new Date(patrol.lastSeen).getTime() < 12000);
  if (patrol && patrol.lastPosition && simStep % 2 === 0 && !isKaliHostActive) {
    const lp = patrol.lastPosition;
    const angleRad = (simStep * 0.08) % (2 * Math.PI);
    const centerLat = patrol.name.includes('Kali') ? lp.latitude : 40.4168;
    const centerLng = patrol.name.includes('Kali') ? lp.longitude : -3.7038;
    const radiusLat = patrol.name.includes('Kali') ? 0.0005 : 0.015;
    const radiusLng = patrol.name.includes('Kali') ? 0.0007 : 0.022;

    const newLat = parseFloat((centerLat + radiusLat * Math.sin(angleRad)).toFixed(6));
    const newLng = parseFloat((centerLng + radiusLng * Math.cos(angleRad)).toFixed(6));
    const speed = parseFloat((35 + 15 * Math.sin(simStep * 0.3)).toFixed(1));
    const heading = Math.round(((angleRad + Math.PI / 2) * (180 / Math.PI)) % 360);

    const payloadObj = {
      deviceId: patrol.id,
      latitude: newLat,
      longitude: newLng,
      altitude: 660,
      speed,
      heading,
      satellites: 15,
      hdop: 0.8,
      battery: 88,
      ignition: true,
      tamper: false,
      sos: false,
      timestamp: new Date().toISOString(),
    };

    const encrypted = encryptAesGcm(JSON.stringify(payloadObj), patrol.aesKeyHex);
    totalPacketsDecrypted++;

    const logEntry: CryptoPacketLog = {
      id: `log-patrol-${Date.now()}`,
      deviceId: patrol.id,
      deviceName: patrol.name,
      protocol: 'Quectel EC25 (MQTT-TLS)',
      transport: 'MQTT-TLS',
      algorithm: 'AES-256-GCM',
      ivHex: encrypted.ivHex,
      ciphertextHex: encrypted.ciphertextHex,
      authTagHex: encrypted.authTagHex,
      decryptedPayload: payloadObj,
      verified: true,
      latencyMs: 2,
      timestamp: payloadObj.timestamp,
    };
    cryptoLogs.unshift(logEntry);
    if (cryptoLogs.length > 100) cryptoLogs.pop();
    broadcastSse('crypto_log', logEntry);

    const pos: GpsPosition = {
      id: `pos-${patrol.id}-${Date.now()}`,
      ...payloadObj,
      encryption: {
        algorithm: 'AES-256-GCM',
        verified: true,
        iv: encrypted.ivHex,
        authTag: encrypted.authTagHex,
      },
    };
    ingestPosition(pos, 'MQTT-TLS');
  }

  // 3. Move Drone in perimeter scan
  const drone = devices.get('dev-drone-alpha');
  if (drone && drone.lastPosition && simStep % 3 === 0) {
    const lp = drone.lastPosition;
    const dLat = 0.0008 * Math.cos(simStep * 0.12);
    const dLng = 0.0008 * Math.sin(simStep * 0.12);
    const newLat = parseFloat((lp.latitude + dLat).toFixed(6));
    const newLng = parseFloat((lp.longitude + dLng).toFixed(6));

    const payloadObj = {
      deviceId: drone.id,
      latitude: newLat,
      longitude: newLng,
      altitude: 110 + Math.round(15 * Math.sin(simStep * 0.2)),
      speed: 38,
      heading: (drone.lastPosition.heading + 25) % 360,
      satellites: 18,
      hdop: 0.6,
      battery: Math.max(12, 70 - Math.floor(simStep / 25)),
      ignition: true,
      tamper: false,
      sos: false,
      timestamp: new Date().toISOString(),
    };

    const pos: GpsPosition = {
      id: `pos-${drone.id}-${Date.now()}`,
      ...payloadObj,
      encryption: {
        algorithm: 'AES-256-CBC',
        verified: true,
      },
    };
    ingestPosition(pos, 'TCP-NMEA');
  }

  // 4. Move any Scanned Nearby GPS Devices that were linked by the user
  for (const [devId, dev] of devices.entries()) {
    if (devId.startsWith('scan-') && dev.lastPosition) {
      const lp = dev.lastPosition;
      const phase = devId.charCodeAt(devId.length - 1) + simStep * 0.14;
      const dLat = 0.00035 * Math.sin(phase);
      const dLng = 0.00045 * Math.cos(phase);
      const newLat = parseFloat((lp.latitude + dLat).toFixed(6));
      const newLng = parseFloat((lp.longitude + dLng).toFixed(6));
      const speed = parseFloat((28 + 14 * Math.abs(Math.sin(phase))).toFixed(1));
      const heading = Math.round(((phase * 180) / Math.PI) % 360);

      const payloadObj = {
        deviceId: dev.id,
        latitude: newLat,
        longitude: newLng,
        altitude: lp.altitude || 520,
        speed,
        heading,
        satellites: 16,
        hdop: 0.7,
        battery: lp.battery || 92,
        ignition: true,
        tamper: false,
        sos: false,
        timestamp: new Date().toISOString(),
      };

      const encrypted = encryptAesGcm(JSON.stringify(payloadObj), dev.aesKeyHex);
      totalPacketsDecrypted++;

      const pos: GpsPosition = {
        id: `pos-${dev.id}-${Date.now()}`,
        ...payloadObj,
        encryption: {
          algorithm: 'AES-256-GCM',
          verified: true,
          iv: encrypted.ivHex,
          authTag: encrypted.authTagHex,
        },
      };
      ingestPosition(pos, 'RF-SCAN-AES');
    }
  }
}, 3000);

// --- REST API Endpoints ---

// 1. Devices API
app.get('/api/devices', (_req: Request, res: Response) => {
  res.json(Array.from(devices.values()));
});

app.post('/api/devices', (req: Request, res: Response) => {
  const { id: reqId, name, imei, model, vehicleType, protocol, aesKeyHex, speedLimit, color } = req.body;
  if (!name || !imei) {
    res.status(400).json({ error: 'El nombre y el IMEI son obligatorios' });
    return;
  }

  // Check if device with this ID or IMEI already exists
  let targetId: string = reqId || '';
  if (targetId && devices.has(targetId)) {
    // Keep existing targetId
  } else {
    for (const [dId, d] of devices.entries()) {
      if (d.imei === imei || (reqId && d.id === reqId)) {
        targetId = dId;
        break;
      }
    }
  }

  const id = targetId || reqId || `dev-${Date.now()}`;
  const existingDev = devices.get(id);

  const device: GpsDevice = {
    id,
    imei,
    name,
    model: model || existingDev?.model || 'Generic GPS Tracker',
    vehicleType: vehicleType || existingDev?.vehicleType || 'car',
    protocol: protocol || existingDev?.protocol || 'aes-encrypted-json',
    aesKeyHex: aesKeyHex || existingDev?.aesKeyHex || crypto.randomBytes(32).toString('hex'),
    speedLimit: Number(speedLimit) || existingDev?.speedLimit || 80,
    status: existingDev?.status || 'idle',
    color: color || existingDev?.color || '#06b6d4',
    activeGeofences: existingDev?.activeGeofences || [],
    lastPosition: existingDev?.lastPosition,
    lastSeen: existingDev?.lastSeen,
  };

  devices.set(id, device);
  broadcastSse('device_registered', device);
  res.status(201).json(device);
});

app.delete('/api/devices/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  if (devices.delete(id)) {
    positionsHistory.delete(id);
    broadcastSse('device_removed', { id });
    res.json({ success: true, id });
  } else {
    res.status(404).json({ error: 'Dispositivo no encontrado' });
  }
});

// 2. Positions & History API
app.get('/api/positions/:deviceId', (req: Request, res: Response) => {
  const { deviceId } = req.params;
  let history = positionsHistory.get(deviceId) || [];
  if (history.length === 0) {
    const dev = devices.get(deviceId);
    if (dev && dev.lastPosition) {
      history = [dev.lastPosition];
    }
  }
  res.json(history);
});

app.get('/api/positions', (_req: Request, res: Response) => {
  const latest: Record<string, GpsPosition | undefined> = {};
  for (const [id, dev] of devices.entries()) {
    latest[id] = dev.lastPosition;
  }
  res.json(latest);
});

// 3. Encrypted Ingestion Endpoint (AES-256-GCM / CBC)
app.post('/api/gps/encrypted-aes', (req: Request, res: Response) => {
  const { deviceId, ciphertext, iv, authTag, algorithm = 'AES-256-GCM', transport = 'HTTPS' } = req.body;

  if (!deviceId || !ciphertext || !iv) {
    res.status(400).json({ error: 'Parámetros incompletos (deviceId, ciphertext, iv requeridos)' });
    return;
  }

  const device = devices.get(deviceId);
  if (!device) {
    res.status(404).json({ error: 'Dispositivo no registrado' });
    return;
  }

  const start = Date.now();
  let decryptedPlaintext = '';

  if (algorithm === 'AES-256-GCM') {
    if (!authTag) {
      res.status(400).json({ error: 'AES-256-GCM requiere tag de autenticación (authTag)' });
      return;
    }
    const result = decryptAesGcm(ciphertext, iv, authTag, device.aesKeyHex);
    if (!result.success || !result.plaintext) {
      // Alert potential tampering!
      createAlert({
        deviceId: device.id,
        deviceName: device.name,
        severity: 'critical',
        type: 'crypto-tamper',
        message: `Fallo de integridad criptográfica: Tag de autenticación inválido para ${device.name}. Posible ataque de repetición o manipulación.`,
      });
      res.status(400).json({ error: 'Fallo de autenticación criptográfica AES-GCM' });
      return;
    }
    decryptedPlaintext = result.plaintext;
  } else {
    // AES-CBC fallback
    try {
      const key = Buffer.from(device.aesKeyHex, 'hex');
      const ivBuf = Buffer.from(iv, 'hex');
      const cipherBuf = Buffer.from(ciphertext, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, ivBuf);
      decryptedPlaintext = decipher.update(cipherBuf, undefined, 'utf8') + decipher.final('utf8');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'CBC decryption failed';
      res.status(400).json({ error: msg });
      return;
    }
  }

  const latency = Math.max(1, Date.now() - start);
  totalPacketsDecrypted++;
  totalDecryptionTimeMs += latency;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(decryptedPlaintext);
  } catch {
    res.status(400).json({ error: 'El contenido descifrado no es un JSON válido' });
    return;
  }

  const reportedHost = (parsed.hostname as string) || (req.body.hostname as string);
  if (reportedHost && device.id === 'dev-debian-patrol-04') {
    device.name = `Nodo Kali/Debian (${reportedHost})`;
    device.model = `Linux Host (${reportedHost}) · AES-256-GCM`;
  }

  const logEntry: CryptoPacketLog = {
    id: `log-incoming-${Date.now()}`,
    deviceId: device.id,
    deviceName: device.name,
    protocol: device.protocol,
    transport: transport as 'HTTPS' | 'TCP' | 'MQTT-TLS' | 'WSS',
    algorithm: algorithm,
    ivHex: iv,
    ciphertextHex: ciphertext,
    authTagHex: authTag,
    decryptedPayload: parsed,
    verified: true,
    latencyMs: latency,
    timestamp: new Date().toISOString(),
  };

  cryptoLogs.unshift(logEntry);
  if (cryptoLogs.length > 100) cryptoLogs.pop();
  broadcastSse('crypto_log', logEntry);

  const pos: GpsPosition = {
    id: `pos-${device.id}-${Date.now()}`,
    deviceId: device.id,
    latitude: Number(parsed.latitude ?? parsed.lat),
    longitude: Number(parsed.longitude ?? parsed.lng ?? parsed.lon),
    altitude: Number(parsed.altitude ?? parsed.alt ?? 0),
    speed: Number(parsed.speed ?? 0),
    heading: Number(parsed.heading ?? parsed.bearing ?? 0),
    satellites: Number(parsed.satellites ?? parsed.sats ?? 12),
    hdop: Number(parsed.hdop ?? 1.0),
    battery: Number(parsed.battery ?? 100),
    ignition: Boolean(parsed.ignition ?? true),
    tamper: Boolean(parsed.tamper ?? false),
    sos: Boolean(parsed.sos ?? false),
    timestamp: (parsed.timestamp as string) || new Date().toISOString(),
    encryption: {
      algorithm: algorithm as 'AES-256-GCM' | 'AES-256-CBC',
      verified: true,
      iv,
      authTag,
    },
  };

  ingestPosition(pos, transport);
  res.json({
    status: 'OK',
    verified: true,
    deviceId: device.id,
    decryptionTimeMs: latency,
    position: pos,
  });
});

// 4. Raw & Standard Protocols Ingestion (OsmAnd, Traccar Client, OwnTracks, NMEA, Teltonika)

// Helper to auto-register or find device by ID/IMEI
function getOrCreateDevice(idOrImei: string, defaultName = 'Dispositivo GPS Móvil'): GpsDevice {
  let dev = devices.get(idOrImei);
  if (!dev) {
    // Check by IMEI
    for (const d of devices.values()) {
      if (d.imei === idOrImei || d.id === idOrImei) {
        return d;
      }
    }

    // Auto-register device
    const id = idOrImei.startsWith('dev-') ? idOrImei : `dev-${idOrImei}`;
    dev = {
      id,
      imei: idOrImei.replace(/\D/g, '') || String(Math.floor(100000000000000 + Math.random() * 900000000000000)),
      name: `${defaultName} (${idOrImei.slice(-4)})`,
      model: 'OsmAnd / Traccar Client Protocol',
      vehicleType: 'car',
      protocol: 'osmand',
      aesKeyHex: crypto.randomBytes(32).toString('hex'),
      speedLimit: 90,
      status: 'moving',
      color: '#10b981',
      activeGeofences: [],
    };
    devices.set(id, dev);
    broadcastSse('device_registered', dev);
  }
  return dev;
}

// OsmAnd & Traccar Client (GET & POST)
const handleOsmAnd = (req: Request, res: Response) => {
  const query = { ...req.query, ...req.body };
  const deviceId = (query.id || query.deviceid || query.deviceId || query.imei || 'mobile-tracker') as string;
  const lat = parseFloat(query.lat || query.latitude);
  const lon = parseFloat(query.lon || query.lng || query.longitude);

  if (isNaN(lat) || isNaN(lon)) {
    res.status(400).send('HTTP 400: Invalid latitude or longitude');
    return;
  }

  const speedKmh = query.speed !== undefined ? parseFloat(query.speed) * 1.852 : 0; // knots to km/h or m/s
  const heading = query.bearing !== undefined ? Math.round(parseFloat(query.bearing)) : (query.heading ? Math.round(parseFloat(query.heading)) : 0);
  const altitude = query.altitude !== undefined ? parseFloat(query.altitude) : (query.alt ? parseFloat(query.alt) : 0);
  const battery = query.batt !== undefined ? parseFloat(query.batt) : (query.battery ? parseFloat(query.battery) : 100);

  const device = getOrCreateDevice(deviceId, 'Smartphone (OsmAnd/Traccar)');

  const pos: GpsPosition = {
    id: `pos-osmand-${Date.now()}`,
    deviceId: device.id,
    latitude: lat,
    longitude: lon,
    altitude: Math.round(altitude),
    speed: Math.round(speedKmh * 10) / 10,
    heading: heading % 360,
    satellites: query.hdop ? Math.max(8, Math.round(15 / Math.max(0.5, parseFloat(query.hdop)))) : 14,
    hdop: query.hdop ? parseFloat(query.hdop) : 1.0,
    battery: Math.min(100, Math.max(0, Math.round(battery))),
    ignition: speedKmh > 2,
    tamper: false,
    sos: false,
    timestamp: new Date().toISOString(),
    encryption: {
      algorithm: 'NONE',
      verified: true,
    },
  };

  ingestPosition(pos, 'OsmAnd-HTTP');
  res.send('OK');
};

app.get('/api/gps/osmand', handleOsmAnd);
app.post('/api/gps/osmand', handleOsmAnd);

// OwnTracks HTTP Ingestion
app.post('/api/gps/owntracks', (req: Request, res: Response) => {
  const b = req.body;
  if (!b || b._type !== 'location' || b.lat === undefined || b.lon === undefined) {
    res.status(400).json({ error: 'Payload incompatible con OwnTracks' });
    return;
  }

  const trackerId = b.tid || b.tracker_id || 'owntracks-user';
  const device = getOrCreateDevice(`dev-owntracks-${trackerId}`, `OwnTracks Tracker (${trackerId})`);

  const pos: GpsPosition = {
    id: `pos-ot-${Date.now()}`,
    deviceId: device.id,
    latitude: Number(b.lat),
    longitude: Number(b.lon),
    altitude: Number(b.alt || 0),
    speed: Number(b.vel ? b.vel * 3.6 : 0),
    heading: Number(b.cog || 0),
    satellites: 15,
    hdop: Number(b.acc ? b.acc / 10 : 1.0),
    battery: Number(b.batt || 100),
    ignition: (b.vel || 0) > 1,
    tamper: false,
    sos: false,
    timestamp: b.tst ? new Date(b.tst * 1000).toISOString() : new Date().toISOString(),
    encryption: {
      algorithm: 'NONE',
      verified: true,
    },
  };

  ingestPosition(pos, 'OwnTracks-HTTP');
  res.json({ status: 'OK' });
});

// Generic JSON Push Ingestion (IoT, cURL, Webhooks)
app.post('/api/gps/push', (req: Request, res: Response) => {
  const b = req.body;
  const deviceId = b.deviceId || b.id || b.imei;
  const lat = Number(b.latitude ?? b.lat);
  const lon = Number(b.longitude ?? b.lng ?? b.lon);

  if (!deviceId || isNaN(lat) || isNaN(lon)) {
    res.status(400).json({ error: 'deviceId, latitude y longitude requeridos' });
    return;
  }

  const device = getOrCreateDevice(deviceId, 'Dispositivo IoT / Webhook');

  const pos: GpsPosition = {
    id: `pos-push-${Date.now()}`,
    deviceId: device.id,
    latitude: lat,
    longitude: lon,
    altitude: Number(b.altitude ?? b.alt ?? 0),
    speed: Number(b.speed ?? 0),
    heading: Number(b.heading ?? b.bearing ?? 0),
    satellites: Number(b.satellites ?? b.sats ?? 12),
    hdop: Number(b.hdop ?? 1.0),
    battery: Number(b.battery ?? 100),
    ignition: Boolean(b.ignition ?? true),
    tamper: Boolean(b.tamper ?? false),
    sos: Boolean(b.sos ?? false),
    timestamp: b.timestamp || new Date().toISOString(),
    encryption: {
      algorithm: 'NONE',
      verified: true,
    },
  };

  ingestPosition(pos, 'REST-PUSH');
  res.json({ status: 'OK', position: pos });
});

// Direct Bash Installer File Endpoint
app.get('/api/debian/install.sh', (req: Request, res: Response) => {
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || 'localhost:3000';
  const serverOrigin = `${proto}://${host}`;
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="install-aegis-gps.sh"');
  res.send(generateDebianInstallScript(serverOrigin));
});

// Direct Python Daemon Script Endpoint for OTA Self-Updates (aegis-gps update)
app.get('/api/debian/aegis_client.py', (req: Request, res: Response) => {
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || 'localhost:3000';
  const serverOrigin = `${proto}://${host}`;
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(generateDebianPythonScript(serverOrigin));
});

// Platform Version & OTA Update Metadata Endpoint
app.get('/api/version', (req: Request, res: Response) => {
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || 'localhost:3000';
  const serverOrigin = `${proto}://${host}`;
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({
    version: AEGIS_APP_VERSION,
    build: '2026.10.04-kali-ota',
    releaseDate: new Date().toISOString(),
    changelog: [
      'v2.4.0: Sistema de Actualización OTA en 1 clic (/api/self-update y comando aegis-gps update)',
      'v2.4.0: Escáner Táctico de Dispositivos GPS Cercanos (Radar RF 360°, LAN, USB y Bluetooth BLE)',
      'v2.3.0: Interfaz Táctica Completa integrada en el nodo local Kali Linux (http://127.0.0.1:8765)',
      'v2.2.0: Corrección automática del repositorio Docker en Kali Linux y soporte de clave AES-256 normalizada',
    ],
    pythonScriptUrl: `${serverOrigin}/api/debian/aegis_client.py`,
    installerUrl: `${serverOrigin}/api/debian/install.sh`,
  });
});

// Nearby GPS Proximity Scanner Endpoint (Multi-Section: RF/GNSS, LAN, USB/Serial, BLE, Spectrum)
app.post('/api/gps/scan-nearby', (req: Request, res: Response) => {
  const baseLat = Number(req.body.latitude) || 42.8150;
  const baseLon = Number(req.body.longitude) || -1.6425;
  const radiusMeters = Number(req.body.radiusMeters) || 2500;
  const scale = Math.max(0.25, Math.min(5, radiusMeters / 2000));

  const templates = [
    {
      id: 'scan-teltonika-near-01',
      name: 'Baliza Táctica Teltonika FMB140',
      imei: '359633109482711',
      model: 'Teltonika FMB140 · CAN/GNSS',
      category: 'rf-gnss',
      vehicleType: 'patrol',
      protocol: 'teltonika-codec8',
      channel: 'TCP / 2G-4G LTE :5023',
      frequency: '1575.42 MHz L1 + LTE',
      rssi: -46,
      snrDbHz: 47,
      satellites: 18,
      hdop: 0.6,
      altitude: 452,
      battery: 96,
      speed: 44.5,
      heading: 65,
      dLat: 0.0014 * scale,
      dLon: 0.0018 * scale,
      bearing: 48,
      color: '#10b981',
      encrypted: true,
      constellations: ['GPS L1', 'Galileo E1', 'GLONASS'],
      ipAddress: '10.42.0.14:5023',
      macAddress: '00:1E:42:9A:44:11',
      nmeaSample: '$GNRMC,101244.00,A,4248.9840,N,00138.4420,W,24.0,65.0,051026,,,A*7C',
    },
    {
      id: 'scan-ublox-near-02',
      name: 'Receptor GNSS u-blox NEO-M9N',
      imei: '864901028374612',
      model: 'u-blox NEO-M9N Concurrent GNSS',
      category: 'usb-serial',
      vehicleType: 'car',
      protocol: 'nmea-0183-aes',
      channel: '/dev/ttyACM0 · gpsd :2947',
      frequency: 'L1/L2 GPS + Galileo E1',
      rssi: -52,
      snrDbHz: 45,
      satellites: 19,
      hdop: 0.5,
      altitude: 448,
      battery: 100,
      speed: 32.0,
      heading: 140,
      dLat: -0.0019 * scale,
      dLon: 0.0024 * scale,
      bearing: 128,
      color: '#06b6d4',
      encrypted: true,
      constellations: ['GPS L1/L2', 'Galileo E1', 'BeiDou B1'],
      ipAddress: '127.0.0.1:2947',
      macAddress: 'USB-VID:1546-PID:01A9',
      nmeaSample: '$GNGGA,101245.00,4248.7860,N,00138.4060,W,2,19,0.5,448.0,M,49.2,M,,*4B',
    },
    {
      id: 'scan-queclink-near-03',
      name: 'Unidad Móvil Queclink GL300W',
      imei: '867192039485723',
      model: 'Queclink GL300W Waterproof',
      category: 'lan-tcp',
      vehicleType: 'van',
      protocol: 'mqtt-tls-aes',
      channel: 'MQTT-TLS :8883 (LAN/WAN)',
      frequency: 'GNSS L1 + Wi-Fi 2.4GHz',
      rssi: -61,
      snrDbHz: 41,
      satellites: 15,
      hdop: 0.8,
      altitude: 460,
      battery: 84,
      speed: 58.2,
      heading: 225,
      dLat: -0.0031 * scale,
      dLon: -0.0027 * scale,
      bearing: 218,
      color: '#f59e0b',
      encrypted: true,
      constellations: ['GPS L1', 'GLONASS'],
      ipAddress: '192.168.1.108:8883',
      macAddress: '54:E1:AD:77:21:09',
      nmeaSample: '$GPRMC,101246.00,A,4248.7140,N,00138.7120,W,31.4,225.0,051026,,,A*52',
    },
    {
      id: 'scan-mavlink-near-04',
      name: 'Dron Táctico MAVLink GNSS-04',
      imei: '352091827364514',
      model: 'Holybro M9N · Pixhawk MAVLink v2',
      category: 'rf-gnss',
      vehicleType: 'drone',
      protocol: 'aes-encrypted-json',
      channel: 'RF 915 MHz Sik Telemetry',
      frequency: '915 MHz + GPS/BeiDou',
      rssi: -68,
      snrDbHz: 39,
      satellites: 21,
      hdop: 0.5,
      altitude: 585,
      battery: 78,
      speed: 64.0,
      heading: 310,
      dLat: 0.0042 * scale,
      dLon: -0.0036 * scale,
      bearing: 312,
      color: '#a855f7',
      encrypted: true,
      constellations: ['GPS L1', 'Galileo E1', 'GLONASS', 'BeiDou'],
      ipAddress: '10.42.0.88:14550',
      macAddress: 'RF-MAVLINK-SYSID:01',
      nmeaSample: '$GNRMC,101247.00,A,4249.1520,N,00138.7660,W,34.5,310.0,051026,,,A*7E',
    },
    {
      id: 'scan-obd2-near-05',
      name: 'Transpondedor OBD-II Freematics',
      imei: '861102938475615',
      model: 'Freematics ONE+ Model B (CAN-BUS)',
      category: 'lan-tcp',
      vehicleType: 'truck',
      protocol: 'aes-encrypted-json',
      channel: 'HTTPS REST / OBD-II :5055',
      frequency: 'LTE-M + GNSS 10Hz',
      rssi: -74,
      snrDbHz: 36,
      satellites: 14,
      hdop: 0.9,
      altitude: 455,
      battery: 99,
      speed: 71.4,
      heading: 15,
      dLat: 0.0056 * scale,
      dLon: 0.0012 * scale,
      bearing: 14,
      color: '#ec4899',
      encrypted: true,
      constellations: ['GPS L1', 'Galileo E1'],
      ipAddress: '192.168.1.145:5055',
      macAddress: '24:6F:28:1B:90:C4',
      nmeaSample: '$GNRMC,101248.00,A,4249.2360,N,00138.4780,W,38.5,15.0,051026,,,A*41',
    },
    {
      id: 'scan-lora-near-06',
      name: 'Baliza LoRaWAN Meshtastic GPS',
      imei: '869920192837466',
      model: 'LILYGO T-Beam LoRa 868MHz + NEO-8M',
      category: 'rf-gnss',
      vehicleType: 'person',
      protocol: 'mqtt-tls-aes',
      channel: 'LoRa RF 868.1 MHz SF7',
      frequency: '868.1 MHz ISM + GNSS L1',
      rssi: -79,
      snrDbHz: 34,
      satellites: 13,
      hdop: 1.0,
      altitude: 449,
      battery: 91,
      speed: 12.5,
      heading: 195,
      dLat: -0.0052 * scale,
      dLon: 0.0044 * scale,
      bearing: 145,
      color: '#38bdf8',
      encrypted: true,
      constellations: ['GPS L1', 'GLONASS'],
      ipAddress: 'LoRa-DevAddr:26011B4F',
      macAddress: 'LORA-EUI:70B3D57ED004',
      nmeaSample: '$GPGGA,101249.00,4248.5880,N,00138.2860,W,1,13,1.0,449.0,M,49.2,M,,*59',
    },
    {
      id: 'scan-ble-garmin-07',
      name: 'Garmin GLO 2 Aviation BLE GNSS',
      imei: '358812094817267',
      model: 'Garmin GLO 2 Bluetooth GPS/GLONASS',
      category: 'ble-beacon',
      vehicleType: 'person',
      protocol: 'aes-encrypted-json',
      channel: 'Bluetooth BLE 5.0 (GATT 0x1819)',
      frequency: '2.402 GHz BLE + L1 GNSS',
      rssi: -42,
      snrDbHz: 48,
      satellites: 20,
      hdop: 0.5,
      altitude: 447,
      battery: 94,
      speed: 18.0,
      heading: 82,
      dLat: 0.0008 * scale,
      dLon: -0.0011 * scale,
      bearing: 305,
      color: '#22d3ee',
      encrypted: true,
      constellations: ['GPS L1', 'GLONASS', 'WAAS/EGNOS'],
      ipAddress: 'BLE-GATT://0x1819',
      macAddress: 'D4:36:39:8F:12:A8',
      nmeaSample: '$GNRMC,101250.00,A,4248.9480,N,00138.6160,W,9.7,82.0,051026,,,D*4F',
    },
    {
      id: 'scan-ble-tag-08',
      name: 'Baliza Táctica BLE SmartTag UWB',
      imei: '357791029384758',
      model: 'Nordic nRF52840 BLE 5.2 + GNSS',
      category: 'ble-beacon',
      vehicleType: 'patrol',
      protocol: 'aes-encrypted-json',
      channel: 'BLE Beacon + UWB 6.5 GHz',
      frequency: '2.4 GHz BLE + 6.5 GHz UWB',
      rssi: -55,
      snrDbHz: 43,
      satellites: 16,
      hdop: 0.7,
      altitude: 450,
      battery: 89,
      speed: 24.5,
      heading: 110,
      dLat: -0.0011 * scale,
      dLon: -0.0015 * scale,
      bearing: 234,
      color: '#34d399',
      encrypted: true,
      constellations: ['GPS L1', 'Galileo E1'],
      ipAddress: 'BLE-UUID:FDA50693',
      macAddress: 'F8:33:31:5C:09:E2',
      nmeaSample: '$GNGGA,101251.00,4248.8340,N,00138.6400,W,1,16,0.7,450.0,M,49.2,M,,*43',
    },
    {
      id: 'scan-mobile-osmand-09',
      name: 'Smartphone Táctico Android / iOS (Proximidad)',
      imei: '354491028374909',
      model: 'Smartphone GNSS Dual-Frequency L1+L5',
      category: 'lan-tcp',
      vehicleType: 'person',
      protocol: 'osmand',
      channel: 'Wi-Fi / 5G · OsmAnd / Traccar Plug&Play',
      frequency: 'L1+L5 GNSS + Wi-Fi 5GHz',
      rssi: -44,
      snrDbHz: 46,
      satellites: 22,
      hdop: 0.5,
      altitude: 451,
      battery: 92,
      speed: 14.2,
      heading: 75,
      dLat: 0.0009 * scale,
      dLon: 0.0011 * scale,
      bearing: 50,
      color: '#38bdf8',
      encrypted: true,
      constellations: ['GPS L1/L5', 'Galileo E1/E5a', 'GLONASS'],
      ipAddress: '192.168.1.54:5055',
      macAddress: 'A4:83:E7:21:9C:10',
      nmeaSample: '$GNGGA,101252.00,4248.9540,N,00138.4840,W,1,22,0.5,451.0,M,49.2,M,,*49',
    },
    {
      id: 'scan-esp32-iot-10',
      name: 'Nodo IoT ESP32-S3 + GPS NEO-8M',
      imei: '863301928374810',
      model: 'ESP32-S3 Wi-Fi/BLE + u-blox NEO-8M',
      category: 'usb-serial',
      vehicleType: 'car',
      protocol: 'aes-encrypted-json',
      channel: 'UART / Wi-Fi REST Push + BLE',
      frequency: '2.4 GHz Wi-Fi + 1575.42 MHz L1',
      rssi: -50,
      snrDbHz: 44,
      satellites: 17,
      hdop: 0.6,
      altitude: 449,
      battery: 97,
      speed: 28.6,
      heading: 165,
      dLat: -0.0015 * scale,
      dLon: 0.0013 * scale,
      bearing: 139,
      color: '#a3e635',
      encrypted: true,
      constellations: ['GPS L1', 'Galileo E1', 'BeiDou'],
      ipAddress: '192.168.1.188:80',
      macAddress: '30:AE:A4:9F:11:8B',
      nmeaSample: '$GNRMC,101253.00,A,4248.8100,N,00138.4720,W,15.4,165.0,051026,,,A*71',
    },
  ];

  const discovered = templates.map((t) => {
    const lat = parseFloat((baseLat + t.dLat + (Math.random() - 0.5) * 0.0003).toFixed(6));
    const lon = parseFloat((baseLon + t.dLon + (Math.random() - 0.5) * 0.0003).toFixed(6));
    const distMeters = Math.round(calculateDistance(baseLat, baseLon, lat, lon));
    const alreadyConnected = devices.has(t.id);
    return {
      ...t,
      latitude: lat,
      longitude: lon,
      distanceMeters: distMeters,
      alreadyConnected,
    };
  });

  const spectrumBands = [
    { band: 'GPS L1 C/A', freq: '1575.42 MHz', snr: 47, noiseFloor: -112, status: 'Óptima', satsVisible: 11 },
    { band: 'Galileo E1 OS', freq: '1575.42 MHz', snr: 45, noiseFloor: -113, status: 'Óptima', satsVisible: 8 },
    { band: 'GLONASS L1OF', freq: '1602.00 MHz', snr: 42, noiseFloor: -110, status: 'Estable', satsVisible: 7 },
    { band: 'BeiDou B1I', freq: '1561.098 MHz', snr: 39, noiseFloor: -109, status: 'Estable', satsVisible: 6 },
    { band: 'LoRaWAN / Telemetry EU868', freq: '868.10 MHz', snr: 36, noiseFloor: -118, status: 'Activa', satsVisible: 4 },
    { band: 'Bluetooth Low Energy GNSS', freq: '2402–2480 MHz', snr: 48, noiseFloor: -98, status: 'Cercana', satsVisible: 2 },
  ];

  res.json({
    center: { latitude: baseLat, longitude: baseLon },
    radiusMeters,
    timestamp: new Date().toISOString(),
    discovered,
    spectrumBands,
  });
});

// Link / Connect Scanned Nearby GPS Device(s) to Live Fleet
app.post('/api/gps/connect-scanned', (req: Request, res: Response) => {
  const items = Array.isArray(req.body.devices) ? req.body.devices : [req.body];
  const connected: GpsDevice[] = [];

  for (const item of items) {
    if (!item || !item.id) continue;
    const id = String(item.id);
    const existing = devices.get(id);
    const aesKeyHex = existing?.aesKeyHex || crypto.randomBytes(32).toString('hex');

    const dev: GpsDevice = {
      id,
      name: item.name || `GPS Cercano (${id})`,
      imei: item.imei || String(Date.now()).slice(-15),
      model: item.model || 'Transpondedor GNSS Cercano',
      vehicleType: item.vehicleType || 'patrol',
      protocol: item.protocol || 'aes-encrypted-json',
      aesKeyHex,
      speedLimit: 90,
      status: 'moving',
      color: item.color || '#10b981',
      activeGeofences: existing?.activeGeofences || [],
      lastPosition: existing?.lastPosition,
      lastSeen: new Date().toISOString(),
    };

    devices.set(id, dev);
    broadcastSse('device_registered', dev);

    const lat = Number(item.latitude) || 42.8150;
    const lon = Number(item.longitude) || -1.6425;
    const speed = Number(item.speed) || 36;
    const heading = Number(item.heading) || 90;
    const battery = Number(item.battery) || 94;
    const satellites = Number(item.satellites) || 16;

    const payloadObj = {
      deviceId: id,
      latitude: lat,
      longitude: lon,
      altitude: 480,
      speed,
      heading,
      satellites,
      hdop: 0.7,
      battery,
      ignition: true,
      tamper: false,
      sos: false,
      timestamp: new Date().toISOString(),
    };

    const encrypted = encryptAesGcm(JSON.stringify(payloadObj), aesKeyHex);
    totalPacketsDecrypted++;

    const logEntry: CryptoPacketLog = {
      id: `log-scan-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      deviceId: dev.id,
      deviceName: dev.name,
      protocol: dev.protocol,
      transport: 'HTTPS',
      algorithm: 'AES-256-GCM',
      ivHex: encrypted.ivHex,
      ciphertextHex: encrypted.ciphertextHex,
      authTagHex: encrypted.authTagHex,
      decryptedPayload: payloadObj,
      verified: true,
      latencyMs: 1,
      timestamp: payloadObj.timestamp,
    };
    cryptoLogs.unshift(logEntry);
    if (cryptoLogs.length > 100) cryptoLogs.pop();
    broadcastSse('crypto_log', logEntry);

    const pos: GpsPosition = {
      id: `pos-${dev.id}-${Date.now()}`,
      ...payloadObj,
      encryption: {
        algorithm: 'AES-256-GCM',
        verified: true,
        iv: encrypted.ivHex,
        authTag: encrypted.authTagHex,
      },
    };
    ingestPosition(pos, 'RF-SCAN-AES');
    connected.push(devices.get(id)!);
  }

  res.json({ status: 'OK', connected });
});

// 4. Raw Protocols Ingestion (NMEA, Teltonika)
app.post('/api/gps/raw-stream', (req: Request, res: Response) => {
  const { deviceId, format, data } = req.body;
  const device = devices.get(deviceId);
  if (!device) {
    res.status(404).json({ error: 'Dispositivo no encontrado' });
    return;
  }

  let parsed: Partial<GpsPosition> | null = null;
  if (format === 'nmea') {
    parsed = parseNmeaGprmc(data);
  } else if (format === 'teltonika') {
    parsed = parseTeltonikaCodec8(data);
  }

  if (!parsed || parsed.latitude === undefined || parsed.longitude === undefined) {
    res.status(400).json({ error: 'Trama GPS inválida o corrupta' });
    return;
  }

  const pos: GpsPosition = {
    id: `pos-raw-${Date.now()}`,
    deviceId: device.id,
    latitude: parsed.latitude,
    longitude: parsed.longitude,
    altitude: parsed.altitude ?? 0,
    speed: parsed.speed ?? 0,
    heading: parsed.heading ?? 0,
    satellites: parsed.satellites ?? 10,
    hdop: parsed.hdop ?? 1.0,
    battery: 90,
    ignition: true,
    tamper: false,
    sos: false,
    timestamp: new Date().toISOString(),
    encryption: {
      algorithm: 'NONE',
      verified: true,
    },
  };

  ingestPosition(pos, `RAW-${format.toUpperCase()}`);
  res.json({ status: 'OK', position: pos });
});

// 5. Geofences API
app.get('/api/geofences', (_req: Request, res: Response) => {
  res.json(Array.from(geofences.values()));
});

app.post('/api/geofences', (req: Request, res: Response) => {
  const { name, type, center, radius, coordinates, color, speedLimit, alertOnEnter, alertOnExit, description } = req.body;
  if (!name || !type) {
    res.status(400).json({ error: 'Nombre y tipo de geocerca requeridos' });
    return;
  }

  const id = `geo-${Date.now()}`;
  const gf: Geofence = {
    id,
    name,
    type,
    center,
    radius: radius ? Number(radius) : undefined,
    coordinates,
    color: color || '#06b6d4',
    speedLimit: speedLimit ? Number(speedLimit) : undefined,
    alertOnEnter: Boolean(alertOnEnter),
    alertOnExit: Boolean(alertOnExit),
    description: description || '',
  };

  geofences.set(id, gf);
  broadcastSse('geofence_updated', gf);
  res.status(201).json(gf);
});

app.delete('/api/geofences/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  if (geofences.delete(id)) {
    broadcastSse('geofence_deleted', { id });
    res.json({ success: true, id });
  } else {
    res.status(404).json({ error: 'Geocerca no encontrada' });
  }
});

// 6. Alerts & Notifications API
app.get('/api/alerts', (_req: Request, res: Response) => {
  res.json(alerts);
});

app.post('/api/alerts/clear', (_req: Request, res: Response) => {
  alerts.forEach(a => (a.read = true));
  broadcastSse('alerts_cleared', {});
  res.json({ success: true });
});

// 7. Crypto Packet Logs API
app.get('/api/crypto-logs', (_req: Request, res: Response) => {
  res.json(cryptoLogs);
});

// 8. Telemetry Stats API
app.get('/api/stats', (_req: Request, res: Response) => {
  const stats: TelemetryStats = {
    totalDevices: devices.size,
    activeDevices: Array.from(devices.values()).filter(d => d.status === 'moving' || d.status === 'idle').length,
    alertsCount: alerts.filter(a => !a.read).length,
    packetsDecrypted: totalPacketsDecrypted,
    avgDecryptionTimeMs: totalPacketsDecrypted > 0 ? parseFloat((totalDecryptionTimeMs / totalPacketsDecrypted).toFixed(2)) : 0,
    simulationRunning,
    tcpPort: TCP_PORT,
    tcpStatus: tcpServerStatus,
  };
  res.json(stats);
});

app.post('/api/simulation/toggle', (_req: Request, res: Response) => {
  simulationRunning = !simulationRunning;
  res.json({ simulationRunning });
});

// 9. Debian Linux Gateway Scripts & Config Generator
app.get('/api/debian/config', (req: Request, res: Response) => {
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || 'localhost:3000';
  const serverOrigin = `${proto}://${host}`;

  const systemdService = generateDebianSystemdService();
  const mosquittoConf = generateDebianMosquittoConf();
  const pythonScript = generateDebianPythonScript(serverOrigin);
  const installScript = generateDebianInstallScript(serverOrigin);

  res.json({
    systemdService,
    mosquittoConf,
    pythonScript,
    installScript,
  });
});

// 10. Server-Sent Events (SSE) Stream
app.get('/api/stream/events', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  sseClients.push(res);

  // Send initial snapshot
  const initialData = {
    devices: Array.from(devices.values()),
    alerts: alerts.slice(0, 20),
    cryptoLogs: cryptoLogs.slice(0, 20),
  };
  res.write(`event: snapshot\ndata: ${JSON.stringify(initialData)}\n\n`);

  // Heartbeat ping every 15 seconds
  const pingInterval = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(pingInterval);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(pingInterval);
    const index = sseClients.indexOf(res);
    if (index !== -1) {
      sseClients.splice(index, 1);
    }
  });
});

// --- TCP Socket Server for Raw / AES GPS Hardware Trackers ---

try {
  const tcpServer = net.createServer((socket) => {
    socket.on('data', (data) => {
      try {
        const text = data.toString('utf8').trim();
        // Check if JSON
        if (text.startsWith('{') && text.endsWith('}')) {
          const json = JSON.parse(text);
          if (json.ciphertext && json.iv && json.deviceId) {
            // Forward to AES decryption logic
            const dev = devices.get(json.deviceId);
            if (dev) {
              const res = decryptAesGcm(json.ciphertext, json.iv, json.authTag || '', dev.aesKeyHex);
              if (res.success && res.plaintext) {
                const parsed = JSON.parse(res.plaintext);
                const pos: GpsPosition = {
                  id: `tcp-${Date.now()}`,
                  deviceId: dev.id,
                  latitude: Number(parsed.latitude),
                  longitude: Number(parsed.longitude),
                  altitude: Number(parsed.altitude || 0),
                  speed: Number(parsed.speed || 0),
                  heading: Number(parsed.heading || 0),
                  satellites: Number(parsed.satellites || 12),
                  hdop: 1.0,
                  battery: Number(parsed.battery || 100),
                  ignition: true,
                  tamper: false,
                  sos: false,
                  timestamp: new Date().toISOString(),
                  encryption: {
                    algorithm: 'AES-256-GCM',
                    verified: true,
                    iv: json.iv,
                    authTag: json.authTag,
                  },
                };
                ingestPosition(pos, 'TCP-RAW');
                socket.write(Buffer.from('ACK:OK\r\n'));
              }
            }
          }
        } else if (text.startsWith('$GPRMC') || text.startsWith('$GNGGA')) {
          // NMEA sentence over TCP
          const parsed = parseNmeaGprmc(text);
          if (parsed && parsed.latitude && parsed.longitude) {
            // Assign to first device for demonstration
            const dev = Array.from(devices.values())[0];
            if (dev) {
              const pos: GpsPosition = {
                id: `tcp-nmea-${Date.now()}`,
                deviceId: dev.id,
                latitude: parsed.latitude,
                longitude: parsed.longitude,
                altitude: 0,
                speed: parsed.speed || 0,
                heading: parsed.heading || 0,
                satellites: 10,
                hdop: 1.0,
                battery: 95,
                ignition: true,
                tamper: false,
                sos: false,
                timestamp: new Date().toISOString(),
                encryption: {
                  algorithm: 'NONE',
                  verified: true,
                },
              };
              ingestPosition(pos, 'TCP-NMEA');
              socket.write(Buffer.from('ACK:NMEA\r\n'));
            }
          }
        }
      } catch {
        // Ignore malformed TCP frames
      }
    });

    socket.on('error', () => {
      // Handle socket error gracefully
    });
  });

  tcpServer.listen(TCP_PORT, '0.0.0.0', () => {
    tcpServerStatus = 'listening';
    console.log(`[AegisGPS] TCP Socket Server activo en puerto ${TCP_PORT}`);
  });

  tcpServer.on('error', (err: unknown) => {
    tcpServerStatus = 'error';
    console.warn(`[AegisGPS] TCP port ${TCP_PORT} unavailable or restricted in environment:`, err);
  });
} catch (err) {
  tcpServerStatus = 'error';
  console.warn('[AegisGPS] TCP server initialization skipped:', err);
}

// --- Start Express with Vite dev or Static prod ---

async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  const httpServer = http.createServer(app);
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[AegisGPS] Servidor telemático activo en http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[AegisGPS] Error al iniciar el servidor:', err);
  process.exit(1);
});
