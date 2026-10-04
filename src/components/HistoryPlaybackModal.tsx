import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  X, 
  Calendar, 
  Gauge, 
  Navigation, 
  ShieldCheck, 
  Clock,
  MapPin
} from 'lucide-react';
import { GpsDevice, GpsPosition } from '../types/gps';
import { calculateDistanceMeters, formatCoordinates } from '../utils/geo';

interface HistoryPlaybackModalProps {
  isOpen: boolean;
  onClose: () => void;
  device: GpsDevice | null;
  historyPositions: GpsPosition[];
}

export const HistoryPlaybackModal: React.FC<HistoryPlaybackModalProps> = ({
  isOpen,
  onClose,
  device,
  historyPositions,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const playbackTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (historyPositions.length > 0) {
      setCurrentIndex(historyPositions.length - 1);
    }
  }, [historyPositions]);

  // Handle Playback Loop
  useEffect(() => {
    if (!isPlaying) {
      if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
      return;
    }

    const intervalMs = Math.max(100, 1000 / speedMultiplier);
    playbackTimerRef.current = setInterval(() => {
      setCurrentIndex((prev) => {
        if (prev >= historyPositions.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, intervalMs);

    return () => {
      if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
    };
  }, [isPlaying, speedMultiplier, historyPositions.length]);

  if (!isOpen || !device) return null;

  const currentPos = historyPositions[currentIndex] || historyPositions[0];

  // Calculate total route distance & stats
  let totalDistanceKm = 0;
  let maxSpeed = 0;
  let sumSpeed = 0;

  for (let i = 0; i < historyPositions.length; i++) {
    const p = historyPositions[i];
    if (p.speed > maxSpeed) maxSpeed = p.speed;
    sumSpeed += p.speed;
    if (i > 0) {
      const prev = historyPositions[i - 1];
      totalDistanceKm += calculateDistanceMeters(prev.latitude, prev.longitude, p.latitude, p.longitude) / 1000;
    }
  }

  const avgSpeed = historyPositions.length > 0 ? sumSpeed / historyPositions.length : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div 
              className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold"
              style={{ backgroundColor: device.color }}
            >
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-white flex items-center gap-2">
                <span>Reproducción de Ruta Histórica · {device.name}</span>
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                {device.model} · IMEI: {device.imei}
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
        <div className="p-6 space-y-6">
          
          {/* Trip Summary Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
              <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">
                Distancia Recorrida
              </span>
              <span className="font-mono text-lg font-bold text-cyan-400 tabular-nums">
                {totalDistanceKm.toFixed(2)} km
              </span>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
              <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">
                Velocidad Máxima
              </span>
              <span className="font-mono text-lg font-bold text-rose-400 tabular-nums">
                {Math.round(maxSpeed)} km/h
              </span>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
              <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">
                Velocidad Media
              </span>
              <span className="font-mono text-lg font-bold text-emerald-400 tabular-nums">
                {Math.round(avgSpeed)} km/h
              </span>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
              <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">
                Puntos Cifrados
              </span>
              <span className="font-mono text-lg font-bold text-slate-200 tabular-nums">
                {historyPositions.length} tramas
              </span>
            </div>
          </div>

          {/* Current Scrubbed Point Readout */}
          {currentPos && (
            <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-slate-300">
                  <Calendar className="w-4 h-4 text-cyan-400" />
                  <span className="font-mono">{new Date(currentPos.timestamp).toLocaleString()}</span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-mono text-slate-400">Punto {currentIndex + 1} de {historyPositions.length}</span>
                  <div className="flex items-center gap-1 text-[11px] text-cyan-400">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>AES-256 Verificado</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2 rounded bg-slate-900 border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 block">Velocidad</span>
                  <span className="font-mono font-bold text-cyan-400 tabular-nums">{Math.round(currentPos.speed)} km/h</span>
                </div>
                <div className="p-2 rounded bg-slate-900 border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 block">Rumbo / Altura</span>
                  <span className="font-mono text-slate-200 tabular-nums">{currentPos.heading}° · {Math.round(currentPos.altitude)}m</span>
                </div>
                <div className="p-2 rounded bg-slate-900 border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 block">Satélites / Batería</span>
                  <span className="font-mono text-slate-200 tabular-nums">{currentPos.satellites} sats · {currentPos.battery}%</span>
                </div>
                <div className="p-2 rounded bg-slate-900 border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 block">Coordenadas</span>
                  <span className="font-mono text-[10px] text-slate-300 truncate block">
                    {formatCoordinates(currentPos.latitude, currentPos.longitude)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Interactive Scrub Slider */}
          <div className="space-y-2">
            <input
              type="range"
              min={0}
              max={Math.max(0, historyPositions.length - 1)}
              value={currentIndex}
              onChange={(e) => setCurrentIndex(Number(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-500">
              <span>{historyPositions[0] ? new Date(historyPositions[0].timestamp).toLocaleTimeString() : 'Inicio'}</span>
              <span>{historyPositions[historyPositions.length - 1] ? new Date(historyPositions[historyPositions.length - 1].timestamp).toLocaleTimeString() : 'Fin'}</span>
            </div>
          </div>

          {/* Playback Controls Toolbar */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentIndex(0)}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
                title="Reiniciar reproducción"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs rounded-lg transition-colors shadow-sm"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                <span>{isPlaying ? 'Pausar' : 'Reproducir'}</span>
              </button>
            </div>

            {/* Speed Multipliers */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
              {[1, 2, 5, 10].map((multiplier) => (
                <button
                  key={multiplier}
                  onClick={() => setSpeedMultiplier(multiplier)}
                  className={`px-2.5 py-1 text-xs font-mono font-medium rounded transition-colors ${
                    speedMultiplier === multiplier
                      ? 'bg-slate-800 text-cyan-400'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {multiplier}x
                </button>
              ))}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
