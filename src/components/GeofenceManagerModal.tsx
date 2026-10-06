import React, { useState } from 'react';
import { 
  ShieldAlert, 
  Plus, 
  Trash2, 
  X, 
  MapPin, 
  Check, 
  Gauge, 
  AlertCircle
} from 'lucide-react';
import { Geofence } from '../types/gps';

interface GeofenceManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  geofences: Geofence[];
  onAddGeofence: (geofence: Partial<Geofence>) => Promise<void>;
  onDeleteGeofence: (id: string) => Promise<void>;
  defaultCenter?: [number, number];
}

export const GeofenceManagerModal: React.FC<GeofenceManagerModalProps> = ({
  isOpen,
  onClose,
  geofences,
  onAddGeofence,
  onDeleteGeofence,
  defaultCenter = [42.8150, -1.6425],
}) => {
  const [name, setName] = useState('');
  const [type, setType] = useState<'circle' | 'polygon'>('circle');
  const [lat, setLat] = useState(() => defaultCenter[0].toFixed(6));
  const [lng, setLng] = useState(() => defaultCenter[1].toFixed(6));
  const [radius, setRadius] = useState('1500');
  const [polygonCoords, setPolygonCoords] = useState(
    '[[40.410, -3.710], [40.425, -3.710], [40.425, -3.690], [40.410, -3.690]]'
  );
  const [color, setColor] = useState('#06b6d4');
  const [speedLimit, setSpeedLimit] = useState('50');
  const [alertOnEnter, setAlertOnEnter] = useState(true);
  const [alertOnExit, setAlertOnExit] = useState(true);
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!name.trim()) {
      setErrorMsg('Introduce un nombre para la geocerca');
      return;
    }

    setIsSubmitting(true);
    try {
      if (type === 'circle') {
        await onAddGeofence({
          name,
          type: 'circle',
          center: [parseFloat(lat), parseFloat(lng)],
          radius: parseFloat(radius),
          color,
          speedLimit: speedLimit ? parseFloat(speedLimit) : undefined,
          alertOnEnter,
          alertOnExit,
          description,
        });
      } else {
        const parsedCoords = JSON.parse(polygonCoords) as [number, number][];
        if (!Array.isArray(parsedCoords) || parsedCoords.length < 3) {
          throw new Error('El polígono requiere al menos 3 coordenadas [lat, lng]');
        }
        await onAddGeofence({
          name,
          type: 'polygon',
          coordinates: parsedCoords,
          color,
          speedLimit: speedLimit ? parseFloat(speedLimit) : undefined,
          alertOnEnter,
          alertOnExit,
          description,
        });
      }

      // Reset form
      setName('');
      setDescription('');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error creando geocerca');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-white">
                Gestor de Geocercas y Zonas Seguras
              </h2>
              <p className="text-xs text-slate-400">
                Reglas automáticas de detección de entrada, salida y límites de velocidad
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
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-y-auto">
          
          {/* Left: Active Geofences List */}
          <div className="w-full md:w-1/2 border-r border-slate-800 p-5 space-y-4 overflow-y-auto">
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Geocercas Activas ({geofences.length})
            </h3>

            {geofences.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 bg-slate-950/50 rounded-xl border border-slate-800">
                No hay geocercas configuradas actualmente.
              </div>
            ) : (
              <div className="space-y-3">
                {geofences.map((gf) => (
                  <div
                    key={gf.id}
                    className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl flex items-start justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span 
                          className="w-3 h-3 rounded-full shrink-0" 
                          style={{ backgroundColor: gf.color }} 
                        />
                        <h4 className="text-xs font-bold text-slate-100">{gf.name}</h4>
                      </div>

                      <p className="text-[11px] text-slate-400">
                        {gf.description || (gf.type === 'circle' ? `Radio: ${gf.radius}m` : `Polígono de ${gf.coordinates?.length} vértices`)}
                      </p>

                      <div className="flex flex-wrap gap-2 text-[10px] text-slate-400 pt-1">
                        {gf.speedLimit && (
                          <span className="text-amber-400 font-mono">
                            Máx {gf.speedLimit} km/h
                          </span>
                        )}
                        {gf.alertOnEnter && <span>Alerta Entrada</span>}
                        {gf.alertOnExit && <span>Alerta Salida</span>}
                      </div>
                    </div>

                    <button
                      onClick={() => onDeleteGeofence(gf.id)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                      title="Eliminar geocerca"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Add Geofence Form */}
          <div className="w-full md:w-1/2 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Nueva Zona de Seguridad
              </h3>
              <button
                type="button"
                onClick={() => {
                  setLat(defaultCenter[0].toFixed(6));
                  setLng(defaultCenter[1].toFixed(6));
                }}
                className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>Usar ubicación actual</span>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              {errorMsg && (
                <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-800 text-xs text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Nombre de la Zona
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Base de Flota Norte"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* Type Switcher */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setType('circle')}
                  className={`py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    type === 'circle'
                      ? 'bg-slate-800 border-cyan-500 text-cyan-400'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  Circular (Radio)
                </button>
                <button
                  type="button"
                  onClick={() => setType('polygon')}
                  className={`py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    type === 'polygon'
                      ? 'bg-slate-800 border-cyan-500 text-cyan-400'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  Poligonal (Vértices)
                </button>
              </div>

              {type === 'circle' ? (
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Latitud</label>
                    <input
                      type="text"
                      value={lat}
                      onChange={(e) => setLat(e.target.value)}
                      className="w-full px-2.5 py-1 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Longitud</label>
                    <input
                      type="text"
                      value={lng}
                      onChange={(e) => setLng(e.target.value)}
                      className="w-full px-2.5 py-1 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Radio (m)</label>
                    <input
                      type="number"
                      value={radius}
                      onChange={(e) => setRadius(e.target.value)}
                      className="w-full px-2.5 py-1 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-200"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">
                    Coordenadas Polígono (JSON)
                  </label>
                  <textarea
                    rows={2}
                    value={polygonCoords}
                    onChange={(e) => setPolygonCoords(e.target.value)}
                    className="w-full p-2 text-[11px] font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1">
                    Límite Velocidad (km/h)
                  </label>
                  <input
                    type="number"
                    value={speedLimit}
                    onChange={(e) => setSpeedLimit(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1">Color</label>
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

              {/* Alert Toggles */}
              <div className="space-y-2 pt-1 border-t border-slate-800">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={alertOnEnter}
                    onChange={(e) => setAlertOnEnter(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-800 text-cyan-500 focus:ring-0"
                  />
                  <span className="text-xs text-slate-300">Generar notificación al ENTRAR</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={alertOnExit}
                    onChange={(e) => setAlertOnExit(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-800 text-cyan-500 focus:ring-0"
                  />
                  <span className="text-xs text-slate-300">Generar notificación al SALIR</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs rounded-xl transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>{isSubmitting ? 'Guardando...' : 'Crear Geocerca'}</span>
              </button>
            </form>
          </div>

        </div>

      </div>
    </div>
  );
};
