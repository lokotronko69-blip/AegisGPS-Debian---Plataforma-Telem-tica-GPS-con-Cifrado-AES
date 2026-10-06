import React, { useState } from 'react';
import { 
  Truck, 
  Car, 
  Battery, 
  BatteryCharging, 
  BatteryWarning, 
  Navigation, 
  ShieldCheck, 
  Search, 
  Radio, 
  History, 
  Lock, 
  ChevronRight, 
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  MapPin,
  Compass,
  Radar,
  Trash2
} from 'lucide-react';
import { GpsDevice, DeviceStatus } from '../types/gps';

interface DeviceSidebarProps {
  devices: GpsDevice[];
  selectedDeviceId: string | null;
  onSelectDevice: (device: GpsDevice) => void;
  onDeleteDevice?: (id: string) => void;
  onOpenHistory: (device: GpsDevice) => void;
  onOpenCrypto: (device: GpsDevice) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  realGpsActive?: boolean;
  onToggleRealGps?: () => void;
  onOpenScanner?: () => void;
  onOpenConnectorHub?: () => void;
  packetsDecrypted?: number;
}

export const DeviceSidebar: React.FC<DeviceSidebarProps> = ({
  devices,
  selectedDeviceId,
  onSelectDevice,
  onDeleteDevice,
  onOpenHistory,
  onOpenCrypto,
  isCollapsed,
  onToggleCollapse,
  realGpsActive,
  onToggleRealGps,
  onOpenScanner,
  onOpenConnectorHub,
  packetsDecrypted = 0,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'moving' | 'idle' | 'offline'>('all');

  const rawFiltered = devices.filter((dev) => {
    const matchesSearch = 
      dev.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      dev.imei.includes(searchQuery) ||
      dev.model.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (statusFilter === 'all') return true;
    if (statusFilter === 'idle') return dev.status === 'idle' || dev.status === 'stopped';
    return dev.status === statusFilter;
  });

  // Ensure unique elements by device ID
  const filteredDevices = Array.from(
    new Map(rawFiltered.map((d) => [d.id, d])).values()
  );

  const getVehicleIcon = (type: GpsDevice['vehicleType']) => {
    switch (type) {
      case 'truck':
        return <Truck className="w-4 h-4 text-cyan-400" />;
      case 'car':
      case 'patrol':
        return <Car className="w-4 h-4 text-emerald-400" />;
      case 'van':
        return <Truck className="w-4 h-4 text-amber-400" />;
      case 'drone':
        return <Navigation className="w-4 h-4 text-purple-400" />;
      case 'person':
        return <MapPin className="w-4 h-4 text-cyan-300" />;
      default:
        return <Radio className="w-4 h-4 text-slate-400" />;
    }
  };

  const getBatteryIcon = (battery = 100, ignition = true) => {
    if (ignition && battery >= 90) return <BatteryCharging className="w-3.5 h-3.5 text-emerald-400" />;
    if (battery < 20) return <BatteryWarning className="w-3.5 h-3.5 text-rose-400" />;
    return <Battery className="w-3.5 h-3.5 text-slate-400" />;
  };

  const getStatusText = (status: DeviceStatus, speed = 0, hasPosition = false) => {
    if (!hasPosition && status === 'offline') {
      return 'En espera de trama GPS real';
    }
    switch (status) {
      case 'moving':
        return `En ruta · ${Math.round(speed)} km/h`;
      case 'idle':
        return 'Señal GPS activa · Estacionario';
      case 'stopped':
        return 'Detenido · Señal verificada';
      case 'alert':
        return 'Alerta de Seguridad';
      default:
        return 'En espera de conexión real';
    }
  };

  if (isCollapsed) {
    return (
      <div className="pointer-events-auto absolute top-3 left-3 z-30 flex items-center gap-2">
        <button
          onClick={onToggleCollapse}
          className="px-3 py-2 bg-slate-900/95 hover:bg-slate-800 text-cyan-400 border border-slate-700/80 rounded-xl shadow-2xl backdrop-blur-md transition-all flex items-center gap-2 group cursor-pointer"
          title="Abrir panel de flota de dispositivos"
        >
          <ChevronRightIcon className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          <span className="text-xs font-bold font-display text-white">
            Flota GPS ({devices.length})
          </span>
        </button>

        {onToggleRealGps && (
          <button
            onClick={onToggleRealGps}
            className={`px-3 py-2 rounded-xl border shadow-2xl backdrop-blur-md transition-all flex items-center gap-1.5 cursor-pointer ${
              realGpsActive
                ? 'bg-emerald-950/95 border-emerald-500 text-emerald-300'
                : 'bg-slate-900/95 hover:bg-slate-800 border-slate-700/80 text-slate-200'
            }`}
            title={realGpsActive ? 'Transmitiendo tu GPS real' : 'Conectar tu GPS real del navegador'}
          >
            <MapPin className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs font-semibold">
              {realGpsActive ? 'GPS Real Activo' : 'Mi GPS Real'}
            </span>
          </button>
        )}
      </div>
    );
  }

  const kaliPosition = devices.find((d) => d.id === 'dev-debian-patrol-04')?.lastPosition;
  const activeCount = devices.filter((d) => d.lastPosition && d.status !== 'offline').length;

  return (
    <aside className="pointer-events-auto relative w-80 lg:w-96 h-full flex flex-col border-r border-slate-800 bg-slate-900/95 backdrop-blur-md shadow-2xl shrink-0 z-20 overflow-hidden transition-all duration-300">
      
      {/* Top Header with Collapse Button & Real GPS Action */}
      <div className="px-3.5 py-2.5 border-b border-slate-800 flex items-center justify-between shrink-0">
        <div>
          <h3 className="font-display text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
            <span>Unidades GPS Registradas</span>
            <span className="text-[10px] font-mono text-cyan-400 font-normal">({devices.length})</span>
          </h3>
          <p className="text-[11px] text-slate-400">
            Telemetría Real · Cifrado AES-256-GCM
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              const kaliDev = devices.find((d) => d.id === 'dev-debian-patrol-04') || devices[0];
              if (kaliDev) onSelectDevice(kaliDev);
            }}
            className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[11px] font-semibold hover:bg-emerald-500/25 cursor-pointer"
            title="Seleccionar tu nodo Kali / Debian"
          >
            📍 Mi Kali
          </button>
          <button
            onClick={onToggleCollapse}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Colapsar panel para ver mapa completo"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Unified 3-Column KPI Strip */}
      <div className="grid grid-cols-3 gap-1.5 px-3 py-2 bg-slate-950/60 border-b border-slate-800 text-center shrink-0">
        <div className="py-1 px-1.5 rounded-lg bg-slate-900 border border-slate-800/80">
          <div className="text-[10px] text-slate-400">EN SEÑAL</div>
          <div className="font-mono text-xs font-bold text-white tabular-nums">
            {activeCount} / {devices.length}
          </div>
        </div>
        <div className="py-1 px-1.5 rounded-lg bg-slate-900 border border-slate-800/80">
          <div className="text-[10px] text-slate-400">TRAMAS AES</div>
          <div className="font-mono text-xs font-bold text-cyan-400 tabular-nums">{packetsDecrypted}</div>
        </div>
        <div className="py-1 px-1.5 rounded-lg bg-slate-900 border border-slate-800/80">
          <div className="text-[10px] text-slate-400">NODO KALI</div>
          <div className="font-mono text-xs font-bold text-emerald-400 tabular-nums">
            {kaliPosition ? `${kaliPosition.battery}%` : 'ESPERA'}
          </div>
        </div>
      </div>

      {/* Compact Quick Hardware & Scanner Bar */}
      <div className="px-3 pt-2.5 pb-2 border-b border-slate-800/80 space-y-2 shrink-0">
        {onToggleRealGps && (
          <button
            onClick={onToggleRealGps}
            className={`w-full py-1.5 px-3 rounded-xl border text-xs font-semibold flex items-center justify-between transition-all shadow-sm cursor-pointer ${
              realGpsActive
                ? 'bg-emerald-950/90 border-emerald-500 text-emerald-300'
                : 'bg-slate-950 hover:bg-slate-800 border-slate-700 text-slate-200'
            }`}
          >
            <div className="flex items-center gap-2 truncate">
              <span className={`w-2 h-2 rounded-full shrink-0 ${realGpsActive ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'}`} />
              <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="truncate">{realGpsActive ? 'Transmitiendo Mi GPS Real' : 'Activar GPS de Este Dispositivo'}</span>
            </div>
            <span className="font-mono text-[10px] text-cyan-400 shrink-0 ml-2">
              {realGpsActive ? 'ACTIVO' : '1-CLIC'}
            </span>
          </button>
        )}

        <div className="grid grid-cols-2 gap-1.5">
          {onOpenConnectorHub && (
            <button
              onClick={onOpenConnectorHub}
              className="py-1.5 px-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer truncate"
            >
              <Radio className="w-3.5 h-3.5 stroke-[2.5] shrink-0" />
              <span className="truncate">⚡ Plug & Play</span>
            </button>
          )}

          {onOpenScanner && (
            <button
              onClick={onOpenScanner}
              className="py-1.5 px-2.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer truncate"
            >
              <Radar className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="truncate">📡 Radar 360°</span>
            </button>
          )}
        </div>
      </div>

      {/* Search and Filters Header */}
      <div className="px-3 py-2 border-b border-slate-800/80 space-y-2 shrink-0">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar unidad, IMEI o protocolo..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-950/90 border border-slate-800 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        {/* Filter Segmented Controls */}
        <div className="flex items-center gap-1 p-0.5 bg-slate-950/90 rounded-lg border border-slate-800/80">
          <button
            onClick={() => setStatusFilter('all')}
            className={`flex-1 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-slate-800 text-cyan-400 shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Todos ({devices.length})
          </button>
          <button
            onClick={() => setStatusFilter('moving')}
            className={`flex-1 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer ${
              statusFilter === 'moving'
                ? 'bg-slate-800 text-emerald-400 shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            En Ruta
          </button>
          <button
            onClick={() => setStatusFilter('idle')}
            className={`flex-1 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer ${
              statusFilter === 'idle'
                ? 'bg-slate-800 text-amber-400 shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Fijos
          </button>
          <button
            onClick={() => setStatusFilter('offline')}
            className={`flex-1 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer ${
              statusFilter === 'offline'
                ? 'bg-slate-800 text-slate-200 shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            En Espera
          </button>
        </div>
      </div>

      {/* Fleet Device Cards List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40">
        {filteredDevices.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            No se encontraron dispositivos coincidentes.
          </div>
        ) : (
          filteredDevices.map((dev) => {
            const isSelected = dev.id === selectedDeviceId;
            const lp = dev.lastPosition;
            const speed = lp?.speed || 0;

            return (
              <div
                key={dev.id}
                onClick={() => onSelectDevice(dev)}
                className={`p-3 cursor-pointer transition-all hover:bg-slate-800/60 ${
                  isSelected ? 'bg-slate-800/90 border-l-2 border-cyan-400 pl-2.5' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-7 h-7 rounded-md bg-slate-950 flex items-center justify-center border"
                      style={{ borderColor: `${dev.color}40` }}
                    >
                      {getVehicleIcon(dev.vehicleType)}
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-slate-100 flex items-center gap-1.5">
                        <span>{dev.name}</span>
                        {dev.protocol.includes('aes') && (
                          <span title="Cifrado AES-256 activo">
                            <Lock className="w-3 h-3 text-cyan-400" />
                          </span>
                        )}
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        {dev.model}
                      </p>
                    </div>
                  </div>

                  {/* Speed / Heading Tag */}
                  <div className="text-right shrink-0">
                    {lp ? (
                      <>
                        <span className="font-mono text-xs font-semibold tabular-nums text-slate-200">
                          {Math.round(speed)} km/h
                        </span>
                        <div className="flex items-center justify-end gap-1 text-[11px] text-slate-400">
                          {getBatteryIcon(lp.battery, lp.ignition)}
                          <span className="font-mono tabular-nums">{lp.battery}%</span>
                        </div>
                      </>
                    ) : (
                      <span className="inline-block font-mono text-[10px] text-amber-300 bg-amber-950/50 border border-amber-800/50 px-1.5 py-0.5 rounded">
                        SIN SEÑAL AÚN
                      </span>
                    )}
                  </div>
                </div>

                {/* Sub-row: Telemetry Status & Security Info */}
                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/40 pt-1.5">
                  <div className="flex items-center gap-1.5">
                    <span 
                      className={`w-1.5 h-1.5 rounded-full ${
                        dev.status === 'moving' ? 'bg-emerald-400 animate-pulse' :
                        dev.status === 'idle' ? 'bg-amber-400' :
                        dev.status === 'alert' ? 'bg-rose-500' : 'bg-slate-500'
                      }`} 
                    />
                    <span className="text-slate-300 font-medium">
                      {getStatusText(dev.status, speed, !!lp)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    {onOpenScanner && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectDevice(dev);
                          onOpenScanner();
                        }}
                        className="p-1 rounded hover:bg-slate-700 text-emerald-400 hover:text-emerald-300 transition-colors"
                        title="Escanear dispositivos GPS cercanos alrededor de esta unidad"
                      >
                        <Radar className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenHistory(dev);
                      }}
                      className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-cyan-300 transition-colors"
                      title="Ver recorrido e historial"
                    >
                      <History className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenCrypto(dev);
                      }}
                      className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-cyan-300 transition-colors"
                      title="Inspeccionar paquetes criptográficos AES"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                    </button>
                    {onDeleteDevice && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteDevice(dev.id);
                        }}
                        className="p-1 rounded hover:bg-rose-950/60 text-slate-500 hover:text-rose-400 transition-colors"
                        title="Eliminar dispositivo de la flota"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Sidebar Footer Fleet Summary */}
      <div className="p-2.5 border-t border-slate-800 bg-slate-950/90 text-[11px] text-slate-400 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span>Total Flota: <strong className="font-mono text-slate-200 tabular-nums">{devices.length}</strong></span>
          <span aria-hidden="true">·</span>
          <span>Activos: <strong className="font-mono text-emerald-400 tabular-nums">{devices.filter(d => d.status === 'moving').length}</strong></span>
        </div>
        <div className="flex items-center gap-1 text-cyan-400 font-medium text-[10px]">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>AES-256 E2EE</span>
        </div>
      </div>
    </aside>
  );
};
