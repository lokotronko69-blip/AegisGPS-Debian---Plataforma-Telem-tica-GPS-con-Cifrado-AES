import type { ScannedNearbyGps } from '../components/NearbyGpsScannerModal';

function projectCoord(
  lat: number,
  lon: number,
  distanceMeters: number,
  bearingDeg: number
): { latitude: number; longitude: number } {
  const rad = (bearingDeg * Math.PI) / 180;
  const dLat = (distanceMeters * Math.cos(rad)) / 111320;
  const cosLat = Math.max(0.1, Math.cos((lat * Math.PI) / 180));
  const dLon = (distanceMeters * Math.sin(rad)) / (111320 * cosLat);
  return {
    latitude: parseFloat((lat + dLat).toFixed(7)),
    longitude: parseFloat((lon + dLon).toFixed(7)),
  };
}

function formatNmeaGga(lat: number, lon: number, sats: number, hdop: number, alt: number): string {
  const hhmmss = new Date().toISOString().slice(11, 19).replace(/:/g, '');
  const absLat = Math.abs(lat);
  const latDeg = Math.floor(absLat);
  const latMin = (absLat - latDeg) * 60;
  const latStr = `${String(latDeg).padStart(2, '0')}${latMin.toFixed(4).padStart(7, '0')}`;
  const absLon = Math.abs(lon);
  const lonDeg = Math.floor(absLon);
  const lonMin = (absLon - lonDeg) * 60;
  const lonStr = `${String(lonDeg).padStart(3, '0')}${lonMin.toFixed(4).padStart(7, '0')}`;
  return `$GNGGA,${hhmmss}.00,${latStr},${lat >= 0 ? 'N' : 'S'},${lonStr},${lon >= 0 ? 'E' : 'W'},1,${String(sats).padStart(2, '0')},${hdop.toFixed(1)},${alt.toFixed(1)},M,0.0,M,,*4A`;
}

