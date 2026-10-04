import React, { useState } from 'react';
import { 
  Plus, 
  X, 
  ShieldCheck, 
  RefreshCw, 
  Copy, 
  Check, 
  Radio, 
  Truck, 
  Car, 
  Navigation
} from 'lucide-react';
import { DeviceProtocol, GpsDevice } from '../types/gps';
import { generateAes256KeyHex } from '../utils/crypto';

interface DeviceRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRegisterDevice: (deviceData: Partial<GpsDevice>) => Promise<void>;
}

export const DeviceRegistrationModal: React.FC<DeviceRegistrationModalProps> = ({
  isOpen,
  onClose,
  onRegisterDevice,
}) => {
  const [name, setName] = useState('');
  const [imei, setImei] = useState(() => Math.floor(100000000000000 + Math.random() * 900000000000000).toString());
  const [model, setModel] = useState('Raspberry Pi 4 (Debian 12 + GNSS)');
  const [vehicleType, setVehicleType] = useState<GpsDevice['vehicleType']>('truck');
  const [protocol, setProtocol] = useState<DeviceProtocol>('aes-encrypted-json');
  const [aesKeyHex, setAesKeyHex] = useState(() => generateAes256KeyHex());
  const [speedLimit, setSpeedLimit] = useState('90');
  const [color, setColor] = useState('#06b6d4');
  const [copiedKey, setCopiedKey] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleRegenerateKey = () => {
    setAesKeyHex(generateAes256KeyHex());
  };

  const handleCopyKey = () => {
    navigator.clipboard.writeText(aesKeyHex);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!name.trim()) {
      setErrorMsg('Introduce un nombre para el dispositivo');
      return;
    }

    if (!imei.trim() || imei.length < 10) {
      setErrorMsg('El IMEI debe tener al menos 10 caracteres');
      return;
    }

    setIsSubmitting(true);
    try {
      await onRegisterDevice({
        name,
        imei,
        model,
        vehicleType,
        protocol,
        aesKeyHex,
        speedLimit: parseFloat(speedLimit) || 80,
        color,
      });
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error registrando dispositivo');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Plus className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-white">
                Registrar Nuevo Dispositivo GPS
              </h2>
              <p className="text-xs text-slate-400">
                Añadir rastreador GNSS con par de claves simétricas AES-256 para telemetría cifrada
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

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {errorMsg && (
            <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-800 text-xs text-rose-300">
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Nombre del Vehículo / Activo
              </label>
              <input
                type="text"
                required
                placeholder="Ej: Furgón Reparto Norte 12"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Identificador IMEI / Hardware ID
              </label>
              <input
                type="text"
                required
                value={imei}
                onChange={(e) => setImei(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Modelo / Hardware
              </label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Tipo de Vehículo
              </label>
              <select
                value={vehicleType}
                onChange={(e) => setVehicleType(e.target.value as GpsDevice['vehicleType'])}
                className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
              >
                <option value="truck">Camión Pesado</option>
                <option value="car">Automóvil / Patrulla</option>
                <option value="van">Furgoneta de Carga</option>
                <option value="drone">Dron UAV</option>
                <option value="motorcycle">Motocicleta</option>
                <option value="cargo">Contenedor / Mercancía</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Protocolo Primario
              </label>
              <select
                value={protocol}
                onChange={(e) => setProtocol(e.target.value as DeviceProtocol)}
                className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
              >
                <option value="aes-encrypted-json">AES-256 JSON (Recomendado)</option>
                <option value="mqtt-tls">MQTT sobre TLS v1.3</option>
                <option value="teltonika-avl">Teltonika AVL Codec 8</option>
                <option value="nmea-0183">NMEA 0183 ($GPRMC)</option>
                <option value="osmand">OsmAnd / Traccar HTTP</option>
              </select>
            </div>
          </div>

          {/* AES-256 Key Generator */}
          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-cyan-400" />
                <span>Clave Criptográfica AES-256 (32 Bytes / 256 Bits)</span>
              </label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleRegenerateKey}
                  className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
                  title="Generar nueva clave aleatoria"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleCopyKey}
                  className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
                  title="Copiar clave"
                >
                  {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-lg font-mono text-[11px] text-cyan-300 break-all select-all">
              {aesKeyHex}
            </div>
            <p className="text-[10px] text-slate-500">
              Esta clave simétrica debe grabarse en la configuración del cliente Debian o rastreador físico para cifrar los paquetes antes del envío.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Límite de Velocidad (km/h)
              </label>
              <input
                type="number"
                value={speedLimit}
                onChange={(e) => setSpeedLimit(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Color del Marcador
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-8 h-8 rounded border border-slate-800 bg-transparent cursor-pointer"
                />
                <span className="text-xs font-mono text-slate-400">{color}</span>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs rounded-xl transition-colors shadow-sm disabled:opacity-50"
            >
              {isSubmitting ? 'Registrando...' : 'Registrar en Servidor'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
