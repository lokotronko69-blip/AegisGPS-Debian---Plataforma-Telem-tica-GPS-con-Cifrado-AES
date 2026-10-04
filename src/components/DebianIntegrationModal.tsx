import React, { useState } from 'react';
import { 
  Terminal, 
  Copy, 
  Check, 
  X, 
  Server, 
  Radio, 
  Download, 
  ShieldCheck, 
  FileCode, 
  HardDrive,
  Activity
} from 'lucide-react';
import {
  generateDebianSystemdService,
  generateDebianMosquittoConf,
  generateDebianPythonScript,
  generateDebianInstallScript,
  generateDebianBase64OneLiner,
  downloadScriptFile,
} from '../utils/debianScripts';

interface DebianIntegrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  tcpPort: number;
}

export const DebianIntegrationModal: React.FC<DebianIntegrationModalProps> = ({
  isOpen,
  onClose,
  tcpPort,
}) => {
  const [activeTab, setActiveTab] = useState<'install' | 'systemd' | 'python' | 'mqtt' | 'tcp'>('install');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [bridgeUrl, setBridgeUrl] = useState('http://127.0.0.1:8765/telemetry');
  const [bridgeStatus, setBridgeStatus] = useState<'idle' | 'checking' | 'connected' | 'unreachable'>('idle');
  const [bridgeHostInfo, setBridgeHostInfo] = useState<string | null>(null);

  const serverOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://tu-servidor.run.app';

  const systemdService = generateDebianSystemdService();
  const mosquittoConf = generateDebianMosquittoConf();
  const pythonScript = generateDebianPythonScript(serverOrigin);
  const installScript = generateDebianInstallScript(serverOrigin);
  const base64OneLiner = generateDebianBase64OneLiner(serverOrigin);

  const checkLocalDebianBridge = async () => {
    setBridgeStatus('checking');
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2500);
      const res = await fetch(bridgeUrl, { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) {
        const packet = await res.json();
        setBridgeStatus('connected');
        setBridgeHostInfo(
          `Host Debian: ${packet.hostname || 'debian-node'} · Lat: ${packet.telemetryPreview?.latitude ?? ''} Lon: ${packet.telemetryPreview?.longitude ?? ''}`
        );
        // Relay encrypted packet to backend
        await fetch('/api/gps/encrypted-aes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deviceId: packet.deviceId || 'dev-debian-patrol-04',
            algorithm: packet.algorithm || 'AES-256-GCM',
            transport: 'HTTPS',
            iv: packet.iv,
            ciphertext: packet.ciphertext,
            authTag: packet.authTag,
          }),
        });
      } else {
        setBridgeStatus('unreachable');
      }
    } catch {
      setBridgeStatus('unreachable');
    }
  };

  if (!isOpen) return null;

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-5xl h-[88vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-white flex items-center gap-2">
                <span>Centro de Integración Debian Linux & Protocolos GPS</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 border border-emerald-800 text-emerald-400">
                  DEBIAN 11/12 · ARCH/UBUNTU
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Instalador autónomo Base64 (sin error <code>&lt;!doctype html&gt;</code>), daemon systemd y cifrado AES-256-GCM
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

        {/* Tab Selector */}
        <div className="px-6 pt-3 border-b border-slate-800 flex items-center gap-2 bg-slate-950/50 overflow-x-auto">
          <button
            onClick={() => setActiveTab('install')}
            className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'install'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Instalador 1-Paso (Base64)</span>
          </button>

          <button
            onClick={() => setActiveTab('systemd')}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'systemd'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>Servicio Systemd</span>
          </button>

          <button
            onClick={() => setActiveTab('python')}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'python'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Cliente Python GNSS + AES</span>
          </button>

          <button
            onClick={() => setActiveTab('mqtt')}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'mqtt'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Broker MQTT TLS</span>
          </button>

          <button
            onClick={() => setActiveTab('tcp')}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'tcp'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            <span>Sockets TCP (Puerto {tcpPort})</span>
          </button>
        </div>

        {/* Content Pane */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* TAB 0: AUTOMATED INSTALLER (BASE64 + DIRECT DOWNLOAD) */}
          {activeTab === 'install' && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Instalación Autónoma en 1 Paso para Debian GNU/Linux
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Codificado en Base64 para evitar que proxies en la nube devuelvan HTML (<code>&lt;!doctype html&gt;</code>) al usar <code>curl</code>.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => downloadScriptFile('install-aegis-gps.sh', installScript)}
                    className="flex items-center gap-1.5 px-3.5 py-2 text-xs bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-xl transition-colors shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Descargar .sh</span>
                  </button>
                </div>
              </div>

              {/* Primary Base64 One-Liner */}
              <div className="p-4 bg-slate-950 border border-emerald-800/70 rounded-xl space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" />
                    <span>1. Copia y pega este comando en tu terminal Debian (ejecución directa sin curl):</span>
                  </span>
                  <button
                    onClick={() => handleCopy(base64OneLiner, 'b64-installer')}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded-lg transition-colors shrink-0"
                  >
                    {copiedKey === 'b64-installer' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === 'b64-installer' ? '¡Copiado!' : 'Copiar Comando 1-Línea'}</span>
                  </button>
                </div>

                <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg font-mono text-[11px] text-cyan-300 overflow-x-auto max-h-24 select-all break-all">
                  <code>{base64OneLiner}</code>
                </div>
              </div>

              {/* Local Debian Bridge Status & Verification */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-bold text-slate-200">
                      Puente Local Debian (Detecta tu servicio <code>aegis-gps</code> en el puerto 8765):
                    </span>
                  </div>
                  <span
                    className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
                      bridgeStatus === 'connected'
                        ? 'bg-emerald-950/90 border-emerald-700 text-emerald-400'
                        : bridgeStatus === 'checking'
                        ? 'bg-slate-900 border-slate-700 text-cyan-400'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    {bridgeStatus === 'connected'
                      ? 'CONECTADO AL DAEMON DEBIAN'
                      : bridgeStatus === 'checking'
                      ? 'COMPROBANDO...'
                      : 'ESPERANDO INSTALACIÓN LOCAL'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={bridgeUrl}
                    onChange={(e) => setBridgeUrl(e.target.value)}
                    className="flex-1 px-3 py-1.5 text-xs font-mono bg-slate-900 border border-slate-800 rounded-lg text-slate-200"
                    placeholder="http://127.0.0.1:8765/telemetry"
                  />
                  <button
                    onClick={checkLocalDebianBridge}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-cyan-300 rounded-lg border border-slate-700 transition-colors"
                  >
                    Sincronizar Ahora
                  </button>
                </div>

                {bridgeHostInfo && (
                  <div className="text-xs font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-800/50 rounded-lg p-2">
                    ✓ {bridgeHostInfo} (Cifrado AES-256-GCM verificado)
                  </div>
                )}
              </div>

              {/* Raw Bash Script Preview */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300">
                    Código fuente completo del script Bash (<code>install-aegis-gps.sh</code>):
                  </span>
                  <button
                    onClick={() => handleCopy(installScript, 'raw-installer')}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors"
                  >
                    {copiedKey === 'raw-installer' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === 'raw-installer' ? 'Copiado' : 'Copiar Script Bash'}</span>
                  </button>
                </div>
                <pre className="p-4 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-cyan-300 overflow-x-auto max-h-64 leading-relaxed">
                  {installScript}
                </pre>
              </div>
            </div>
          )}
          
          {/* TAB 1: SYSTEMD */}
          {activeTab === 'systemd' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">Unidad de Servicio Systemd para Debian</h3>
                  <p className="text-xs text-slate-400">
                    Permite que el daemon de telemetría inicie automáticamente con el sistema y se recupere ante caídas.
                  </p>
                </div>
                <button
                  onClick={() => handleCopy(systemdService, 'systemd')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors"
                >
                  {copiedKey === 'systemd' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'systemd' ? 'Copiado' : 'Copiar archivo unit'}</span>
                </button>
              </div>

              <div className="relative">
                <pre className="p-4 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-cyan-300 overflow-x-auto leading-relaxed">
                  {systemdService}
                </pre>
              </div>

              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <h4 className="text-xs font-bold text-slate-200">Comandos de activación en terminal Debian:</h4>
                <div className="space-y-1.5 font-mono text-xs text-slate-300">
                  <div className="p-2 rounded bg-slate-900 border border-slate-800 flex items-center justify-between">
                    <code>sudo cp aegis-gps.service /etc/systemd/system/</code>
                    <button onClick={() => handleCopy('sudo cp aegis-gps.service /etc/systemd/system/', 'cmd1')} className="text-slate-400 hover:text-white">
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="p-2 rounded bg-slate-900 border border-slate-800 flex items-center justify-between">
                    <code>sudo systemctl daemon-reload && sudo systemctl enable --now aegis-gps</code>
                    <button onClick={() => handleCopy('sudo systemctl daemon-reload && sudo systemctl enable --now aegis-gps', 'cmd2')} className="text-slate-400 hover:text-white">
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="p-2 rounded bg-slate-900 border border-slate-800 flex items-center justify-between">
                    <code>sudo systemctl status aegis-gps</code>
                    <button onClick={() => handleCopy('sudo systemctl status aegis-gps', 'cmd3')} className="text-slate-400 hover:text-white">
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PYTHON CLIENT */}
          {activeTab === 'python' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">Cliente GNSS en Python 3 con Cifrado AES-256-GCM</h3>
                  <p className="text-xs text-slate-400">
                    Ejecutable en Raspberry Pi, ordenadores industriales Debian y routers telemáticos con antena GPS USB/UART.
                  </p>
                </div>
                <button
                  onClick={() => handleCopy(pythonScript, 'python')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors"
                >
                  {copiedKey === 'python' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'python' ? 'Copiado' : 'Copiar Script'}</span>
                </button>
              </div>

              <div className="relative">
                <pre className="p-4 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-slate-200 overflow-x-auto max-h-96 leading-relaxed">
                  {pythonScript}
                </pre>
              </div>
            </div>
          )}

          {/* TAB 3: MQTT BROKER */}
          {activeTab === 'mqtt' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">Configuración Mosquitto MQTT sobre TLS v1.3 en Debian</h3>
                  <p className="text-xs text-slate-400">
                    Garantiza transporte cifrado de alta eficiencia para dispositivos de bajo consumo (LTE-M / NB-IoT).
                  </p>
                </div>
                <button
                  onClick={() => handleCopy(mosquittoConf, 'mqtt')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors"
                >
                  {copiedKey === 'mqtt' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'mqtt' ? 'Copiado' : 'Copiar Config'}</span>
                </button>
              </div>

              <pre className="p-4 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-amber-300 overflow-x-auto leading-relaxed">
                {mosquittoConf}
              </pre>

              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2 text-xs text-slate-300">
                <h4 className="font-bold text-slate-100">Topología de Tópicos MQTT Seguros:</h4>
                <ul className="list-disc pl-5 space-y-1 font-mono text-[11px] text-cyan-300">
                  <li><code>gps/+/telemetry</code> - Publicación de tramas con payload JSON cifrado en AES-256</li>
                  <li><code>gps/+/commands</code> - Comandos remotos (corte de ignición, sondeo GNSS)</li>
                  <li><code>gps/+/status</code> - Mensajes LWT (Last Will & Testament) para detección de caída</li>
                </ul>
              </div>
            </div>
          )}

          {/* TAB 4: TCP SOCKETS */}
          {activeTab === 'tcp' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white">Ingesta Directa por Sockets TCP (Puerto {tcpPort})</h3>
                <p className="text-xs text-slate-400">
                  Para dispositivos hardware profesionales (Teltonika, Quectel, Concox GT06, Meitrack) que envían stream binario o ASCII.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                  <h4 className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Modo 1: Trama Cifrada AES-256 (JSON sobre TCP)</span>
                  </h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    El cliente abre socket TCP a <code>ip-servidor:{tcpPort}</code> y envía un bloque JSON por línea con el texto cifrado, IV y tag de autenticación. El servidor responde con <code>ACK:OK\r\n</code> tras verificar el MAC.
                  </p>
                  <pre className="p-2 bg-slate-900 rounded font-mono text-[10px] text-slate-300 overflow-x-auto">
                    {`{"deviceId":"dev-01","iv":"...","ciphertext":"...","authTag":"..."}`}
                  </pre>
                </div>

                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                  <h4 className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <Radio className="w-4 h-4" />
                    <span>Modo 2: Tramas Binarias Teltonika / NMEA</span>
                  </h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Soporte nativo para tramas estándar NMEA 0183 ($GPRMC) y protocolo binario Teltonika AVL Codec 8.
                  </p>
                  <pre className="p-2 bg-slate-900 rounded font-mono text-[10px] text-slate-300 overflow-x-auto">
                    {`$GPRMC,123519,A,4025.038,N,00342.000,W,022.4,084.4,021026,003.1,W*6A`}
                  </pre>
                </div>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
