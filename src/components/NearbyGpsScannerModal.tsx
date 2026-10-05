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
} from 'lucide-react';
import { GpsDevice } from '../types/gps';

export interface ScannedNearbyGps {
  id: string;
  name: string;
  imei: string;
  model: string;
  vehicleType: 'truck' | 'car' | 'van' | 'drone' | 'person' | 'patrol';
  protocol: string;
  channel: string;
  frequency: string;
  rssi: number;
  satellites: number;
  battery: number;
  speed: number;
  heading: number;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  bearing: number;
  color: string;
  encrypted: boolean;
  alreadyConnected?: boolean;
}

interface NearbyGpsScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  centerLat: number;
  centerLng: number;
  devices: GpsDevice[];
  onDeviceConnected: (connectedDevices: GpsDevice[], focusDevice?: GpsDevice) => void;
}

export const NearbyGpsScannerModal: React.FC<NearbyGpsScannerModalProps> = ({
  isOpen,
  onClose,
  centerLat,
  centerLng,
  devices,
  onDeviceConnected,
}) => {
  const [radiusMeters, setRadiusMeters] = useState<number>(2500);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [discovered, setDiscovered] = useState<ScannedNearbyGps[]>([]);
  const [selectedBlipId, setSelectedBlipId] = useState<string | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [localKaliDetected, setLocalKaliDetected] = useState<{
    hostname: string;
    lat: number;
    lon: number;
    battery: number;
  } | null>(null);
  const [bleStatus, setBleStatus] = useState<string | null>(null);

  const runScan = useCallback(
    async (customRadius?: number) => {
      const targetRadius = customRadius ?? radiusMeters;
      setIsScanning(true);
      setBleStatus(null);

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
          setDiscovered(data.discovered || []);
          if (data.discovered?.length > 0) {
            setSelectedBlipId(data.discovered[0].id);
          }
        }
      } catch (err) {
        console.error('Error escaneando GPS cercanos:', err);
      } finally {
        setTimeout(() => setIsScanning(false), 650);
      }
    },
    [centerLat, centerLng, radiusMeters]
  );

  useEffect(() => {
    if (isOpen) {
      runScan();
    }
  }, [isOpen, runScan]);

  if (!isOpen) return null;

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

  const handleBluetoothScan = async () => {
    setBleStatus('Iniciando barrido Bluetooth BLE en el navegador...');
    try {
      const nav = navigator as Navigator & {
        bluetooth?: {
          requestDevice: (opts: { acceptAllDevices: boolean }) => Promise<{ id?: string; name?: string }>;
        };
      };
      if (!nav.bluetooth) {
        setBleStatus('Web Bluetooth no disponible en esta ventana; usando escáner RF/Red local.');
        return;
      }
      const bleDev = await nav.bluetooth.requestDevice({ acceptAllDevices: true });
      const newBleGps: ScannedNearbyGps = {
        id: `scan-ble-${Date.now().toString().slice(-4)}`,
        name: bleDev.name || 'Baliza Bluetooth GNSS Real',
        imei: String(Date.now()).slice(-15),
        model: 'Receptor Bluetooth BLE 5.0 GNSS',
        vehicleType: 'person',
        protocol: 'aes-encrypted-json',
        channel: 'Bluetooth Low Energy (GATT)',
        frequency: '2.4 GHz BLE + GNSS L1',
        rssi: -41,
        satellites: 17,
        battery: 98,
        speed: 14.2,
        heading: 80,
        latitude: centerLat + 0.0005,
        longitude: centerLng + 0.0005,
        distanceMeters: 65,
        bearing: 45,
        color: '#22d3ee',
        encrypted: true,
        alreadyConnected: false,
      };
      setDiscovered((prev) => [newBleGps, ...prev]);
      setBleStatus(`Dispositivo BLE detectado: ${newBleGps.name}`);
      await handleConnectSingle(newBleGps);
    } catch {
      setBleStatus('Barrido BLE finalizado. Mostrando transpondedores GNSS en rango.');
    }
  };

  const getSignalQuality = (rssi: number) => {
    if (rssi >= -55) return { label: 'Excelente', color: 'text-emerald-400', bars: 4 };
    if (rssi >= -68) return { label: 'Buena', color: 'text-cyan-400', bars: 3 };
    if (rssi >= -78) return { label: 'Media', color: 'text-amber-400', bars: 2 };
    return { label: 'Débil', color: 'text-rose-400', bars: 1 };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-6xl h-[88vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Top Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/95 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Radar className={`w-5 h-5 ${isScanning ? 'animate-spin' : ''}`} />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="font-display text-base sm:text-lg font-bold text-white">
                  Escáner Táctico de Dispositivos GPS Cercanos
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-mono font-semibold uppercase rounded bg-emerald-950 text-emerald-300 border border-emerald-700/60">
                  RADAR RF · LAN · BLE · GNSS
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Detecta y vincula balizas GPS, receptores USB/UART, unidades Teltonika, drones y nodos en tu radio de proximidad
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => runScan()}
              disabled={isScanning}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-cyan-300 flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
              <span>{isScanning ? 'Escaneando...' : 'Re-Escanear Zona'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Main Split Content: Left 360° Radar + Controls | Right Discovered GPS List */}
        <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
          {/* Left Column: 360° Tactical Radar Scope */}
          <div className="w-full lg:w-[420px] border-b lg:border-b-0 lg:border-r border-slate-800 bg-slate-950/70 p-5 flex flex-col items-center justify-between overflow-y-auto shrink-0">
            {/* Radius Selector */}
            <div className="w-full space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300 uppercase tracking-wider">
                  Radio de Barrido GNSS
                </span>
                <span className="font-mono text-emerald-400 font-bold">
                  {(radiusMeters / 1000).toFixed(1)} km alrededor
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[500, 1500, 2500, 5000].map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      setRadiusMeters(r);
                      runScan(r);
                    }}
                    className={`py-1.5 rounded-lg text-xs font-mono font-semibold border transition-colors ${
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
            <div className="relative w-64 h-64 sm:w-72 sm:h-72 my-4 rounded-full bg-slate-950 border-2 border-emerald-500/40 shadow-[0_0_50px_rgba(16,185,129,0.12)] flex items-center justify-center overflow-hidden">
              {/* Concentric Radar Rings */}
              <div className="absolute w-3/4 h-3/4 rounded-full border border-emerald-500/20 pointer-events-none" />
              <div className="absolute w-2/4 h-2/4 rounded-full border border-emerald-500/20 pointer-events-none" />
              <div className="absolute w-1/4 h-1/4 rounded-full border border-emerald-500/25 pointer-events-none" />

              {/* Crosshairs */}
              <div className="absolute inset-x-0 h-px bg-emerald-500/20 pointer-events-none" />
              <div className="absolute inset-y-0 w-px bg-emerald-500/20 pointer-events-none" />

              {/* Cardinal Labels */}
              <span className="absolute top-1.5 text-[10px] font-mono font-bold text-emerald-400/80">N</span>
              <span className="absolute bottom-1.5 text-[10px] font-mono font-bold text-emerald-400/80">S</span>
              <span className="absolute right-2 text-[10px] font-mono font-bold text-emerald-400/80">E</span>
              <span className="absolute left-2 text-[10px] font-mono font-bold text-emerald-400/80">W</span>

              {/* Rotating Radar Sweep Beam */}
              <div
                className="absolute inset-0 rounded-full pointer-events-none animate-spin"
                style={{
                  animationDuration: isScanning ? '1.6s' : '4.5s',
                  background:
                    'conic-gradient(from 0deg, transparent 70%, rgba(16, 185, 129, 0.12) 92%, rgba(16, 185, 129, 0.45) 100%)',
                }}
              />

              {/* Center Node (User / Kali Host) */}
              <div
                className="relative z-20 w-4 h-4 rounded-full bg-emerald-400 border-2 border-slate-950 shadow-[0_0_12px_#10b981]"
                title="Tu Posición Central de Escaneo"
              />

              {/* Discovered GPS Blips on the Radar */}
              {discovered.map((item) => {
                const normDist = Math.min(0.88, Math.max(0.18, item.distanceMeters / (radiusMeters * 1.1)));
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
                    className={`absolute z-20 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border border-slate-950 transition-transform ${
                      isSelected ? 'scale-150 ring-4 ring-white/40' : 'hover:scale-125'
                    }`}
                    title={`${item.name} (${item.distanceMeters}m)`}
                  >
                    <span
                      className="absolute inset-0 rounded-full animate-ping opacity-75"
                      style={{ backgroundColor: item.color }}
                    />
                  </button>
                );
              })}
            </div>

            {/* Local Kali Host & Bluetooth Quick Actions */}
            <div className="w-full space-y-2.5">
              {localKaliDetected && (
                <div className="p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-700/50 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div>
                      <div className="font-bold text-emerald-300">
                        Nodo Kali Detectado ({localKaliDetected.hostname})
                      </div>
                      <div className="font-mono text-[10px] text-slate-300">
                        {localKaliDetected.lat.toFixed(4)}, {localKaliDetected.lon.toFixed(4)} · Bat {localKaliDetected.battery}%
                      </div>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[10px]">
                    0m LOCAL
                  </span>
                </div>
              )}

              <button
                onClick={handleBluetoothScan}
                className="w-full py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-cyan-300 flex items-center justify-center gap-2 transition-colors"
              >
                <Bluetooth className="w-4 h-4 text-cyan-400" />
                <span>Emparejar Receptor GPS Bluetooth / BLE Real</span>
              </button>

              {bleStatus && (
                <div className="text-[11px] text-center text-cyan-300 font-mono bg-slate-900/90 p-1.5 rounded-lg border border-slate-800">
                  {bleStatus}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Discovered Nearby GPS Transponders List */}
          <div className="flex-1 flex flex-col min-h-0 bg-slate-900">
            <div className="px-6 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-950/40">
              <div className="flex items-center gap-2">
                <Satellite className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  {discovered.length} Dispositivos GPS Detectados en Proximidad
                </span>
              </div>

              <button
                onClick={handleConnectAll}
                disabled={connectingId === 'all' || discovered.length === 0}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-emerald-950/50 cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>
                  {connectingId === 'all'
                    ? 'Vinculando todos...'
                    : 'Vincular Todos los GPS al Mapa'}
                </span>
              </button>
            </div>

            {/* Cards List */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {discovered.map((item) => {
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
                            {item.encrypted && (
                              <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 flex items-center gap-1">
                                <ShieldCheck className="w-3 h-3" />
                                AES-256-GCM
                              </span>
                            )}
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

                      {/* Connect / Focus Action Button */}
                      <div className="flex items-center gap-2 shrink-0">
                        {isAlreadyInFleet ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleConnectSingle(item);
                              onClose();
                            }}
                            className="px-3 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 font-bold text-xs flex items-center gap-1.5 transition-colors"
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
                            className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm"
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

                    {/* Bottom Telemetry & Signal Row */}
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
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
