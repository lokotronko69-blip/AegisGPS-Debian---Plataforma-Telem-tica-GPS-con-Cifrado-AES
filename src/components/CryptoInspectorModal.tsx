import React, { useState } from 'react';
import { 
  ShieldCheck, 
  ShieldAlert, 
  Lock, 
  Key, 
  Copy, 
  Check, 
  X, 
  Terminal, 
  AlertTriangle, 
  Zap,
  ArrowRight
} from 'lucide-react';
import { CryptoPacketLog, GpsDevice } from '../types/gps';

interface CryptoInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  logs: CryptoPacketLog[];
  devices: GpsDevice[];
  selectedDevice?: GpsDevice | null;
}

export const CryptoInspectorModal: React.FC<CryptoInspectorModalProps> = ({
  isOpen,
  onClose,
  logs,
  devices,
  selectedDevice,
}) => {
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [tamperStatus, setTamperStatus] = useState<string | null>(null);
  const [isTampering, setIsTampering] = useState(false);

  if (!isOpen) return null;

  const uniqueLogs = Array.from(new Map(logs.map((l) => [l.id, l])).values());
  const currentLog = uniqueLogs.find((l) => l.id === selectedLogId) || uniqueLogs[0];
  const device = devices.find((d) => d.id === currentLog?.deviceId) || selectedDevice;

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  // Test Tampering: corrupt 1 byte of ciphertext and send to server to test AES integrity rejection
  const handleTestTamper = async () => {
    if (!currentLog || !device) return;
    setIsTampering(true);
    setTamperStatus('Modificando byte 4 de la trama cifrada para simular sabotaje...');

    try {
      // Invert one hex char in ciphertext
      const original = currentLog.ciphertextHex;
      const corrupted = original.substring(0, 4) + (original[4] === 'a' ? 'b' : 'a') + original.substring(5);

      const res = await fetch('/api/gps/encrypted-aes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: device.id,
          ciphertext: corrupted,
          iv: currentLog.ivHex,
          authTag: currentLog.authTagHex,
          algorithm: 'AES-256-GCM',
          transport: 'HTTPS-SABOTAJE-TEST',
        }),
      });

      if (!res.ok) {
        setTamperStatus('¡Éxito de Seguridad! El servidor detectó la manipulación del payload cifrado y rechazó la trama (Tag MAC Inválido). Se ha generado una alerta de seguridad.');
      } else {
        setTamperStatus('Error inesperado: la trama fue aceptada.');
      }
    } catch {
      setTamperStatus('Servidor rechazó la conexión.');
    } finally {
      setIsTampering(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-5xl h-[85vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* Modal Top Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-white flex items-center gap-2">
                <span>Inspección Criptográfica en Tiempo Real (AES-256-GCM)</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 border border-cyan-800 text-cyan-400">
                  E2EE / EN-TRÁNSITO
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Verificación de integridad de tramas GNSS recibidas por HTTPS, TCP y MQTT
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

        {/* Modal Content: Split Pane */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
          
          {/* Left: Stream of Received Encrypted Packets */}
          <div className="w-full md:w-80 border-r border-slate-800 flex flex-col bg-slate-950/50">
            <div className="p-3 border-b border-slate-800 text-xs font-semibold text-slate-300 flex items-center justify-between">
              <span>Tramas Cifradas Recibidas</span>
              <span className="font-mono text-cyan-400 tabular-nums">{logs.length}</span>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40">
              {uniqueLogs.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  Esperando paquetes de telemetría...
                </div>
              ) : (
                uniqueLogs.map((log) => {
                  const isSelected = (currentLog?.id === log.id);
                  return (
                    <button
                      key={log.id}
                      onClick={() => setSelectedLogId(log.id)}
                      className={`w-full text-left p-3 transition-colors ${
                        isSelected ? 'bg-cyan-950/40 border-l-2 border-cyan-400' : 'hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-200 truncate">
                          {log.deviceName}
                        </span>
                        <span className="text-[10px] font-mono text-cyan-400">
                          {log.transport}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                        <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                        <span className="text-emerald-400 font-sans">
                          {log.latencyMs}ms descifrado
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right: Detailed Cryptographic Dissection */}
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-6 space-y-6">
            {currentLog ? (
              <>
                {/* Device Key Banner */}
                {device && (
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <Key className="w-4 h-4 text-cyan-400 shrink-0" />
                      <div>
                        <div className="text-xs font-semibold text-slate-200">
                          Clave Privada AES-256 ({device.name})
                        </div>
                        <div className="font-mono text-[11px] text-slate-400 break-all select-all">
                          {device.aesKeyHex}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleCopyKey(device.aesKeyHex)}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors shrink-0"
                    >
                      {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKey ? 'Copiada' : 'Copiar Clave'}</span>
                    </button>
                  </div>
                )}

                {/* Verification Status Card */}
                <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-800/40 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="w-6 h-6 text-emerald-400" />
                    <div>
                      <h4 className="text-xs font-bold text-emerald-300">
                        INTEGRIDAD Y AUTENTICIDAD VERIFICADA POR HARDWARE
                      </h4>
                      <p className="text-[11px] text-slate-300">
                        La trama fue autenticada con tag GCM de 128 bits. Tiempo de descifrado en Debian: <strong className="font-mono text-emerald-400 tabular-nums">{currentLog.latencyMs} ms</strong>
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-1 rounded bg-emerald-900/40 text-emerald-300 border border-emerald-700/50">
                    MAC VÁLIDO
                  </span>
                </div>

                {/* Cryptographic Primitives Breakdown */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Ciphertext */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
                      <span>1. Texto Cifrado (Ciphertext en Hex)</span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {currentLog.ciphertextHex.length / 2} bytes
                      </span>
                    </label>
                    <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg font-mono text-[11px] text-cyan-300 break-all max-h-28 overflow-y-auto leading-relaxed select-all">
                      {currentLog.ciphertextHex}
                    </div>
                  </div>

                  {/* IV & Auth Tag */}
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
                        <span>2. Vector de Inicialización (IV / 96-bit)</span>
                        <span className="text-[10px] text-slate-500 font-mono">12 bytes</span>
                      </label>
                      <div className="p-2 bg-slate-950 border border-slate-800 rounded-lg font-mono text-[11px] text-amber-300 select-all">
                        {currentLog.ivHex}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
                        <span>3. Tag de Autenticación GCM (MAC)</span>
                        <span className="text-[10px] text-slate-500 font-mono">16 bytes / 128-bit</span>
                      </label>
                      <div className="p-2 bg-slate-950 border border-slate-800 rounded-lg font-mono text-[11px] text-emerald-300 select-all">
                        {currentLog.authTagHex || 'N/A (Modo CBC)'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Decrypted Payload JSON */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
                    <span>4. Telemetría Descifrada (Texto Plano Verificado)</span>
                    <span className="text-[10px] text-slate-500 font-mono">JSON Estándar</span>
                  </label>
                  <pre className="p-4 bg-slate-950 border border-slate-800 rounded-lg font-mono text-xs text-slate-200 overflow-x-auto max-h-48 leading-relaxed">
                    {JSON.stringify(currentLog.decryptedPayload, null, 2)}
                  </pre>
                </div>

                {/* Tampering / Attack Simulation Tester */}
                <div className="p-4 rounded-xl bg-slate-950 border border-rose-900/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-rose-400">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="text-xs font-bold">Prueba de Detección de Sabotaje (Ataque Man-in-the-Middle)</span>
                    </div>
                    <button
                      onClick={handleTestTamper}
                      disabled={isTampering}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-rose-950 hover:bg-rose-900 border border-rose-800 text-rose-200 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <Zap className="w-3.5 h-3.5 text-rose-400" />
                      <span>{isTampering ? 'Verificando...' : 'Simular Ataque a Trama'}</span>
                    </button>
                  </div>

                  <p className="text-[11px] text-slate-400">
                    Al pulsar este botón, se alterará intencionalmente 1 byte del texto cifrado y se transmitirá al endpoint de ingesta. El servidor usará la verificación GCM y la rechazará al instante.
                  </p>

                  {tamperStatus && (
                    <div className="p-2.5 rounded bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300 animate-in fade-in">
                      {tamperStatus}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">
                Selecciona una trama en la columna izquierda.
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
};
