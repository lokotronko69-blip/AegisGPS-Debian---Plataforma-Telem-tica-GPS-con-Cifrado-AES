import React, { useState, useEffect } from 'react';
import { 
  Terminal, 
  Copy, 
  Check, 
  X, 
  Server, 
  Radio, 
  Lock, 
  Cpu, 
  Download,
  ShieldCheck,
  FileCode,
  HardDrive
} from 'lucide-react';

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
  const [activeTab, setActiveTab] = useState<'systemd' | 'python' | 'mqtt' | 'tcp' | 'install'>('systemd');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [configData, setConfigData] = useState<{
    systemdService: string;
    mosquittoConf: string;
    pythonScript: string;
    installScript: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetch('/api/debian/config')
        .then((res) => res.json())
        .then((data) => setConfigData(data))
        .catch((err) => console.error('Failed to load debian config:', err));
    }
  }, [isOpen]);

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
                Daemon systemd, ingesta TCP en puerto :{tcpPort}, broker MQTT TLS y cifrado AES-256
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

          <button
            onClick={() => setActiveTab('install')}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'install'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Instalador Automatizado</span>
          </button>
        </div>

        {/* Content Pane */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
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
                  onClick={() => handleCopy(configData?.systemdService || '', 'systemd')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors"
                >
                  {copiedKey === 'systemd' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'systemd' ? 'Copiado' : 'Copiar archivo unit'}</span>
                </button>
              </div>

              <div className="relative">
                <pre className="p-4 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-cyan-300 overflow-x-auto leading-relaxed">
                  {configData?.systemdService || 'Cargando...'}
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
                  onClick={() => handleCopy(configData?.pythonScript || '', 'python')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors"
                >
                  {copiedKey === 'python' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'python' ? 'Copiado' : 'Copiar Script'}</span>
                </button>
              </div>

              <div className="relative">
                <pre className="p-4 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-slate-200 overflow-x-auto max-h-96 leading-relaxed">
                  {configData?.pythonScript || 'Cargando script...'}
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
                  onClick={() => handleCopy(configData?.mosquittoConf || '', 'mqtt')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors"
                >
                  {copiedKey === 'mqtt' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'mqtt' ? 'Copiado' : 'Copiar Config'}</span>
                </button>
              </div>

              <pre className="p-4 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-amber-300 overflow-x-auto leading-relaxed">
                {configData?.mosquittoConf || 'Cargando...'}
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

          {/* TAB 5: AUTOMATED INSTALLER */}
          {activeTab === 'install' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">Instalador en 1 Paso para Debian GNU/Linux</h3>
                  <p className="text-xs text-slate-400">
                    Instala automáticamente paquetes apt requeridos (gpsd, mosquitto, python3-cryptography) y configura el servicio.
                  </p>
                </div>
                <button
                  onClick={() => handleCopy(configData?.installScript || '', 'installer')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-lg transition-colors"
                >
                  {copiedKey === 'installer' ? <Check className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'installer' ? 'Copiado' : 'Copiar Script Completo'}</span>
                </button>
              </div>

              <pre className="p-4 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-cyan-300 overflow-x-auto leading-relaxed">
                {configData?.installScript || 'Cargando instalador...'}
              </pre>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
