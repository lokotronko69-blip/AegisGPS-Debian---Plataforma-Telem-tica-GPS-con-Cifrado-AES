import React from 'react';
import {
  ShieldCheck,
  Radio,
  Volume2,
  VolumeX,
  Play,
  Pause,
  Bell,
  Plus,
  Terminal,
  Command,
  Radar,
  ArrowUpCircle,
  History,
  MapPin,
} from 'lucide-react';
import { TelemetryStats } from '../types/gps';
import { AEGIS_APP_VERSION } from '../utils/debianScripts';

export type AppTab = 'map' | 'crypto' | 'geofences' | 'debian' | 'simulation' | 'commands';

interface HeaderProps {
  currentTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  stats: TelemetryStats | null;
  audioEnabled: boolean;
  onToggleAudio: () => void;
  onToggleSimulation: () => void;
  unreadAlertsCount: number;
  onOpenNotifications: () => void;
  onOpenRegisterDevice: () => void;
  onOpenConnectorHub: () => void;
  onOpenScanner: () => void;
  onOpenUpdater: () => void;
  onOpenHistory?: () => void;
  geofencesCount?: number;
  updateAvailable?: boolean;
  connectedSse: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onSelectTab,
  stats,
  audioEnabled,
  onToggleAudio,
  onToggleSimulation,
  unreadAlertsCount,
  onOpenNotifications,
  onOpenRegisterDevice,
  onOpenConnectorHub,
  onOpenScanner,
  onOpenUpdater,
  onOpenHistory,
  geofencesCount = 3,
  updateAvailable,
  connectedSse,
}) => {
  return (
    <header className="border-b border-slate-800 bg-slate-900/95 backdrop-blur-md px-3 sm:px-4 py-2 flex flex-col gap-2 z-30 select-none">
      {/* Row 1: Brand + Live Status + Primary Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Left: Brand & Live Link Status */}
        <div className="flex items-center gap-3">
          <a
            href="#map"
            onClick={(e) => {
              e.preventDefault();
              onSelectTab('map');
            }}
            className="font-display text-base sm:text-lg font-bold tracking-tight text-white flex items-center gap-2 hover:text-cyan-400 transition-colors"
          >
            <div className="w-7 h-7 rounded-lg bg-cyan-500/15 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <span>AegisGPS Kali / Debian</span>
            <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-emerald-950 text-emerald-300 border border-emerald-700/60">
              v{AEGIS_APP_VERSION}
            </span>
          </a>

          <div className="hidden xl:flex items-center gap-2 text-xs text-slate-400 pl-2 border-l border-slate-800">
            <span
              className={`w-2 h-2 rounded-full ${
                connectedSse
                  ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50 animate-pulse'
                  : 'bg-rose-500'
              }`}
            />
            <span className="font-mono text-[11px] text-slate-300">
              {connectedSse ? 'ENLACE AES-256-GCM ACTIVO' : 'CONECTANDO...'}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-[11px] text-cyan-400">
              TCP :{stats?.tcpPort || 5023} · LOCAL :8765
            </span>
          </div>
        </div>

        {/* Right: Primary Action Buttons (All visible) */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Audio Toggle */}
          <button
            onClick={onToggleAudio}
            className={`p-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
              audioEnabled
                ? 'bg-slate-800 border-slate-700 text-emerald-400 hover:bg-slate-700'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
            }`}
            title={audioEnabled ? 'Alertas sonoras activadas' : 'Alertas sonoras silenciadas'}
          >
            {audioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Simulation Toggle */}
          <button
            onClick={onToggleSimulation}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
              stats?.simulationRunning
                ? 'bg-slate-800 border-slate-700 text-cyan-300 hover:bg-slate-700'
                : 'bg-amber-950/60 border-amber-800/60 text-amber-300 hover:bg-amber-900/60'
            }`}
          >
            {stats?.simulationRunning ? (
              <>
                <Pause className="w-3.5 h-3.5 text-cyan-400" />
                <span>Pausar Flota</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 text-amber-400" />
                <span>Reanudar Flota</span>
              </>
            )}
          </button>

          {/* Notifications Bell */}
          <button
            onClick={onOpenNotifications}
            className="relative p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition-colors cursor-pointer"
            title="Centro de Alertas y Eventos de Seguridad"
          >
            <Bell className="w-4 h-4" />
            {unreadAlertsCount > 0 && (
              <span className="absolute -top-1 -right-1 px-1.5 py-0.2 bg-rose-600 text-white font-mono text-[10px] font-bold rounded-full min-w-[18px] text-center">
                {unreadAlertsCount}
              </span>
            )}
          </button>

          {/* OTA Update Button */}
          <button
            onClick={onOpenUpdater}
            className={`relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
              updateAvailable
                ? 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/60 text-amber-300 shadow-sm'
                : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-emerald-400'
            }`}
            title="Actualizar aplicación y nodo local a la última versión disponible"
          >
            <ArrowUpCircle
              className={`w-3.5 h-3.5 ${
                updateAvailable ? 'animate-bounce text-amber-400' : 'text-emerald-400'
              }`}
            />
            <span>Actualizar v{AEGIS_APP_VERSION}</span>
            {updateAvailable && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            )}
          </button>

          {/* Scan Nearby GPS Button */}
          <button
            onClick={onOpenScanner}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 text-cyan-300 font-bold text-xs rounded-lg transition-all shadow-sm cursor-pointer"
            title="Abrir Centro de Escaneo de Dispositivos GPS Cercanos (6 Apartados)"
          >
            <Radar className="w-3.5 h-3.5 text-emerald-400 animate-spin" style={{ animationDuration: '4s' }} />
            <span>📡 Escanear GPS Cercanos</span>
          </button>

          {/* Connect Real Devices Plug & Play Wizard CTA */}
          <button
            onClick={onOpenConnectorHub}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-lg transition-all shadow-md cursor-pointer"
            title="Conectar cualquier GPS en 1 clic con escáner de proximidad Plug & Play"
          >
            <Radio className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>⚡ Conectar GPS Plug & Play</span>
          </button>

          {/* New Device CTA */}
          <button
            onClick={onOpenRegisterDevice}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded-lg transition-colors shadow-sm cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 stroke-[3]" />
            <span>Nuevo GPS</span>
          </button>
        </div>
      </div>

      {/* Row 2: Unified Tactical Navigation Tabs (Identical across Cloud & Local :8765) */}
      <nav className="flex items-center gap-1.5 overflow-x-auto pt-1 border-t border-slate-800/80">
        <button
          onClick={() => onSelectTab('map')}
          className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
            currentTab === 'map'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <MapPin className="w-3.5 h-3.5 text-cyan-400" />
          <span>Mapa en Vivo</span>
        </button>

        <button
          onClick={onOpenScanner}
          className="px-3 py-1 text-xs font-semibold rounded-lg text-emerald-300 hover:text-white hover:bg-emerald-500/20 border border-emerald-500/30 transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
        >
          <Radar className="w-3.5 h-3.5 text-emerald-400" />
          <span>Radar GPS Cercanos (6 Apartados)</span>
        </button>

        <button
          onClick={() => onSelectTab('crypto')}
          className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
            currentTab === 'crypto'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Cifrado AES ({stats?.packetsDecrypted || 0})</span>
        </button>

        <button
          onClick={() => onSelectTab('geofences')}
          className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
            currentTab === 'geofences'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <span>🚧 Geocercas ({geofencesCount})</span>
        </button>

        {onOpenHistory && (
          <button
            onClick={onOpenHistory}
            className="px-3 py-1 text-xs font-semibold rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <History className="w-3.5 h-3.5 text-cyan-400" />
            <span>Historial de Ruta</span>
          </button>
        )}

        <button
          onClick={() => onSelectTab('debian')}
          className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
            currentTab === 'debian'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Terminal className="w-3.5 h-3.5 text-emerald-400" />
          <span>Debian & MQTT Hub</span>
        </button>

        <button
          onClick={() => onSelectTab('simulation')}
          className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
            currentTab === 'simulation'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Radio className="w-3.5 h-3.5 text-amber-400" />
          <span>Inyector GPS & Pruebas</span>
        </button>

        <button
          onClick={() => onSelectTab('commands')}
          className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
            currentTab === 'commands'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Command className="w-3.5 h-3.5 text-cyan-400" />
          <span>Comandos & CLI</span>
        </button>
      </nav>
    </header>
  );
};
