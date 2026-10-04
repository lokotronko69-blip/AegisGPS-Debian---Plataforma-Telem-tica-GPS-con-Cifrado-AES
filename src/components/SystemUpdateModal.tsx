import React, { useState, useEffect, useCallback } from 'react';
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
  generateDebianPythonScript,
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
  const [updateStepText, setUpdateStepText] = useState<string | null>(null);
  const [updateSuccess, setUpdateSuccess] = useState<string | null>(null);
  const [needsTerminalUpgrade, setNeedsTerminalUpgrade] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);

  const [cloudVersion, setCloudVersion] = useState(AEGIS_APP_VERSION);
  const [changelog, setChangelog] = useState<string[]>([
    'v2.4.0: Sistema de Actualización OTA en 1 clic (/api/self-update y comando aegis-gps update)',
    'v2.4.0: Escáner Táctico de Dispositivos GPS Cercanos (Radar RF 360°, LAN, USB y Bluetooth BLE)',
    'v2.3.0: Interfaz Táctica Completa integrada en el nodo local Kali Linux (http://127.0.0.1:8765)',
    'v2.2.0: Auto-reparación del repositorio Docker en Kali Linux y motor AES-256-GCM verificado',
  ]);

  const [localNodeInfo, setLocalNodeInfo] = useState<{
    reachable: boolean;
    version: string;
    hostname: string;
    upToDate: boolean;
  }>({
    reachable: false,
    version: 'No detectado',
    hostname: 'kali',
    upToDate: false,
  });

  const serverOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const base64UpdateCmd = generateDebianBase64OneLiner(serverOrigin);

  const checkVersions = useCallback(async () => {
    setIsChecking(true);
    try {
      const vRes = await fetch('/api/version');
      if (vRes.ok) {
        const vData = await vRes.json();
        if (vData.version) setCloudVersion(vData.version);
        if (Array.isArray(vData.changelog)) setChangelog(vData.changelog);
      }
    } catch {
      // fallback to local constant
    }

    // Check local Kali Linux daemon on 127.0.0.1:8765
    try {
      const localRes = await fetch('http://127.0.0.1:8765/telemetry');
      if (localRes.ok) {
        const pkt = await localRes.json();
        const detectedVer = pkt.version || '1.0.0 (Versión Anterior)';
        const isCurrent = pkt.version === AEGIS_APP_VERSION;
        setLocalNodeInfo({
          reachable: true,
          version: detectedVer,
          hostname: pkt.hostname || 'kali',
          upToDate: isCurrent,
        });
      } else {
        setLocalNodeInfo((prev) => ({ ...prev, reachable: false }));
      }
    } catch {
      setLocalNodeInfo((prev) => ({ ...prev, reachable: false }));
    } finally {
      setTimeout(() => setIsChecking(false), 400);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setUpdateSuccess(null);
      setNeedsTerminalUpgrade(false);
      checkVersions();
    }
  }, [isOpen, checkVersions]);

  if (!isOpen) return null;

  const handleCopyUpdateCmd = () => {
    navigator.clipboard.writeText(base64UpdateCmd);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 3000);
  };

  const handleOneClickUpdateAll = async () => {
    setIsUpdating(true);
    setUpdateSuccess(null);
    setNeedsTerminalUpgrade(false);
    setUpdateStepText('1/3 Descargando última versión v' + cloudVersion + '...');

    try {
      // 1. Clear browser caches if any
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }

      // 2. Refresh cloud state
      setUpdateStepText('2/3 Sincronizando módulos de la aplicación web...');
      if (onRefreshState) {
        await onRefreshState();
      }

      // 3. Try OTA update on local Kali Linux node (127.0.0.1:8765)
      if (localNodeInfo.reachable) {
        setUpdateStepText('3/3 Aplicando actualización OTA en tu nodo Kali Linux (:8765)...');
        try {
          const latestPy = generateDebianPythonScript(serverOrigin);
          const otaRes = await fetch('http://127.0.0.1:8765/api/self-update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pythonCode: latestPy }),
          });
          if (otaRes.ok) {
            setUpdateSuccess(
              `¡Actualización completada a v${cloudVersion}! Tu aplicación web y tu nodo local Kali (${localNodeInfo.hostname}) están en la última versión.`
            );
            setLocalNodeInfo((prev) => ({
              ...prev,
              version: cloudVersion,
              upToDate: true,
            }));
          } else {
            // Local daemon is on v1.0 before /api/self-update existed
            navigator.clipboard.writeText(base64UpdateCmd);
            setCopiedCmd(true);
            setNeedsTerminalUpgrade(true);
            setUpdateSuccess(
              `Aplicación Web actualizada a v${cloudVersion}. Tu servicio local en :8765 tiene la versión inicial v1.0: hemos copiado automáticamente el comando de actualización en tu portapapeles para actualizar tu nodo Kali.`
            );
          }
        } catch {
          navigator.clipboard.writeText(base64UpdateCmd);
          setCopiedCmd(true);
          setNeedsTerminalUpgrade(true);
          setUpdateSuccess(
            `Aplicación Web actualizada a v${cloudVersion}. Comando de actualización para tu nodo Kali copiado al portapapeles.`
          );
        }
      } else {
        setUpdateSuccess(
          `¡Aplicación Web sincronizada y actualizada a la última versión disponible (v${cloudVersion})!`
        );
      }
    } finally {
      setIsUpdating(false);
      setUpdateStepText(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/95">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <ArrowUpCircle className={`w-5 h-5 ${isUpdating || isChecking ? 'animate-spin' : ''}`} />
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
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
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
                  <span>Plataforma Web Cloud</span>
                </div>
                <div className="font-mono text-lg font-bold text-white">v{cloudVersion}</div>
                <div className="text-[11px] text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Última compilación activa</span>
                </div>
              </div>
              <button
                onClick={checkVersions}
                className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs"
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
                  {localNodeInfo.reachable ? `v${localNodeInfo.version}` : 'Sin conexión local'}
                </div>
                <div className="text-[11px]">
                  {!localNodeInfo.reachable ? (
                    <span className="text-slate-400">Usa el comando inferior para instalar/actualizar</span>
                  ) : localNodeInfo.upToDate ? (
                    <span className="text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Nodo {localNodeInfo.hostname} actualizado a v{cloudVersion}</span>
                    </span>
                  ) : (
                    <span className="text-amber-400 font-semibold">
                      ⚡ Actualización a v{cloudVersion} disponible para {localNodeInfo.hostname}
                    </span>
                  )}
                </div>
              </div>
              {localNodeInfo.reachable && (
                <a
                  href="http://127.0.0.1:8765"
                  target="_blank"
                  rel="noreferrer"
                  className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-mono text-cyan-300 flex items-center gap-1"
                >
                  <span>:8765</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>

          {/* Primary 1-Click Update CTA */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/60 via-slate-900 to-cyan-950/60 border border-emerald-500/40 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-sm font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <span>Actualizar Aplicación a la Última Versión (v{cloudVersion})</span>
              </div>
              <p className="text-xs text-slate-300">
                Sincroniza todos los nuevos módulos (Radar de GPS Cercanos, Interfaz Completa en :8765 y Auto-Updater OTA).
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
                  ? updateStepText || 'Actualizando...'
                  : `Actualizar Ahora a v${cloudVersion}`}
              </span>
            </button>
          </div>

          {/* Update Feedback Message */}
          {updateSuccess && (
            <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-600/50 text-xs text-emerald-200 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-semibold">{updateSuccess}</div>
                {needsTerminalUpgrade && (
                  <div className="text-amber-300 font-mono text-[11px]">
                    Pega el comando copiado en tu terminal Kali (Ctrl+Shift+V) y recarga http://127.0.0.1:8765
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Kali / Debian Terminal Update Command (1-Step Base64 + CLI aegis-gps update) */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Actualizar Demonio e Interfaz Local en Kali Linux (:8765)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyUpdateCmd}
                  className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {copiedCmd ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCmd ? '¡Comando Copiado!' : 'Copiar Comando de Actualización'}</span>
                </button>
                <button
                  onClick={() =>
                    downloadScriptFile(
                      'install-aegis-gps.sh',
                      generateDebianInstallScript(serverOrigin)
                    )
                  }
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs flex items-center gap-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Descargar .sh</span>
                </button>
              </div>
            </div>

            <p className="text-xs text-slate-400">
              Si ya instalaste una versión anterior en tu Kali Linux, ejecuta este comando para actualizar{' '}
              <code className="text-cyan-300 font-mono">http://127.0.0.1:8765</code> a la{' '}
              <strong className="text-white">v{cloudVersion} completa</strong>. A partir de esta versión también podrás actualizar desde tu terminal escribiendo simplemente{' '}
              <code className="text-emerald-400 font-mono font-bold">aegis-gps update</code>:
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
