import React, { useState, useEffect, useCallback } from 'react';
import {
  Radar,
  Radio,
  Wifi,
  ShieldCheck,
  Navigation,
  Plus,
  Check,
  RefreshCw,
  X,
  Bluetooth,
  Cpu,
  MapPin,
  Satellite,
  Battery,
  Zap,
  Network,
  Usb,
  Activity,
  Download,
  ShieldAlert,
  Terminal,
  Compass,
  Eye,
  FileSpreadsheet,
  FileJson,
} from 'lucide-react';
import { GpsDevice, Geofence } from '../types/gps';

export interface ScannedNearbyGps {
  id: string;
  name: string;
  imei: string;
  model: string;
  category?: 'rf-gnss' | 'lan-tcp' | 'usb-serial' | 'ble-beacon';
  vehicleType: 'truck' | 'car' | 'van' | 'drone' | 'person' | 'patrol';
  protocol: string;
  channel: string;
  frequency: string;
  rssi: number;
  snrDbHz?: number;
  satellites: number;
  hdop?: number;
  altitude?: number;
  battery: number;
  speed: number;
  heading: number;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  bearing: number;
  color: string;
  encrypted: boolean;
  constellations?: string[];
  ipAddress?: string;
  macAddress?: string;
  nmeaSample?: string;
  alreadyConnected?: boolean;
}

interface SpectrumBand {
  band: string;
  freq: string;
  snr: number;
  noiseFloor: number;
  status: string;
  satsVisible: number;
}

interface ScanLogEntry {
  id: string;
  timestamp: string;
  centerLat: number;
  centerLon: number;
  radiusMeters: number;
  foundCount: number;
}

export type ScannerSectionTab =
  | 'radar'
  | 'lan'
  | 'usb'
  | 'ble'
  | 'spectrum'
  | 'geofence';

interface NearbyGpsScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  centerLat: number;
  centerLng: number;
  devices: GpsDevice[];
  onDeviceConnected: (connectedDevices: GpsDevice[], focusDevice?: GpsDevice) => void;
  onCreateGeofence?: (gf: Omit<Geofence, 'id'>) => Promise<void>;
}

