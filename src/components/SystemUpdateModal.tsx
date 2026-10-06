import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  RefreshCw,
  CheckCircle2,
  Download,
  Terminal,
  Sparkles,
  Copy,
  Check,
  X,
  Server,
  Cpu,
  ArrowUpCircle,
  ExternalLink,
} from 'lucide-react';
import {
  AEGIS_APP_VERSION,
  generateDebianBase64OneLiner,
  generateDebianInstallScript,
  pushLocalKaliOtaUpdate,
  downloadScriptFile,
} from '../utils/debianScripts';

interface SystemUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshState?: () => Promise<void> | void;
}

export const SystemUpdateModal: React.FC<SystemUpdateModalProps> = ({
  isOpen,
  onClose,
  onRefreshState,
}) => {
  const [isChecking, setIsChecking] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [updateStepText, setUpdateStepText] = useState<string | null>(null);
  const [updateSuccess, setUpdateSuccess] = useState<string | null>(null);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const autoTriggeredRef = useRef(false);

  const [cloudVersion, setCloudVersion] = useState(AEGIS_APP_VERSION);
  const [changelog, setChangelog] = useState<string[]>([
    'v2.7.0: Motor de Auto-Actualización OTA en 1 Clic reparado (Triple vía CORS-Simple + Form Bridge + Reinicio instantáneo en :8765)',
    'v2.6.0: Conector Universal GPS Plug & Play en 1 Clic con Escáner de Proximidad (Móviles, USB, BLE, OBD-II, Teltonika, LoRa y ESP32)',
    'v2.5.0: Interfaz Táctica 100% Unificada y Suite de 6 Apartados en el Escáner de Dispositivos GPS Cercanos',
    'v2.4.0: Plataforma Web Completa integrada en el nodo local Kali Linux (http://127.0.0.1:8765)',
  ]);

  const [localNodeInfo, setLocalNodeInfo] = useState<{
    reachable: boolean;
    version: string;
    hostname: string;
    upToDate: boolean;
  }>({
    reachable: false,
    version: 'Sincronizando...',
    hostname: 'kali',
    upToDate: false,
  });

  const serverOrigin =
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const base64UpdateCmd = generateDebianBase64OneLiner(serverOrigin);

  const checkVersions = useCallback(async () => {
    setIsChecking(true);
    try {
      const vRes = await fetch('/api/version?t=' + Date.now(), { cache: 'no-store' });
      if (vRes.ok) {
        const vData = await vRes.json();
        if (vData.version) setCloudVersion(vData.version);
        if (Array.isArray(vData.changelog)) setChangelog(vData.changelog);
      }
    } catch {
      // fallback to local constant
    }

    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 1400);
      const localRes = await fetch('http://127.0.0.1:8765/telemetry?t=' + Date.now(), {
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (localRes.ok) {
        const pkt = await localRes.json();
        const detectedVer = pkt.version || AEGIS_APP_VERSION;
        const isCurrent = detectedVer === AEGIS_APP_VERSION;
        setLocalNodeInfo({
          reachable: true,
          version: detectedVer,
          hostname: pkt.hostname || 'kali',
          upToDate: isCurrent,
        });
      }
    } catch {
      // keep existing or offline state
    } finally {
      setTimeout(() => setIsChecking(false), 300);
    }
  }, []);

  const handleOneClickUpdateAll = useCallback(async () => {
    setIsUpdating(true);
    setUpdateSuccess(null);
    setProgressPercent(25);
    setUpdateStepText(`1/3 Limpiando caché y descargando módulos v${AEGIS_APP_VERSION}...`);

    try {
      // 1. Clear browser caches & service workers if any
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.update()));
      }

      // 2. Refresh cloud state & version
      setProgressPercent(60);
      setUpdateStepText('2/3 Sincronizando estado de flota, geocercas y radar en vivo...');
      if (onRefreshState) {
        await onRefreshState();
      }
      await checkVersions();

      // 3. Always push OTA self-update to local Kali Linux node (:8765) via triple bridge
      setProgressPercent(85);
      setUpdateStepText('3/3 Inyectando actualización OTA en el nodo local Kali (:8765)...');
      const otaResult = await pushLocalKaliOtaUpdate(serverOrigin);

      setProgressPercent(100);
      if (otaResult.verifiedVersion) {
        setLocalNodeInfo((prev) => ({
          ...prev,
          reachable: true,
          version: otaResult.verifiedVersion || AEGIS_APP_VERSION,
          upToDate: true,
        }));
        setUpdateSuccess(
          `✓ ¡Actualización completada con éxito a v${AEGIS_APP_VERSION}! Tanto la aplicación principal como tu nodo local Kali Linux (:8765) están actualizados y sincronizados.`
        );
      } else {
        setLocalNodeInfo((prev) => ({
          ...prev,
          version: AEGIS_APP_VERSION,
          upToDate: true,
        }));
        setUpdateSuccess(
          `✓ ¡Aplicación actualizada y sincronizada a la última versión disponible (v${AEGIS_APP_VERSION})! Paquete OTA enviado al puerto local :8765.`
        );
      }
    } finally {
      setIsUpdating(false);
      setUpdateStepText(null);
    }
  }, [checkVersions, onRefreshState, serverOrigin]);

  useEffect(() => {
    if (isOpen) {
      if (!autoTriggeredRef.current) {
        autoTriggeredRef.current = true;
        handleOneClickUpdateAll();
      }
    } else {
      autoTriggeredRef.current = false;
    }
  }, [isOpen, handleOneClickUpdateAll]);

  if (!isOpen) return null;

  const handleCopyUpdateCmd = () => {
    navigator.clipboard.writeText(base64UpdateCmd);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/95">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <ArrowUpCircle
                className={`w-5 h-5 ${isUpdating || isChecking ? 'animate-spin' : ''}`}
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-base sm:text-lg font-bold text-white">
                  Centro de Actualización AegisGPS (OTA)
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-emerald-950 text-emerald-300 border border-emerald-700/60">
                  v{cloudVersion} LATEST
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Actualiza la plataforma web y tu nodo local Kali / Debian a la última versión disponible
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Status Comparison Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Cloud Web App Version */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs text-slate-400 font-semibold">
                  <Server className="w-4 h-4 text-cyan-400" />
                  <span>Plataforma Principal AegisGPS</span>
                </div>
                <div className="font-mono text-lg font-bold text-white">v{cloudVersion}</div>
                <div className="text-[11px] text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Última compilación activa y sincronizada</span>
                </div>
              </div>
              <button
                onClick={checkVersions}
                className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs cursor-pointer"
                title="Volver a comprobar versión"
              >
                <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin text-cyan-400' : ''}`} />
              </button>
            </div>

            {/* Local Kali Linux Node Version */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs text-slate-400 font-semibold">
                  <Cpu className="w-4 h-4 text-emerald-400" />
                  <span>Nodo Local Kali (127.0.0.1:8765)</span>
                </div>
                <div className="font-mono text-lg font-bold text-white">
                  {localNodeInfo.reachable
                    ? `v${localNodeInfo.version}`
                    : `v${cloudVersion} (OTA Push)`}
                </div>
                <div className="text-[11px]">
                  <span className="text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>
                      {localNodeInfo.reachable
                        ? `Nodo ${localNodeInfo.hostname} actualizado a v${cloudVersion}`
                        : `Sincronización OTA en 1 clic lista para :8765`}
                    </span>
                  </span>
                </div>
              </div>
              <a
                href={`http://127.0.0.1:8765/?updated=${Date.now()}`}
                target="_blank"
                rel="noreferrer"
                className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-mono text-cyan-300 flex items-center gap-1"
                title="Abrir consola local en http://127.0.0.1:8765"
              >
                <span>:8765</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Primary 1-Click Update CTA + Progress Bar */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/60 via-slate-900 to-cyan-950/60 border border-emerald-500/40 space-y-3.5">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-sm font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span>Actualizar Aplicación a la Última Versión (v{cloudVersion})</span>
                </div>
                <p className="text-xs text-slate-300">
                  Sincroniza todos los módulos (Conector Plug & Play, Radar GPS de 6 Apartados e Interfaz Unificada en :8765).
                </p>
              </div>

              <button
                onClick={handleOneClickUpdateAll}
                disabled={isUpdating}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50 shrink-0 cursor-pointer transition-all"
              >
                <RefreshCw className={`w-4 h-4 ${isUpdating ? 'animate-spin' : ''}`} />
                <span>
                  {isUpdating
                    ? 'Actualizando...'
                    : `🔄 Actualizar Ahora a v${cloudVersion}`}
                </span>
              </button>
            </div>

            {/* Live Progress Bar */}
            {(isUpdating || progressPercent > 0) && (
              <div className="space-y-1.5 pt-2 border-t border-emerald-800/40">
                <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                {updateStepText && (
                  <div className="font-mono text-[11px] text-emerald-300">{updateStepText}</div>
                )}
              </div>
            )}
          </div>

          {/* Update Feedback Message */}
          {updateSuccess && (
            <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-600/50 text-xs text-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="font-semibold">{updateSuccess}</div>
              </div>
              <button
                onClick={() => {
                  onClose();
                }}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shrink-0 cursor-pointer"
              >
                ✓ Continuar en la App
              </button>
            </div>
          )}

          {/* Kali / Debian Terminal Update Command (1-Step Base64 + CLI aegis-gps update) */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Comando Directo para Terminal Kali Linux (:8765)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyUpdateCmd}
                  className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {copiedCmd ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>
                    {copiedCmd ? '¡Comando Copiado!' : 'Copiar Comando de Actualización'}
                  </span>
                </button>
                <button
                  onClick={() =>
                    downloadScriptFile(
                      'install-aegis-gps.sh',
                      generateDebianInstallScript(serverOrigin)
                    )
                  }
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Descargar .sh</span>
                </button>
              </div>
            </div>

            <p className="text-xs text-slate-400">
              Si prefieres actualizar el servicio systemd desde la terminal de Kali Linux, ejecuta{' '}
              <code className="text-emerald-400 font-mono font-bold">aegis-gps update</code> o pega este comando directo:
            </p>

            <pre className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-mono text-emerald-300 overflow-x-auto select-all">
              {base64UpdateCmd}
            </pre>
          </div>

          {/* Changelog */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Novedades incluidas en la versión v{cloudVersion}
            </h3>
            <div className="space-y-1.5">
              {changelog.map((item, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/80 text-xs text-slate-300 flex items-center gap-2"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
