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
  Terminal
} from 'lucide-react';
import { TelemetryStats } from '../types/gps';

interface HeaderProps {
  currentTab: 'map' | 'crypto' | 'geofences' | 'debian' | 'simulation';
  onSelectTab: (tab: 'map' | 'crypto' | 'geofences' | 'debian' | 'simulation') => void;
  stats: TelemetryStats | null;
  audioEnabled: boolean;
  onToggleAudio: () => void;
  onToggleSimulation: () => void;
  unreadAlertsCount: number;
  onOpenNotifications: () => void;
  onOpenRegisterDevice: () => void;
  onOpenConnectorHub: () => void;
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
  connectedSse,
}) => {
  return (
    <header className="h-14 border-b border-slate-800 bg-slate-900/90 backdrop-blur px-4 flex items-center justify-between z-30 select-none">
      {/* Zone 1: Single text element Brand mark */}
      <div className="flex items-center gap-3">
        <a 
          href="#map" 
          onClick={(e) => { e.preventDefault(); onSelectTab('map'); }}
          className="font-display text-lg font-bold tracking-tight text-white flex items-center gap-2 hover:text-cyan-400 transition-colors"
        >
          <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <span>AegisGPS Debian</span>
        </a>

        {/* Live SSE link status */}
        <div className="hidden lg:flex items-center gap-2 text-xs text-slate-400 pl-2 border-l border-slate-800">
          <span 
            className={`w-2 h-2 rounded-full ${connectedSse ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50' : 'bg-rose-500'}`} 
            title={connectedSse ? 'Enlace telemático SSE activo' : 'Reconectando con el servidor telemático...'}
          />
          <span className="font-mono text-slate-400">
            {connectedSse ? 'ENLACE HTTPS ACTIVO' : 'CONECTANDO...'}
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono text-slate-500">TCP :{stats?.tcpPort || 5023}</span>
        </div>
      </div>

      {/* Zone 2: Navigation Links (single line, clean text) */}
      <nav className="hidden md:flex items-center gap-1 lg:gap-2">
        <button
          onClick={() => onSelectTab('map')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            currentTab === 'map'
              ? 'bg-slate-800 text-cyan-400 border border-slate-700'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          Mapa en Vivo
        </button>

        <button
          onClick={() => onSelectTab('crypto')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
            currentTab === 'crypto'
              ? 'bg-slate-800 text-cyan-400 border border-slate-700'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Cifrado AES ({stats?.packetsDecrypted || 0})</span>
        </button>

        <button
          onClick={() => onSelectTab('geofences')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            currentTab === 'geofences'
              ? 'bg-slate-800 text-cyan-400 border border-slate-700'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          Geocercas
        </button>

        <button
          onClick={() => onSelectTab('debian')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
            currentTab === 'debian'
              ? 'bg-slate-800 text-cyan-400 border border-slate-700'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>Debian & MQTT Hub</span>
        </button>

        <button
          onClick={() => onSelectTab('simulation')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
            currentTab === 'simulation'
              ? 'bg-slate-800 text-cyan-400 border border-slate-700'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          <span>Inyector de Telemetría</span>
        </button>
      </nav>

      {/* Zone 3: Primary Actions */}
      <div className="flex items-center gap-2">
        {/* Toggle Audio Chimes */}
        <button
          onClick={onToggleAudio}
          className={`p-2 rounded-lg text-xs font-medium transition-colors ${
            audioEnabled
              ? 'bg-slate-800 text-emerald-400 hover:bg-slate-700'
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
          }`}
          title={audioEnabled ? 'Alertas sonoras activadas' : 'Alertas sonoras silenciadas'}
        >
          {audioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        </button>

        {/* Toggle Simulation Loop */}
        <button
          onClick={onToggleSimulation}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            stats?.simulationRunning
              ? 'bg-slate-800 border border-slate-700 text-cyan-300 hover:bg-slate-700'
              : 'bg-amber-950/60 border border-amber-800/60 text-amber-300 hover:bg-amber-900/60'
          }`}
          title={stats?.simulationRunning ? 'Pausar simulación telemática de flota' : 'Reanudar simulación de flota'}
        >
          {stats?.simulationRunning ? (
            <>
              <Pause className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">Pausar Simulación</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Reanudar</span>
            </>
          )}
        </button>

        {/* Notifications Bell */}
        <button
          onClick={onOpenNotifications}
          className="relative p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
          title="Centro de Notificaciones y Alertas"
        >
          <Bell className="w-4 h-4" />
          {unreadAlertsCount > 0 && (
            <span className="absolute -top-1 -right-1 px-1.5 py-0.2 bg-rose-600 text-white font-mono text-[10px] font-bold rounded-full min-w-[18px] text-center">
              {unreadAlertsCount}
            </span>
          )}
        </button>

        {/* Connect Real Devices Wizard CTA */}
        <button
          onClick={onOpenConnectorHub}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-lg transition-all shadow-md hover:shadow-emerald-500/20"
          title="Conectar smartphones, localizadores de coche, Teltonika o Raspberry Pi"
        >
          <Radio className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>Conectar Dispositivos</span>
        </button>

        {/* New Device CTA */}
        <button
          onClick={onOpenRegisterDevice}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-semibold text-xs rounded-lg transition-colors shadow-sm"
        >
          <Plus className="w-3.5 h-3.5 stroke-[3]" />
          <span className="hidden sm:inline">Nuevo GPS</span>
        </button>
      </div>
    </header>
  );
};
