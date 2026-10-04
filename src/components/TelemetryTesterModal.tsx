import React, { useState, useEffect } from 'react';
import { 
  Radio, 
  Send, 
  ShieldCheck, 
  Zap, 
  AlertTriangle, 
  Lock, 
  Check, 
  X,
  Gauge,
  Compass,
  Battery
} from 'lucide-react';
import { GpsDevice } from '../types/gps';
import { encryptAes256Gcm } from '../utils/crypto';

interface TelemetryTesterModalProps {
  isOpen: boolean;
  onClose: () => void;
  devices: GpsDevice[];
  selectedDevice?: GpsDevice | null;
}

export const TelemetryTesterModal: React.FC<TelemetryTesterModalProps> = ({
  isOpen,
  onClose,
  devices,
  selectedDevice,
}) => {
  const [targetDeviceId, setTargetDeviceId] = useState<string>(
    selectedDevice?.id || devices[0]?.id || ''
  );
  const [lat, setLat] = useState('42.8150');
  const [lng, setLng] = useState('-1.6425');
  const [altitude, setAltitude] = useState('450');
  const [speed, setSpeed] = useState('85');
  const [heading, setHeading] = useState('90');
  const [satellites, setSatellites] = useState('16');
  const [battery, setBattery] = useState('95');
  const [ignition, setIgnition] = useState(true);
  const [tamper, setTamper] = useState(false);
  const [sos, setSos] = useState(false);
  const [transport, setTransport] = useState<'HTTPS' | 'TCP' | 'MQTT-TLS'>('HTTPS');

  const [isSending, setIsSending] = useState(false);
  const [lastResult, setLastResult] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    const dev = selectedDevice || devices[0];
    if (dev) {
      setTargetDeviceId(dev.id);
      if (dev.lastPosition) {
        setLat(dev.lastPosition.latitude.toFixed(6));
        setLng(dev.lastPosition.longitude.toFixed(6));
      }
    }
  }, [selectedDevice, devices.length, isOpen]);

  if (!isOpen) return null;

  const currentDev = devices.find((d) => d.id === targetDeviceId) || devices[0];

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentDev) return;

    setIsSending(true);
    setLastResult(null);

    try {
      const payloadObj = {
        deviceId: currentDev.id,
        latitude: parseFloat(lat),
        longitude: parseFloat(lng),
        altitude: parseFloat(altitude),
        speed: parseFloat(speed),
        heading: parseInt(heading, 10),
        satellites: parseInt(satellites, 10),
        hdop: 0.8,
        battery: parseInt(battery, 10),
        ignition,
        tamper,
        sos,
        timestamp: new Date().toISOString(),
      };

      // Encrypt with client-side Web Crypto AES-256-GCM
      const encrypted = await encryptAes256Gcm(
        JSON.stringify(payloadObj),
        currentDev.aesKeyHex
      );

      const res = await fetch('/api/gps/encrypted-aes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: currentDev.id,
          ciphertext: encrypted.ciphertextHex,
          iv: encrypted.ivHex,
          authTag: encrypted.authTagHex,
          algorithm: 'AES-256-GCM',
          transport,
        }),
      });

      const data = await res.json();
      setLastResult(data);
    } catch (err: unknown) {
      setLastResult({ error: err instanceof Error ? err.message : 'Error transmitiendo trama' });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-3xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-white flex items-center gap-2">
                <span>Inyector de Telemetría GPS con Cifrado AES-256</span>
              </h2>
              <p className="text-xs text-slate-400">
                Transmite tramas manuales cifradas por HTTPS, TCP o MQTT para verificar la ingesta y alertas
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSend} className="flex-1 overflow-y-auto p-6 space-y-5">
          
          {/* Target Device & Transport */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Dispositivo Destino
              </label>
              <select
                value={targetDeviceId}
                onChange={(e) => setTargetDeviceId(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
              >
                {Array.from(new Map(devices.map((d) => [d.id, d])).values()).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.model})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Protocolo de Transporte
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['HTTPS', 'TCP', 'MQTT-TLS'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTransport(t)}
                    className={`py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                      transport === t
                        ? 'bg-slate-800 border-cyan-500 text-cyan-400 font-semibold'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Coordinates & Physical Dynamics */}
          <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3">
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
              Parámetros de Navegación GNSS
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Latitud (°)</label>
                <input
                  type="text"
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-900 border border-slate-800 rounded-lg text-slate-200"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Longitud (°)</label>
                <input
                  type="text"
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-900 border border-slate-800 rounded-lg text-slate-200"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Altitud (m)</label>
                <input
                  type="number"
                  value={altitude}
                  onChange={(e) => setAltitude(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-900 border border-slate-800 rounded-lg text-slate-200"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Velocidad (km/h)</label>
                <input
                  type="number"
                  value={speed}
                  onChange={(e) => setSpeed(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-900 border border-slate-800 rounded-lg text-cyan-400 font-bold"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Rumbo (0-360°)</label>
                <input
                  type="number"
                  value={heading}
                  onChange={(e) => setHeading(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-900 border border-slate-800 rounded-lg text-slate-200"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Batería (%)</label>
                <input
                  type="number"
                  value={battery}
                  onChange={(e) => setBattery(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-900 border border-slate-800 rounded-lg text-emerald-400"
                />
              </div>
            </div>
          </div>

          {/* Sensors & Triggers */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between cursor-pointer">
              <span className="text-xs text-slate-200 font-medium">Ignición / Motor</span>
              <input
                type="checkbox"
                checked={ignition}
                onChange={(e) => setIgnition(e.target.checked)}
                className="rounded bg-slate-900 border-slate-700 text-cyan-500"
              />
            </label>

            <label className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between cursor-pointer">
              <span className="text-xs text-rose-300 font-medium">Sabotaje Antena</span>
              <input
                type="checkbox"
                checked={tamper}
                onChange={(e) => setTamper(e.target.checked)}
                className="rounded bg-slate-900 border-slate-700 text-rose-500"
              />
            </label>

            <label className="p-3 rounded-xl bg-slate-950 border border-rose-900/50 flex items-center justify-between cursor-pointer">
              <span className="text-xs text-rose-400 font-bold">Botón Pánico SOS</span>
              <input
                type="checkbox"
                checked={sos}
                onChange={(e) => setSos(e.target.checked)}
                className="rounded bg-slate-900 border-rose-700 text-rose-500"
              />
            </label>
          </div>

          {/* Action Button */}
          <button
            type="submit"
            disabled={isSending}
            className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs rounded-xl transition-colors shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <ShieldCheck className="w-4 h-4 stroke-[2.5]" />
            <span>{isSending ? 'Cifrando con AES-256 y enviando...' : 'Cifrar con AES-256 y Transmitir'}</span>
          </button>

          {/* Result Inspection */}
          {lastResult && (
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-200">Respuesta del Servidor Telemático</span>
                <span className="text-[10px] font-mono text-emerald-400">HTTP 200 OK</span>
              </div>
              <pre className="p-3 bg-slate-900 rounded font-mono text-xs text-cyan-300 overflow-x-auto leading-relaxed">
                {JSON.stringify(lastResult, null, 2)}
              </pre>
            </div>
          )}

        </form>

      </div>
    </div>
  );
};
