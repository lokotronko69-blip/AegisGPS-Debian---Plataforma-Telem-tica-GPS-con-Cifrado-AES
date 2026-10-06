export type DeviceProtocol =
  | 'aes-encrypted-json'
  | 'teltonika-avl'
  | 'teltonika-codec8'
  | 'nmea-0183'
  | 'nmea-0183-aes'
  | 'osmand'
  | 'gt06'
  | 'mqtt-tls'
  | 'mqtt-tls-aes';

export type DeviceStatus = 'moving' | 'idle' | 'stopped' | 'offline' | 'alert';

export interface GpsPosition {
  id: string;
  deviceId: string;
  latitude: number;
  longitude: number;
  altitude: number; // meters
  speed: number; // km/h
  heading: number; // 0-360 degrees
  satellites: number;
  hdop: number;
  accuracy?: number; // meters (horizontal accuracy radius)
  source?: string; // e.g. GNSS-ALTA-PRECISION, CALIBRADO-EXACTO-1M, NMEA-SERIAL-HW
  battery: number; // 0-100%
  ignition: boolean;
  tamper: boolean;
  sos: boolean;
  timestamp: string; // ISO string
  encryption: {
    algorithm: 'AES-256-GCM' | 'AES-256-CBC' | 'NONE';
    verified: boolean;
    iv?: string;
    authTag?: string;
  };
}

export interface GpsDevice {
  id: string;
  imei: string;
  name: string;
  model: string;
  vehicleType: 'truck' | 'car' | 'van' | 'motorcycle' | 'drone' | 'cargo' | 'person' | 'patrol';
  protocol: DeviceProtocol;
  aesKeyHex: string; // 64 hex characters (32 bytes = 256 bits)
  speedLimit: number; // km/h threshold
  status: DeviceStatus;
  lastPosition?: GpsPosition;
  lastSeen?: string;
  activeGeofences?: string[];
  color: string;
}

export interface Geofence {
  id: string;
  name: string;
  type: 'circle' | 'polygon';
  center?: [number, number]; // [lat, lng] for circle
  radius?: number; // meters for circle
  coordinates?: [number, number][]; // array of [lat, lng] for polygon
  color: string;
  speedLimit?: number;
  alertOnEnter: boolean;
  alertOnExit: boolean;
  description: string;
}

export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface GpsAlert {
  id: string;
  deviceId: string;
  deviceName: string;
  severity: AlertSeverity;
  type: 'geofence-enter' | 'geofence-exit' | 'speeding' | 'sos' | 'low-battery' | 'tamper' | 'offline' | 'crypto-tamper';
  message: string;
  timestamp: string;
  read: boolean;
  latitude?: number;
  longitude?: number;
}

export interface CryptoPacketLog {
  id: string;
  deviceId: string;
  deviceName: string;
  protocol: string;
  transport: 'HTTPS' | 'TCP' | 'MQTT-TLS' | 'WSS';
  algorithm: string;
  ivHex: string;
  ciphertextHex: string;
  authTagHex?: string;
  decryptedPayload: Record<string, unknown>;
  verified: boolean;
  latencyMs: number;
  timestamp: string;
}

export interface TelemetryStats {
  totalDevices: number;
  activeDevices: number;
  alertsCount: number;
  packetsDecrypted: number;
  avgDecryptionTimeMs: number;
  simulationRunning: boolean;
  tcpPort: number;
  tcpStatus: 'listening' | 'error' | 'disabled';
}
