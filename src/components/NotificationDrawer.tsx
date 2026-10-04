import React, { useState } from 'react';
import { 
  Bell, 
  X, 
  Trash2, 
  AlertTriangle, 
  AlertOctagon, 
  Info, 
  ShieldAlert, 
  MapPin,
  Clock
} from 'lucide-react';
import { GpsAlert, AlertSeverity } from '../types/gps';

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  alerts: GpsAlert[];
  onClearAlerts: () => Promise<void>;
  onFocusAlertLocation?: (lat: number, lng: number) => void;
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({
  isOpen,
  onClose,
  alerts,
  onClearAlerts,
  onFocusAlertLocation,
}) => {
  const [filterSeverity, setFilterSeverity] = useState<AlertSeverity | 'all'>('all');

  if (!isOpen) return null;

  const filteredAlerts = alerts.filter((a) => {
    if (filterSeverity === 'all') return true;
    return a.severity === filterSeverity;
  });

  const getSeverityIcon = (severity: AlertSeverity) => {
    switch (severity) {
      case 'critical':
        return <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />;
      default:
        return <Info className="w-4 h-4 text-cyan-400 shrink-0" />;
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-96 bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
      
      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
        <div className="flex items-center gap-2.5">
          <Bell className="w-5 h-5 text-cyan-400" />
          <div>
            <h3 className="text-sm font-bold text-white">Centro de Notificaciones</h3>
            <p className="text-[11px] text-slate-400">
              Alertas telemáticas en tiempo real
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {alerts.length > 0 && (
            <button
              onClick={onClearAlerts}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
              title="Borrar todas las alertas"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Severity Filter Tabs */}
      <div className="p-2 border-b border-slate-800 bg-slate-950/60 flex items-center gap-1">
        <button
          onClick={() => setFilterSeverity('all')}
          className={`flex-1 py-1 text-xs font-medium rounded transition-colors ${
            filterSeverity === 'all'
              ? 'bg-slate-800 text-cyan-400'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Todas ({alerts.length})
        </button>
        <button
          onClick={() => setFilterSeverity('critical')}
          className={`flex-1 py-1 text-xs font-medium rounded transition-colors ${
            filterSeverity === 'critical'
              ? 'bg-slate-800 text-rose-400'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Críticas
        </button>
        <button
          onClick={() => setFilterSeverity('warning')}
          className={`flex-1 py-1 text-xs font-medium rounded transition-colors ${
            filterSeverity === 'warning'
              ? 'bg-slate-800 text-amber-400'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Avisos
        </button>
        <button
          onClick={() => setFilterSeverity('info')}
          className={`flex-1 py-1 text-xs font-medium rounded transition-colors ${
            filterSeverity === 'info'
              ? 'bg-slate-800 text-cyan-400'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Info
        </button>
      </div>

      {/* Alerts List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40 p-2 space-y-2">
        {filteredAlerts.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No hay alertas registradas con los filtros actuales.
          </div>
        ) : (
          filteredAlerts.map((alert) => (
            <div
              key={alert.id}
              className={`p-3 rounded-xl border transition-all ${
                alert.severity === 'critical'
                  ? 'bg-rose-950/20 border-rose-900/40'
                  : alert.severity === 'warning'
                  ? 'bg-amber-950/20 border-amber-900/40'
                  : 'bg-slate-950/60 border-slate-800/70'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {getSeverityIcon(alert.severity)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-bold text-slate-200 truncate">
                      {alert.deviceName}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500 shrink-0">
                      {new Date(alert.timestamp).toLocaleTimeString()}
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 mt-1 leading-snug">
                    {alert.message}
                  </p>

                  {alert.latitude !== undefined && alert.longitude !== undefined && onFocusAlertLocation && (
                    <button
                      onClick={() => onFocusAlertLocation(alert.latitude!, alert.longitude!)}
                      className="mt-2 inline-flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 font-medium"
                    >
                      <MapPin className="w-3 h-3" />
                      <span>Ver ubicación en mapa</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

    </div>
  );
};