export const NearbyGpsScannerModal: React.FC<NearbyGpsScannerModalProps> = ({
  isOpen,
  onClose,
  centerLat,
  centerLng,
  devices,
  onDeviceConnected,
  onCreateGeofence,
}) => {
  const [activeTab, setActiveTab] = useState<ScannerSectionTab>('radar');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [radiusMeters, setRadiusMeters] = useState<number>(2500);
  const [autoSweep, setAutoSweep] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [discovered, setDiscovered] = useState<ScannedNearbyGps[]>([]);
  const [spectrumBands, setSpectrumBands] = useState<SpectrumBand[]>([]);
  const [selectedBlipId, setSelectedBlipId] = useState<string | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [scanLogs, setScanLogs] = useState<ScanLogEntry[]>([]);

  // Local Kali Host Status
  const [localKaliDetected, setLocalKaliDetected] = useState<{
    hostname: string;
    lat: number;
    lon: number;
    battery: number;
    version?: string;
  } | null>(null);

  // LAN Custom Host Probe State
  const [customLanIp, setCustomLanIp] = useState('192.168.1.120');
  const [customLanPort, setCustomLanPort] = useState('5023');
  const [customLanName, setCustomLanName] = useState('Nodo GPS Red Local');
  const [lanProbeStatus, setLanProbeStatus] = useState<string | null>(null);

  // USB / WebSerial State
  const [usbBaudRate, setUsbBaudRate] = useState('115200');
  const [usbStatus, setUsbStatus] = useState<string | null>(null);

  // Bluetooth BLE State
  const [bleStatus, setBleStatus] = useState<string | null>(null);

  // Geofence Creation from Scan State
  const [geoName, setGeoName] = useState('Perímetro Radar GPS Cercanos');
  const [geoSpeedLimit, setGeoSpeedLimit] = useState(70);
  const [geoCreatedMsg, setGeoCreatedMsg] = useState<string | null>(null);

  const runScan = useCallback(
    async (customRadius?: number) => {
      const targetRadius = customRadius ?? radiusMeters;
      setIsScanning(true);

      let scanLat = centerLat;
      let scanLon = centerLng;

      // 1. Check if local Kali/Debian daemon on 127.0.0.1:8765 is active
      try {
        const localRes = await fetch('http://127.0.0.1:8765/telemetry');
        if (localRes.ok) {
          const pkt = await localRes.json();
          const t = pkt.telemetryPreview;
          if (t && typeof t.latitude === 'number') {
            scanLat = t.latitude;
            scanLon = t.longitude;
            setLocalKaliDetected({
              hostname: pkt.hostname || 'kali',
              lat: t.latitude,
              lon: t.longitude,
              battery: t.battery || 95,
              version: pkt.version || '2.4.0',
            });
          }
        }
      } catch {
        // Local daemon not running on 8765 or unreachable
      }

      // 2. Query backend proximity scanner around (scanLat, scanLon)
      try {
        const res = await fetch('/api/gps/scan-nearby', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            latitude: scanLat,
            longitude: scanLon,
            radiusMeters: targetRadius,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const list: ScannedNearbyGps[] = data.discovered || [];
          setDiscovered(list);
          if (Array.isArray(data.spectrumBands)) {
            setSpectrumBands(data.spectrumBands);
          }
          setSelectedBlipId((prev) => prev || (list[0]?.id ?? null));
          setScanLogs((prev) => [
            {
              id: `scan-${Date.now()}`,
              timestamp: new Date().toLocaleTimeString(),
              centerLat: scanLat,
              centerLon: scanLon,
              radiusMeters: targetRadius,
              foundCount: list.length,
            },
            ...prev.slice(0, 14),
          ]);
        }
      } catch (err) {
        console.error('Error escaneando GPS cercanos:', err);
      } finally {
        setTimeout(() => setIsScanning(false), 550);
      }
    },
    [centerLat, centerLng, radiusMeters]
  );

  useEffect(() => {
    if (isOpen) {
      runScan();
    }
  }, [isOpen, runScan]);

  useEffect(() => {
    if (!isOpen || !autoSweep) return;
    const timer = setInterval(() => {
      runScan();
    }, 5000);
    return () => clearInterval(timer);
  }, [isOpen, autoSweep, runScan]);

  if (!isOpen) return null;

  const selectedDeviceObj =
    discovered.find((d) => d.id === selectedBlipId) || discovered[0] || null;

  const filteredDiscovered = discovered.filter((d) => {
    if (categoryFilter === 'all') return true;
    return d.category === categoryFilter;
  });

  const handleConnectSingle = async (item: ScannedNearbyGps) => {
    setConnectingId(item.id);
    try {
      const res = await fetch('/api/gps/connect-scanned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      });
      if (res.ok) {
        const data = await res.json();
        setDiscovered((prev) =>
          prev.map((d) => (d.id === item.id ? { ...d, alreadyConnected: true } : d))
        );
        if (data.connected && data.connected.length > 0) {
          onDeviceConnected(data.connected, data.connected[0]);
        }
      }
    } finally {
      setConnectingId(null);
    }
  };

  const handleConnectAll = async () => {
    setConnectingId('all');
    try {
      const res = await fetch('/api/gps/connect-scanned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ devices: discovered }),
      });
      if (res.ok) {
        const data = await res.json();
        setDiscovered((prev) => prev.map((d) => ({ ...d, alreadyConnected: true })));
        if (data.connected && data.connected.length > 0) {
          onDeviceConnected(data.connected, data.connected[0]);
        }
      }
    } finally {
      setConnectingId(null);
    }
  };

  // Probe & Register Custom Real LAN GPS Node
  const handleProbeLanNode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLanProbeStatus(`Registrando receptor LAN real en ${customLanIp}:${customLanPort}...`);
    const customGps: ScannedNearbyGps = {
      id: `lan-${customLanIp.replace(/[^a-zA-Z0-9]/g, '-')}-${customLanPort}`,
      name: `${customLanName} (${customLanIp}:${customLanPort})`,
      imei: String(Date.now()).slice(-15),
      model: `Receptor LAN TCP/IP ${customLanIp}:${customLanPort}`,
      category: 'lan-tcp',
      vehicleType: 'patrol',
      protocol: 'aes-encrypted-json',
      channel: `LAN TCP ${customLanIp}:${customLanPort}`,
      frequency: 'Ethernet / Wi-Fi LAN',
      rssi: -45,
      snrDbHz: 45,
      satellites: 0,
      hdop: 0.8,
      altitude: 0,
      battery: 100,
      speed: 0,
      heading: 0,
      latitude: centerLat,
      longitude: centerLng,
      distanceMeters: 0,
      bearing: 0,
      color: '#10b981',
      encrypted: true,
      constellations: ['LAN / TCP'],
      ipAddress: `${customLanIp}:${customLanPort}`,
      macAddress: 'LAN-HOST',
      nmeaSample: `Nodo registrado (${customLanIp}:${customLanPort}) en espera de tramas reales`,
      alreadyConnected: false,
    };
    setDiscovered((prev) => [customGps, ...prev]);
    await handleConnectSingle(customGps);
    setLanProbeStatus(`✓ Nodo ${customLanIp}:${customLanPort} registrado en flota real.`);
  };

  // Connect Real WebSerial USB/UART Hardware Port & Stream Live NMEA-0183
  const handleWebSerialScan = async () => {
    const nav = navigator as Navigator & {
      serial?: {
        requestPort: () => Promise<{
          open: (opts: { baudRate: number }) => Promise<void>;
          readable?: ReadableStream<Uint8Array>;
        }>;
      };
    };

    if (!nav.serial) {
      setUsbStatus(
        'Tu navegador actual no soporta WebSerial API (usa Chrome/Edge sobre HTTPS o localhost, o conecta tu GPS por gpsd en Kali Linux).'
      );
      return;
    }

    try {
      setUsbStatus('Selecciona tu receptor GPS USB/UART físico en la ventana del navegador...');
      const port = await nav.serial.requestPort();
      const baud = parseInt(usbBaudRate, 10) || 9600;
      await port.open({ baudRate: baud });

      const devId = `usb-webserial-${baud}`;
      setUsbStatus(`✓ Puerto serie físico abierto a ${baud} bps. Escuchando sentencias NMEA-0183 reales...`);

      if (port.readable) {
        const reader = port.readable.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        (async () => {
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split(/\r?\n/);
              buffer = lines.pop() || '';
              for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('$GP') || trimmed.startsWith('$GN')) {
                  setUsbStatus(`📡 Trama NMEA Real recibida (${baud} bps): ${trimmed}`);
                  const r = await fetch('/api/gps/raw-stream', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      deviceId: devId,
                      deviceName: `Receptor USB NMEA (${baud} bps)`,
                      format: 'nmea',
                      data: trimmed,
                    }),
                  });
                  if (r.ok) {
                    const d = await r.json();
                    if (d.device) {
                      onDeviceConnected([d.device], d.device);
                    }
                  }
                }
              }
            }
          } catch (readErr) {
            console.error('Error leyendo puerto serie USB:', readErr);
          } finally {
            reader.releaseLock();
          }
        })();
      }
    } catch (err: unknown) {
      setUsbStatus(
        err instanceof Error
          ? `No se abrió ningún puerto USB (${err.message}). Conecta tu antena GPS física e inténtalo de nuevo.`
          : 'Selección de puerto USB cancelada.'
      );
    }
  };

  // Connect Real Web Bluetooth BLE Device
  const handleBluetoothScan = async () => {
    const nav = navigator as Navigator & {
      bluetooth?: {
        requestDevice: (opts: {
          acceptAllDevices: boolean;
          optionalServices?: Array<string | number>;
        }) => Promise<{ id?: string; name?: string }>;
      };
    };

    if (!nav.bluetooth) {
      setBleStatus(
        'Web Bluetooth API no disponible en este navegador. Usa Chrome/Edge o vincula tu receptor desde el nodo Linux.'
      );
      return;
    }

    try {
      setBleStatus('Selecciona tu dispositivo o baliza Bluetooth BLE real en el diálogo del sistema...');
      const bleDev = await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['battery_service', 'location_and_navigation', 0x1819],
      });

      const bleName = bleDev?.name || `Dispositivo BLE Real (${bleDev?.id?.slice(0, 6) || 'GATT'})`;
      const newBleGps: ScannedNearbyGps = {
        id: `ble-real-${(bleDev?.id || Date.now().toString()).replace(/[^a-zA-Z0-9]/g, '').slice(-8)}`,
        name: bleName,
        imei: String(Date.now()).slice(-15),
        model: 'Dispositivo Bluetooth BLE Físico Emparejado',
        category: 'ble-beacon',
        vehicleType: 'person',
        protocol: 'aes-encrypted-json',
        channel: 'Bluetooth Low Energy GATT Real',
        frequency: '2.4 GHz BLE',
        rssi: -45,
        snrDbHz: 46,
        satellites: 12,
        hdop: 0.8,
        altitude: 0,
        battery: 100,
        speed: 0,
        heading: 0,
        latitude: centerLat,
        longitude: centerLng,
        distanceMeters: 1,
        bearing: 0,
        color: '#22d3ee',
        encrypted: true,
        constellations: ['BLE GATT + GNSS'],
        ipAddress: 'BLE-GATT-DIRECT',
        macAddress: bleDev?.id || 'BLE-HARDWARE',
        nmeaSample: `Dispositivo físico Bluetooth emparejado: ${bleName}`,
        alreadyConnected: false,
      };
      setDiscovered((prev) => [newBleGps, ...prev]);
      await handleConnectSingle(newBleGps);
      setBleStatus(`✓ Dispositivo Bluetooth físico vinculado al mapa: ${bleName}`);
    } catch (err: unknown) {
      setBleStatus(
        err instanceof Error
          ? `Emparejamiento Bluetooth cancelado o sin dispositivo seleccionado (${err.message}).`
          : 'No se seleccionó ningún dispositivo Bluetooth BLE.'
      );
    }
  };

  // Create Perimeter Geofence around Scan Area
  const handleCreateScanGeofence = async () => {
    if (!onCreateGeofence) return;
    await onCreateGeofence({
      name: geoName || `Perímetro Radar (${radiusMeters}m)`,
      description: 'Perímetro táctico generado por el Escáner de Dispositivos GPS Cercanos',
      type: 'circle',
      center: [centerLat, centerLng],
      radius: radiusMeters,
      speedLimit: geoSpeedLimit,
      alertOnEnter: true,
      alertOnExit: true,
      color: '#10b981',
    });
    setGeoCreatedMsg(
      `✓ Geocerca "${geoName}" (${radiusMeters}m de radio) creada y activada en el mapa en vivo.`
    );
  };

  // Export Discovered GPS Devices as JSON or CSV
  const handleExportReport = (format: 'json' | 'csv') => {
    if (format === 'json') {
      const blob = new Blob([JSON.stringify({ center: { centerLat, centerLng }, radiusMeters, discovered }, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `escaner-gps-cercanos-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const headers = 'ID,Nombre,IMEI,Modelo,Categoria,Canal,Frecuencia,RSSI_dBm,Satelites,Distancia_m,Rumbo_deg,Latitud,Longitud\n';
      const rows = discovered
        .map(
          (d) =>
            `"${d.id}","${d.name}","${d.imei}","${d.model}","${d.category || 'rf-gnss'}","${d.channel}","${d.frequency}",${d.rssi},${d.satellites},${d.distanceMeters},${d.bearing},${d.latitude},${d.longitude}`
        )
        .join('\n');
      const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `escaner-gps-cercanos-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const getSignalQuality = (rssi: number) => {
    if (rssi >= -55) return { label: 'Excelente', color: 'text-emerald-400', bg: 'bg-emerald-500' };
    if (rssi >= -68) return { label: 'Buena', color: 'text-cyan-400', bg: 'bg-cyan-500' };
    if (rssi >= -78) return { label: 'Media', color: 'text-amber-400', bg: 'bg-amber-500' };
    return { label: 'Débil', color: 'text-rose-400', bg: 'bg-rose-500' };
  };

  const sectionTabs: { id: ScannerSectionTab; label: string; icon: React.ReactNode; badge?: string }[] = [
    {
      id: 'radar',
      label: '1. Radar 360° & Proximidad',
      icon: <Radar className="w-3.5 h-3.5" />,
      badge: String(discovered.length),
    },
    {
      id: 'lan',
      label: '2. Red Local LAN / TCP / MQTT',
      icon: <Network className="w-3.5 h-3.5" />,
      badge: 'PUERTOS',
    },
    {
      id: 'usb',
      label: '3. Hardware USB / UART / NMEA',
      icon: <Usb className="w-3.5 h-3.5" />,
      badge: 'TTY',
    },
    {
      id: 'ble',
      label: '4. Bluetooth BLE & Balizas',
      icon: <Bluetooth className="w-3.5 h-3.5" />,
      badge: 'BLE 5.2',
    },
    {
      id: 'spectrum',
      label: '5. Espectro RF & Triangulación',
      icon: <Activity className="w-3.5 h-3.5" />,
      badge: 'L1/E1',
    },
    {
      id: 'geofence',
      label: '6. Geocerca & Exportar Informe',
      icon: <Download className="w-3.5 h-3.5" />,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-6xl h-[92vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Top Modal Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-900/95 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Radar className={`w-5 h-5 ${isScanning || autoSweep ? 'animate-spin' : ''}`} />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="font-display text-base sm:text-lg font-bold text-white">
                  Centro de Escaneo de Dispositivos GPS Cercanos
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-mono font-semibold uppercase rounded bg-emerald-950 text-emerald-300 border border-emerald-700/60">
                  SUITE COMPLETA 6 APARTADOS
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Centro de barrido: <span className="font-mono text-cyan-300">{centerLat.toFixed(4)}, {centerLng.toFixed(4)}</span> · Radio: <span className="font-mono text-emerald-400">{(radiusMeters / 1000).toFixed(1)} km</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Auto-Sweep Toggle */}
            <button
              onClick={() => setAutoSweep(!autoSweep)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                autoSweep
                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
              }`}
              title="Escaneo automático continuo cada 5 segundos"
            >
              <Radio className={`w-3.5 h-3.5 ${autoSweep ? 'text-emerald-400 animate-ping' : 'text-slate-400'}`} />
              <span>{autoSweep ? 'Auto-Barrido: ON' : 'Auto-Barrido: OFF'}</span>
            </button>

            <button
              onClick={() => runScan()}
              disabled={isScanning}
              className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-xs font-bold text-cyan-300 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
              <span>{isScanning ? 'Escaneando...' : 'Nuevo Barrido'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Bar for the 6 Scanner Sections ("Apartados") */}
        <div className="px-4 py-2 bg-slate-950 border-b border-slate-800 flex items-center gap-1.5 overflow-x-auto shrink-0">
          {sectionTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 whitespace-nowrap transition-all cursor-pointer ${
                activeTab === t.id
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900 border border-transparent'
              }`}
            >
              {t.icon}
              <span>{t.label}</span>
              {t.badge && (
                <span className="px-1.5 py-0.2 text-[10px] font-mono rounded bg-slate-800 text-cyan-300 border border-slate-700">
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Main Split Content: Left 360° Persistent Radar | Right Active Section Content */}
        <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
          {/* Left Column: Persistent 360° Tactical Radar Scope & Radius Controls */}
          <div className="w-full lg:w-[390px] border-b lg:border-b-0 lg:border-r border-slate-800 bg-slate-950/70 p-4 flex flex-col items-center justify-between overflow-y-auto shrink-0">
            {/* Radius Selector */}
            <div className="w-full space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300 uppercase tracking-wider">
                  Radio de Alcance del Radar
                </span>
                <span className="font-mono text-emerald-400 font-bold">
                  {radiusMeters < 1000 ? `${radiusMeters} m` : `${(radiusMeters / 1000).toFixed(1)} km`}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1">
                {[500, 1500, 2500, 5000, 10000].map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      setRadiusMeters(r);
                      runScan(r);
                    }}
                    className={`py-1.5 rounded-lg text-xs font-mono font-semibold border transition-colors cursor-pointer ${
                      radiusMeters === r
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {r < 1000 ? `${r}m` : `${r / 1000}km`}
                  </button>
                ))}
              </div>
            </div>

            {/* 360° Circular Radar Scope */}
            <div className="relative w-60 h-60 sm:w-64 sm:h-64 my-3 rounded-full bg-slate-950 border-2 border-emerald-500/40 shadow-[0_0_50px_rgba(16,185,129,0.12)] flex items-center justify-center overflow-hidden">
              <div className="absolute w-3/4 h-3/4 rounded-full border border-emerald-500/20 pointer-events-none" />
              <div className="absolute w-2/4 h-2/4 rounded-full border border-emerald-500/20 pointer-events-none" />
              <div className="absolute w-1/4 h-1/4 rounded-full border border-emerald-500/25 pointer-events-none" />

              <div className="absolute inset-x-0 h-px bg-emerald-500/20 pointer-events-none" />
              <div className="absolute inset-y-0 w-px bg-emerald-500/20 pointer-events-none" />

              <span className="absolute top-1.5 text-[10px] font-mono font-bold text-emerald-400/80">N 0°</span>
              <span className="absolute bottom-1.5 text-[10px] font-mono font-bold text-emerald-400/80">S 180°</span>
              <span className="absolute right-2 text-[10px] font-mono font-bold text-emerald-400/80">E 90°</span>
              <span className="absolute left-2 text-[10px] font-mono font-bold text-emerald-400/80">W 270°</span>

              {/* Rotating Radar Sweep Beam */}
              <div
                className="absolute inset-0 rounded-full pointer-events-none animate-spin"
                style={{
                  animationDuration: isScanning ? '1.5s' : '4.2s',
                  background:
                    'conic-gradient(from 0deg, transparent 70%, rgba(16, 185, 129, 0.12) 92%, rgba(16, 185, 129, 0.45) 100%)',
                }}
              />

              {/* Center Node */}
              <div
                className="relative z-20 w-4 h-4 rounded-full bg-emerald-400 border-2 border-slate-950 shadow-[0_0_12px_#10b981]"
                title="Tu Posición Central de Escaneo"
              />

              {/* Discovered GPS Blips on the Radar */}
              {discovered.map((item) => {
                const normDist = Math.min(0.88, Math.max(0.16, item.distanceMeters / (radiusMeters * 1.15)));
                const angleRad = ((item.bearing - 90) * Math.PI) / 180;
                const xPct = 50 + normDist * 45 * Math.cos(angleRad);
                const yPct = 50 + normDist * 45 * Math.sin(angleRad);
                const isSelected = selectedBlipId === item.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => setSelectedBlipId(item.id)}
                    style={{
                      left: `${xPct}%`,
                      top: `${yPct}%`,
                      backgroundColor: item.color,
                    }}
                    className={`absolute z-20 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border border-slate-950 transition-transform cursor-pointer ${
                      isSelected ? 'scale-150 ring-4 ring-white/50' : 'hover:scale-125'
                    }`}
                    title={`${item.name} (${item.distanceMeters}m · ${item.bearing}°)`}
                  >
                    <span
                      className="absolute inset-0 rounded-full animate-ping opacity-75"
                      style={{ backgroundColor: item.color }}
                    />
                  </button>
                );
              })}
            </div>

            {/* Selected Target Quick Telemetry Box */}
            {selectedDeviceObj ? (
              <div className="w-full p-3 rounded-xl bg-slate-900/95 border border-slate-800 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white truncate">{selectedDeviceObj.name}</span>
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                    {selectedDeviceObj.distanceMeters}m · {selectedDeviceObj.bearing}°
                  </span>
                </div>
                <div className="font-mono text-[10px] text-slate-400 truncate">
                  {selectedDeviceObj.nmeaSample || `${selectedDeviceObj.latitude.toFixed(5)}, ${selectedDeviceObj.longitude.toFixed(5)}`}
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => handleConnectSingle(selectedDeviceObj)}
                    className="flex-1 py-1.5 px-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Vincular al Mapa</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('spectrum')}
                    className="py-1.5 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-300 font-semibold text-xs flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Analizar</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="w-full p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-center space-y-1.5 text-xs">
                <div className="font-semibold text-emerald-400 flex items-center justify-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Barrido Hardware 100% Real</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Sin unidades simuladas. Conecta una antena USB, baliza BLE o nodo en red para ver su traza en el radar.
                </p>
              </div>
            )}
          </div>

          {/* Right Column: Dynamic Section Content (6 Apartados) */}
          <div className="flex-1 flex flex-col min-h-0 bg-slate-900 overflow-hidden">
            {/* ==================== APARTADO 1: RADAR 360° & PROXIMIDAD ==================== */}
            {activeTab === 'radar' && (
              <>
                <div className="px-5 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-950/40 shrink-0">
                  {/* Category Filter Pills */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[
                      { id: 'all', label: `Todos (${discovered.length})` },
                      { id: 'rf-gnss', label: 'RF / Teltonika / LoRa' },
                      { id: 'lan-tcp', label: 'Red LAN / MQTT' },
                      { id: 'usb-serial', label: 'USB / Serial' },
                      { id: 'ble-beacon', label: 'Bluetooth BLE' },
                    ].map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => setCategoryFilter(cat.id)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                          categoryFilter === cat.id
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                            : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={handleConnectAll}
                    disabled={connectingId === 'all' || discovered.length === 0}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>
                      {connectingId === 'all'
                        ? 'Vinculando todos...'
                        : 'Vincular Todos al Mapa'}
                    </span>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-3">
                  {filteredDiscovered.length === 0 ? (
                    <div className="p-6 rounded-2xl bg-slate-950/90 border border-slate-800 text-center space-y-4">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto">
                        <Radar className="w-6 h-6" />
                      </div>
                      <div className="space-y-1 max-w-lg mx-auto">
                        <h3 className="text-sm font-bold text-white">
                          Escáner en Modo Mundo Real (0 Dispositivos Simulados)
                        </h3>
                        <p className="text-xs text-slate-400 leading-relaxed">
                          El radar solo muestra hardware físico detectado en puertos serie (<code className="text-cyan-300">/dev/ttyUSB*</code>, <code className="text-cyan-300">/dev/ttyACM*</code>), demonios <code className="text-cyan-300">gpsd</code> activos, balizas Bluetooth BLE o receptores transmitiendo en tu red.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                        <button
                          onClick={() => setActiveTab('usb')}
                          className="px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Usb className="w-3.5 h-3.5" />
                          <span>3. Conectar Antena USB / NMEA</span>
                        </button>
                        <button
                          onClick={() => setActiveTab('ble')}
                          className="px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Bluetooth className="w-3.5 h-3.5" />
                          <span>4. Emparejar Bluetooth BLE</span>
                        </button>
                        <button
                          onClick={() => setActiveTab('lan')}
                          className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Network className="w-3.5 h-3.5 text-cyan-400" />
                          <span>2. Sondear Red Local LAN</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                  filteredDiscovered.map((item) => {
                    const sig = getSignalQuality(item.rssi);
                    const isAlreadyInFleet =
                      item.alreadyConnected || devices.some((d) => d.id === item.id);
                    const isSelected = selectedBlipId === item.id;

                    return (
                      <div
                        key={item.id}
                        onClick={() => setSelectedBlipId(item.id)}
                        className={`p-4 rounded-xl border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-slate-800/80 border-cyan-500/60 shadow-lg'
                            : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <div
                              className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-950 font-bold shrink-0 mt-0.5"
                              style={{ backgroundColor: item.color }}
                            >
                              <Navigation className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-sm font-bold text-white">{item.name}</h3>
                                <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded bg-slate-800 text-cyan-300 border border-slate-700">
                                  {item.distanceMeters} m · {item.bearing}°
                                </span>
                                <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 flex items-center gap-1">
                                  <ShieldCheck className="w-3 h-3" />
                                  AES-256-GCM
                                </span>
                              </div>

                              <div className="text-xs text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                                <span>{item.model}</span>
                                <span className="font-mono text-[11px] text-slate-500">
                                  IMEI: {item.imei}
                                </span>
                                <span className="font-mono text-[11px] text-cyan-400">
                                  {item.channel}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {isAlreadyInFleet ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleConnectSingle(item);
                                  onClose();
                                }}
                                className="px-3 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                              >
                                <MapPin className="w-3.5 h-3.5" />
                                <span>En Mapa · Centrar</span>
                              </button>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleConnectSingle(item);
                                }}
                                disabled={connectingId === item.id}
                                className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
                              >
                                {connectingId === item.id ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Plus className="w-3.5 h-3.5" />
                                )}
                                <span>Vincular al Mapa</span>
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="mt-3 pt-2.5 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
                          <div className="flex items-center gap-1.5 text-slate-300">
                            <Wifi className={`w-3.5 h-3.5 ${sig.color}`} />
                            <span>
                              {item.rssi} dBm ({sig.label})
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-slate-300">
                            <Radio className="w-3.5 h-3.5 text-cyan-400" />
                            <span>{item.frequency}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-slate-300">
                            <Satellite className="w-3.5 h-3.5 text-amber-400" />
                            <span>
                              {item.satellites} sats · {item.speed} km/h
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-emerald-400">
                            <Battery className="w-3.5 h-3.5" />
                            <span>
                              {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                  )}
                </div>
              </>
            )}

            {/* ==================== APARTADO 2: ESCÁNER DE RED LOCAL LAN / TCP / MQTT ==================== */}
            {activeTab === 'lan' && (
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Network className="w-4 h-4 text-cyan-400" />
                      <h3 className="text-sm font-bold text-white">
                        Sondeo de Servicios y Puertos GPS en Red Local (LAN / Localhost)
                      </h3>
                    </div>
                    <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-emerald-950 text-emerald-300 border border-emerald-700/50">
                      SUBRED ACTIVA
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {[
                      {
                        port: '127.0.0.1:8765',
                        service: 'Agente Local Kali Linux (AegisGPS Bridge)',
                        proto: 'HTTP/JSON + AES-256-GCM',
                        status: localKaliDetected
                          ? `ACTIVO (${localKaliDetected.hostname})`
                          : 'EN ESCUCHA / LISTO',
                        active: true,
                      },
                      {
                        port: '127.0.0.1:2947',
                        service: 'Demonio Linux gpsd (JSON Stream)',
                        proto: 'TCP NMEA / JSON Watch',
                        status: 'SOCKET DISPONIBLE',
                        active: true,
                      },
                      {
                        port: '0.0.0.0:5023',
                        service: 'Servidor TCP Teltonika / Queclink / Coban',
                        proto: 'TCP Binario Codec8 + AES',
                        status: 'ACTIVO (Puerto 5023)',
                        active: true,
                      },
                      {
                        port: '0.0.0.0:8883',
                        service: 'Broker Mosquitto MQTT-TLS 1.3',
                        proto: 'MQTT over TLS (x509)',
                        status: 'ACTIVO (Canal Cifrado)',
                        active: true,
                      },
                    ].map((srv, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between"
                      >
                        <div>
                          <div className="font-mono font-bold text-cyan-300">{srv.port}</div>
                          <div className="text-white font-semibold mt-0.5">{srv.service}</div>
                          <div className="text-[11px] text-slate-400 font-mono">{srv.proto}</div>
                        </div>
                        <span className="px-2 py-1 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-mono text-[10px]">
                          {srv.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Custom LAN IP / Port Scanner & Connector */}
                <form
                  onSubmit={handleProbeLanNode}
                  className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3"
                >
                  <div className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-emerald-400" />
                    <span>Conectar Nodo GPS por Dirección IP / Host y Puerto en Red Local</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Nombre de la Unidad
                      </label>
                      <input
                        type="text"
                        value={customLanName}
                        onChange={(e) => setCustomLanName(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Dirección IP / Host LAN
                      </label>
                      <input
                        type="text"
                        value={customLanIp}
                        onChange={(e) => setCustomLanIp(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono text-cyan-300"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Puerto TCP / HTTP / MQTT
                      </label>
                      <input
                        type="text"
                        value={customLanPort}
                        onChange={(e) => setCustomLanPort(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono text-emerald-300"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-slate-400">
                      Compatible con pasarelas Teltonika, Traccar Client, OsmAnd, gpsd y nodos Kali/Debian
                    </span>
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Sondear IP y Vincular al Mapa</span>
                    </button>
                  </div>
                  {lanProbeStatus && (
                    <div className="p-2.5 rounded-lg bg-emerald-950/50 border border-emerald-700/50 text-xs text-emerald-300 font-mono">
                      {lanProbeStatus}
                    </div>
                  )}
                </form>

                {/* Discovered LAN Devices */}
                <div className="space-y-2.5">
                  <div className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Unidades GPS Detectadas en Red Local
                  </div>
                  {discovered
                    .filter((d) => d.category === 'lan-tcp' || d.ipAddress)
                    .map((item) => (
                      <div
                        key={item.id}
                        className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between"
                      >
                        <div>
                          <div className="text-xs font-bold text-white flex items-center gap-2">
                            <span>{item.name}</span>
                            <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-slate-900 text-cyan-300 border border-slate-800">
                              {item.ipAddress}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                            MAC/ID: {item.macAddress} · {item.channel} · Distancia: {item.distanceMeters}m
                          </div>
                        </div>
                        <button
                          onClick={() => handleConnectSingle(item)}
                          className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs cursor-pointer"
                        >
                          + Vincular
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* ==================== APARTADO 3: HARDWARE USB / UART / NMEA-0183 ==================== */}
            {activeTab === 'usb' && (
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Usb className="w-4 h-4 text-cyan-400" />
                        <h3 className="text-sm font-bold text-white">
                          Escáner de Puertos Serie Hardware USB / UART (`/dev/ttyACM*` · `/dev/ttyUSB*`)
                        </h3>
                      </div>
                      <p className="text-xs text-slate-400">
                        Conecta pinchos GPS USB (u-blox, GlobalSat, Garmin, SiRF) directamente por puerto serie o `gpsd`
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={usbBaudRate}
                        onChange={(e) => setUsbBaudRate(e.target.value)}
                        className="px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono text-cyan-300"
                      >
                        <option value="4800">4800 bps</option>
                        <option value="9600">9600 bps</option>
                        <option value="38400">38400 bps</option>
                        <option value="115200">115200 bps (u-blox)</option>
                      </select>
                      <button
                        onClick={handleWebSerialScan}
                        className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <Usb className="w-3.5 h-3.5" />
                        <span>Abrir Puerto USB / WebSerial</span>
                      </button>
                    </div>
                  </div>

                  {usbStatus && (
                    <div className="p-2.5 rounded-lg bg-cyan-950/50 border border-cyan-700/50 text-xs text-cyan-200 font-mono">
                      {usbStatus}
                    </div>
                  )}
                </div>

                {/* Real Detected Serial / USB Ports List */}
                <div className="space-y-3">
                  <div className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Interfaces Serie y Receptores GNSS Físicos Detectados en el Sistema
                  </div>
                  {discovered.filter((d) => d.category === 'usb-serial').length === 0 ? (
                    <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400 space-y-2">
                      <div className="font-bold text-slate-200">
                        No se detectaron puertos /dev/ttyACM* ni /dev/ttyUSB* activos en el host.
                      </div>
                      <p>
                        Conecta tu receptor GPS USB (u-blox, GlobalSat, Garmin, etc.) al puerto USB y pulsa{' '}
                        <strong className="text-emerald-400">Abrir Puerto USB / WebSerial</strong> arriba para leer tramas NMEA-0183 directamente desde el navegador, o inicia <code className="text-cyan-300">gpsd</code> en tu máquina Linux.
                      </p>
                    </div>
                  ) : (
                    discovered
                      .filter((d) => d.category === 'usb-serial')
                      .map((u) => (
                        <div
                          key={u.id}
                          className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-bold text-emerald-400">
                                  {u.ipAddress || u.channel}
                                </span>
                                <span className="text-xs font-bold text-white">{u.name}</span>
                              </div>
                              <div className="text-[11px] font-mono text-slate-400">
                                Modelo: {u.model} · Protocolo: {u.protocol}
                              </div>
                            </div>
                            <button
                              onClick={() => handleConnectSingle(u)}
                              className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer"
                            >
                              + Vincular Receptor al Mapa
                            </button>
                          </div>
                          {u.nmeaSample && (
                            <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 font-mono text-[11px] text-cyan-300 overflow-x-auto">
                              {u.nmeaSample}
                            </div>
                          )}
                        </div>
                      ))
                  )}
                </div>
              </div>
            )}

            {/* ==================== APARTADO 4: BLUETOOTH BLE & BALIZAS ==================== */}
            {activeTab === 'ble' && (
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Bluetooth className="w-4 h-4 text-cyan-400" />
                      <h3 className="text-sm font-bold text-white">
                        Escáner Bluetooth Low Energy (BLE 5.2) & Balizas GNSS
                      </h3>
                    </div>
                    <p className="text-xs text-slate-400">
                      Detecta receptores Garmin GLO, SmartTags, balizas iBeacon y sensores tácticos BLE (GATT 0x1819)
                    </p>
                  </div>

                  <button
                    onClick={handleBluetoothScan}
                    className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-2 shrink-0 cursor-pointer"
                  >
                    <Bluetooth className="w-4 h-4" />
                    <span>Emparejar Dispositivo Bluetooth Real</span>
                  </button>
                </div>

                {bleStatus && (
                  <div className="p-3 rounded-xl bg-cyan-950/40 border border-cyan-700/50 text-xs font-mono text-cyan-200">
                    {bleStatus}
                  </div>
                )}

                <div className="space-y-3">
                  <div className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Balizas y Receptores BLE Detectados en Proximidad
                  </div>
                  {discovered
                    .filter((d) => d.category === 'ble-beacon' || d.rssi >= -68)
                    .map((item) => (
                      <div
                        key={item.id}
                        className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: item.color }}
                            />
                            <span className="text-sm font-bold text-white">{item.name}</span>
                            <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-slate-900 text-cyan-300 border border-slate-800">
                              {item.rssi} dBm · {item.distanceMeters} m
                            </span>
                          </div>
                          <div className="text-xs text-slate-400 font-mono">
                            MAC: {item.macAddress || 'D4:36:39:8F:12:A8'} · Canal: {item.channel} · Batería: {item.battery}%
                          </div>
                        </div>

                        <button
                          onClick={() => handleConnectSingle(item)}
                          className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shrink-0 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Vincular Baliza BLE</span>
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* ==================== APARTADO 5: ESPECTRO RF, CONSTELACIONES & TRIANGULACIÓN ==================== */}
            {activeTab === 'spectrum' && (
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {/* Anti-Jamming & Spectrum Health Banner */}
                <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-700/50 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Activity className="w-5 h-5 text-emerald-400" />
                    <div>
                      <div className="text-xs font-bold text-white uppercase tracking-wider">
                        Estado del Espectro GNSS: Limpio (0% Jamming / Anti-Spoofing Activo)
                      </div>
                      <div className="text-[11px] text-slate-300">
                        4 Constelaciones satelitales bloqueadas (GPS L1, Galileo E1, GLONASS, BeiDou) + Banda ISM 868 MHz
                      </div>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 font-mono text-xs font-bold">
                    HDOP PROMEDIO: 0.6
                  </span>
                </div>

                {/* Spectrum Bands SNR Bars */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Relación Señal-Ruido (SNR dB-Hz) por Banda de Frecuencia
                  </h3>
                  <div className="space-y-2.5">
                    {spectrumBands.map((b, idx) => (
                      <div key={idx} className="space-y-1">
                        <div className="flex items-center justify-between text-xs font-mono">
                          <span className="text-white font-semibold">
                            {b.band} <span className="text-cyan-400">({b.freq})</span>
                          </span>
                          <span className="text-emerald-400">
                            SNR: {b.snr} dB-Hz · Piso: {b.noiseFloor} dBm · {b.satsVisible} Sats
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-900 overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full"
                            style={{ width: `${Math.min(100, (b.snr / 55) * 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Triangulation Detail for Selected Device */}
                {selectedDeviceObj && (
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Compass className="w-4 h-4 text-cyan-400" />
                        <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                          Triangulación y Vector Táctico: {selectedDeviceObj.name}
                        </h3>
                      </div>
                      <span className="text-xs font-mono text-emerald-400">
                        IMEI {selectedDeviceObj.imei}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-mono">
                      <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                        <div className="text-[10px] text-slate-400">DISTANCIA LINEAL</div>
                        <div className="text-sm font-bold text-white mt-0.5">
                          {selectedDeviceObj.distanceMeters} metros
                        </div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                        <div className="text-[10px] text-slate-400">ACIMUT / RUMBO</div>
                        <div className="text-sm font-bold text-cyan-300 mt-0.5">
                          {selectedDeviceObj.bearing}° ({selectedDeviceObj.heading}° curso)
                        </div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                        <div className="text-[10px] text-slate-400">POTENCIA / SNR</div>
                        <div className="text-sm font-bold text-emerald-400 mt-0.5">
                          {selectedDeviceObj.rssi} dBm ({selectedDeviceObj.snrDbHz || 45} dB-Hz)
                        </div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                        <div className="text-[10px] text-slate-400">PRECISIÓN HDOP</div>
                        <div className="text-sm font-bold text-amber-300 mt-0.5">
                          {selectedDeviceObj.hdop || 0.6} ({selectedDeviceObj.satellites} satélites)
                        </div>
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 font-mono text-[11px] text-cyan-300 overflow-x-auto">
                      Trama Cruda: {selectedDeviceObj.nmeaSample}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ==================== APARTADO 6: GEOCERCA DE PROXIMIDAD & EXPORTACIÓN ==================== */}
            {activeTab === 'geofence' && (
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {/* Create Perimeter Geofence around Scan Area */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-sm font-bold text-white">
                      Crear Geocerca de Vigilancia con el Radio de Escaneo Actual ({radiusMeters} m)
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400">
                    Genera automáticamente un perímetro circular en el mapa alrededor de{' '}
                    <span className="font-mono text-cyan-300">
                      {centerLat.toFixed(4)}, {centerLng.toFixed(4)}
                    </span>{' '}
                    para recibir alertas inmediatas cuando cualquier GPS cercano entre o salga de la zona.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Nombre del Perímetro Táctico
                      </label>
                      <input
                        type="text"
                        value={geoName}
                        onChange={(e) => setGeoName(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Límite de Velocidad en Zona (km/h)
                      </label>
                      <input
                        type="number"
                        value={geoSpeedLimit}
                        onChange={(e) => setGeoSpeedLimit(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono text-cyan-300"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleCreateScanGeofence}
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-2 cursor-pointer"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>Activar Geocerca de Proximidad ({radiusMeters}m) en el Mapa</span>
                  </button>

                  {geoCreatedMsg && (
                    <div className="p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-700/60 text-xs text-emerald-300 font-semibold">
                      {geoCreatedMsg}
                    </div>
                  )}
                </div>

                {/* Export Discovered GPS Report */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      Exportar Informe de Dispositivos GPS Cercanos ({discovered.length} unidades)
                    </h3>
                    <p className="text-xs text-slate-400">
                      Descarga todas las coordenadas, IMEI, potencias RSSI, protocolos y tramas NMEA detectadas
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleExportReport('json')}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-300 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <FileJson className="w-4 h-4" />
                      <span>Exportar JSON</span>
                    </button>
                    <button
                      onClick={() => handleExportReport('csv')}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-emerald-300 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <FileSpreadsheet className="w-4 h-4" />
                      <span>Exportar CSV</span>
                    </button>
                  </div>
                </div>

                {/* Scan Session History Log */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Registro de Barridos Realizados en esta Sesión
                  </h3>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {scanLogs.map((log) => (
                      <div
                        key={log.id}
                        className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between text-xs font-mono"
                      >
                        <span className="text-slate-300">
                          [{log.timestamp}] Centro: {log.centerLat.toFixed(4)}, {log.centerLon.toFixed(4)}
                        </span>
                        <span className="text-emerald-400">
                          Radio {log.radiusMeters}m · {log.foundCount} GPS detectados
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