export function buildNearbyGpsCatalog(
  centerLat: number,
  centerLon: number,
  radiusMeters = 2500,
  connectedIds: Set<string> = new Set()
): ScannedNearbyGps[] {
  const baseLat = !isNaN(centerLat) && centerLat !== 0 ? centerLat : 42.815;
  const baseLon = !isNaN(centerLon) && centerLon !== 0 ? centerLon : -1.6425;
  const scale = Math.min(1, Math.max(0.15, radiusMeters / 2500));

  const rawItems: Array<{
    id: string;
    name: string;
    imei: string;
    model: string;
    category: NonNullable<ScannedNearbyGps['category']>;
    vehicleType: ScannedNearbyGps['vehicleType'];
    protocol: ScannedNearbyGps['protocol'];
    channel: string;
    frequency: string;
    rssi: number;
    snrDbHz: number;
    satellites: number;
    hdop: number;
    altitude: number;
    battery: number;
    speed: number;
    heading: number;
    dist: number;
    bearing: number;
    color: string;
    ipAddress: string;
    macAddress: string;
  }> = [
    {
      id: 'scan-usb-ublox-m9n',
      name: 'Antena GNSS USB u-blox NEO-M9N (/dev/ttyACM0)',
      imei: '869104058811520',
      model: 'u-blox NEO-M9N Concurrent GNSS USB/UART',
      category: 'usb-serial',
      vehicleType: 'patrol',
      protocol: 'nmea-0183',
      channel: '/dev/ttyACM0 · USB Serial 115200 bps',
      frequency: '1575.42 MHz L1 / E1',
      rssi: -39,
      snrDbHz: 49,
      satellites: 19,
      hdop: 0.5,
      altitude: 448,
      battery: 100,
      speed: 0,
      heading: 0,
      dist: Math.max(2, Math.round(4 * scale)),
      bearing: 18,
      color: '#06b6d4',
      ipAddress: '/dev/ttyACM0 (115200 bps)',
      macAddress: 'USB:1546:01A9',
    },
    {
      id: 'scan-usb-globalsat-gpsd',
      name: 'Receptor Serie GlobalSat BU-353N5 (gpsd :2947)',
      imei: '869104058802947',
      model: 'GlobalSat SiRF Star V / Demonio gpsd Linux',
      category: 'usb-serial',
      vehicleType: 'car',
      protocol: 'nmea-0183',
      channel: '/dev/ttyUSB0 · Socket TCP 127.0.0.1:2947',
      frequency: '1575.42 MHz GNSS L1',
      rssi: -43,
      snrDbHz: 47,
      satellites: 17,
      hdop: 0.6,
      altitude: 452,
      battery: 100,
      speed: 0,
      heading: 90,
      dist: Math.max(5, Math.round(9 * scale)),
      bearing: 84,
      color: '#14b8a6',
      ipAddress: '127.0.0.1:2947 (/dev/ttyUSB0)',
      macAddress: 'USB:067B:23A3',
    },
    {
      id: 'scan-ble-garmin-glo2',
      name: 'Receptor Bluetooth BLE Garmin GLO 2',
      imei: '863051049201819',
      model: 'Garmin GLO 2 Aviation GPS/GLONASS BLE 5.2',
      category: 'ble-beacon',
      vehicleType: 'person',
      protocol: 'aes-encrypted-json',
      channel: 'Bluetooth BLE GATT 0x1819 (Location & Nav)',
      frequency: '2.402 GHz BLE + 1575.42 MHz',
      rssi: -46,
      snrDbHz: 46,
      satellites: 18,
      hdop: 0.5,
      altitude: 449,
      battery: 94,
      speed: 0,
      heading: 145,
      dist: Math.max(6, Math.round(14 * scale)),
      bearing: 145,
      color: '#22d3ee',
      ipAddress: 'BLE-GATT://0x1819',
      macAddress: 'D4:36:39:8F:12:A8',
    },
    {
      id: 'scan-ble-tactical-tag',
      name: 'Baliza Proximidad BLE 5.2 / UWB Táctica',
      imei: '863051049205201',
      model: 'SmartTag UWB + Baliza Telemetría BLE GATT',
      category: 'ble-beacon',
      vehicleType: 'van',
      protocol: 'aes-encrypted-json',
      channel: 'Bluetooth Low Energy CH-37/38/39 Adv',
      frequency: '2.480 GHz BLE 5.2',
      rssi: -53,
      snrDbHz: 43,
      satellites: 14,
      hdop: 0.7,
      altitude: 446,
      battery: 89,
      speed: 0,
      heading: 235,
      dist: Math.max(12, Math.round(28 * scale)),
      bearing: 235,
      color: '#38bdf8',
      ipAddress: 'BLE-ADV://CH37',
      macAddress: 'E8:9F:6D:44:7B:19',
    },
    {
      id: 'scan-lan-smartphone-osmand',
      name: 'Smartphone Android / iOS (OsmAnd / Traccar LAN)',
      imei: '867584039108080',
      model: 'Terminal Móvil GNSS Dual-Band L1+L5 Wi-Fi',
      category: 'lan-tcp',
      vehicleType: 'person',
      protocol: 'osmand',
      channel: 'HTTP Push LAN (192.168.1.45:5055)',
      frequency: '5 GHz Wi-Fi LAN + GNSS L1/L5',
      rssi: -48,
      snrDbHz: 45,
      satellites: 20,
      hdop: 0.5,
      altitude: 450,
      battery: 86,
      speed: 4,
      heading: 195,
      dist: Math.max(18, Math.round(52 * scale)),
      bearing: 195,
      color: '#38bdf8',
      ipAddress: '192.168.1.45:5055',
      macAddress: 'A4:83:E7:21:9C:50',
    },
    {
      id: 'scan-lan-kali-gateway',
      name: 'Pasarela Red Local LAN / Broker MQTT-TLS',
      imei: '867584039108883',
      model: 'Nodo Receptor Subred Linux TCP :5023 / MQTT :8883',
      category: 'lan-tcp',
      vehicleType: 'patrol',
      protocol: 'mqtt-tls',
      channel: 'LAN TCP 192.168.1.120:5023 · TLS 1.3',
      frequency: 'Ethernet / Wi-Fi Subred Local',
      rssi: -49,
      snrDbHz: 45,
      satellites: 16,
      hdop: 0.6,
      altitude: 451,
      battery: 100,
      speed: 0,
      heading: 290,
      dist: Math.max(25, Math.round(85 * scale)),
      bearing: 290,
      color: '#10b981',
      ipAddress: '192.168.1.120:5023',
      macAddress: '00:1B:63:84:45:E6',
    },
    {
      id: 'scan-rf-teltonika-fmb920',
      name: 'Teltonika FMB920 / FMC130 Vehicular',
      imei: '352093089412874',
      model: 'Teltonika FMB920 Codec 8 Extended AVL',
      category: 'rf-gnss',
      vehicleType: 'truck',
      protocol: 'teltonika-avl',
      channel: 'TCP Codec 8 Extended (:5023)',
      frequency: '1575.42 MHz L1 + LTE Cat-M1',
      rssi: -54,
      snrDbHz: 44,
      satellites: 17,
      hdop: 0.6,
      altitude: 455,
      battery: 99,
      speed: 32,
      heading: 42,
      dist: Math.max(45, Math.round(145 * scale)),
      bearing: 42,
      color: '#f59e0b',
      ipAddress: 'TCP :5023 (AVL)',
      macAddress: 'IMEI:352093089412874',
    },
    {
      id: 'scan-rf-obd-sinotrack',
      name: 'Localizador Vehicular OBD-II SinoTrack ST-906',
      imei: '864120039582104',
      model: 'OBD-II CAN-BUS + Concox GT06 GNSS',
      category: 'rf-gnss',
      vehicleType: 'car',
      protocol: 'gt06',
      channel: 'GT06 Binario TCP (:5023)',
      frequency: '1575.42 MHz GNSS L1',
      rssi: -57,
      snrDbHz: 42,
      satellites: 15,
      hdop: 0.7,
      altitude: 447,
      battery: 100,
      speed: 18,
      heading: 118,
      dist: Math.max(65, Math.round(230 * scale)),
      bearing: 118,
      color: '#10b981',
      ipAddress: 'TCP :5023 (GT06)',
      macAddress: 'IMEI:864120039582104',
    },
    {
      id: 'scan-rf-drone-mavlink',
      name: 'Dron Táctico MAVLink + Baliza LoRa 868MHz',
      imei: '869901047729315',
      model: 'Pixhawk u-blox M9N + LILYGO T-Beam Meshtastic',
      category: 'rf-gnss',
      vehicleType: 'drone',
      protocol: 'aes-encrypted-json',
      channel: 'Telemetría RF 868.1 MHz LoRa SF7 + MAVLink',
      frequency: '868.10 MHz ISM / 1575.42 MHz L1',
      rssi: -61,
      snrDbHz: 40,
      satellites: 21,
      hdop: 0.5,
      altitude: 520,
      battery: 91,
      speed: 46,
      heading: 325,
      dist: Math.max(90, Math.round(360 * scale)),
      bearing: 325,
      color: '#a855f7',
      ipAddress: 'LoRa-868MHz / MAVLink',
      macAddress: 'LORA:7E:91:04:B2',
    },
  ];

  return rawItems.map((item) => {
    const coord = projectCoord(baseLat, baseLon, item.dist, item.bearing);
    return {
      id: item.id,
      name: item.name,
      imei: item.imei,
      model: item.model,
      category: item.category,
      vehicleType: item.vehicleType,
      protocol: item.protocol,
      channel: item.channel,
      frequency: item.frequency,
      rssi: item.rssi,
      snrDbHz: item.snrDbHz,
      satellites: item.satellites,
      hdop: item.hdop,
      altitude: item.altitude,
      battery: item.battery,
      speed: item.speed,
      heading: item.heading,
      latitude: coord.latitude,
      longitude: coord.longitude,
      distanceMeters: item.dist,
      bearing: item.bearing,
      color: item.color,
      encrypted: true,
      constellations: ['GPS L1', 'Galileo E1', 'GLONASS', 'BeiDou'],
      ipAddress: item.ipAddress,
      macAddress: item.macAddress,
      nmeaSample: formatNmeaGga(coord.latitude, coord.longitude, item.satellites, item.hdop, item.altitude),
      alreadyConnected: connectedIds.has(item.id),
    };
  });
}
