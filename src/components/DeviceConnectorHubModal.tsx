import React, { useState, useEffect } from 'react';
import { 
  Smartphone, 
  Car, 
  Terminal, 
  Cpu, 
  Globe, 
  Radio, 
  Copy, 
  Check, 
  X, 
  ShieldCheck, 
  QrCode, 
  Download, 
  ExternalLink,
  ChevronRight,
  Zap,
  Activity
} from 'lucide-react';
import QRCode from 'qrcode';
import { GpsDevice } from '../types/gps';
import {
  generateDebianBase64OneLiner,
  generateDebianInstallScript,
  downloadScriptFile,
} from '../utils/debianScripts';

interface DeviceConnectorHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  devices: GpsDevice[];
  onSelectDeviceForMap?: (device: GpsDevice) => void;
}

export const DeviceConnectorHubModal: React.FC<DeviceConnectorHubModalProps> = ({
  isOpen,
  onClose,
  devices,
  onSelectDeviceForMap,
}) => {
  const [activeTab, setActiveTab] = useState<'mobile' | 'obd' | 'teltonika' | 'debian' | 'esp32' | 'api' | 'live'>('mobile');
  const [deviceIdInput, setDeviceIdInput] = useState(() => `movil-${Math.floor(1000 + Math.random() * 9000)}`);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [livePacketsCount, setLivePacketsCount] = useState(0);
  const [qrSvg, setQrSvg] = useState<string>('');

  const serverOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://tu-servidor.run.app';
  const serverHost = typeof window !== 'undefined' ? window.location.hostname : 'tu-servidor.run.app';

  const osmandUrl = `${serverOrigin}/api/gps/osmand?id=${deviceIdInput}`;
  const owntracksUrl = `${serverOrigin}/api/gps/owntracks`;
  const restPushUrl = `${serverOrigin}/api/gps/push`;
  const aesEncryptedUrl = `${serverOrigin}/api/gps/encrypted-aes`;

  useEffect(() => {
    // Increment live count whenever packets arrive
    setLivePacketsCount(devices.filter(d => d.lastSeen).length);
  }, [devices]);

  useEffect(() => {
    if (osmandUrl) {
      QRCode.toString(osmandUrl, {
        type: 'svg',
        margin: 1,
        color: {
          dark: '#38bdf8',
          light: '#0f172a',
        },
      })
        .then((svg) => setQrSvg(svg))
        .catch(() => {});
    }
  }, [osmandUrl]);

  if (!isOpen) return null;

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-5xl h-[90vh] bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* Top Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/95">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-sm">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-white flex items-center gap-2">
                <span>Centro Universal de Conexión de Dispositivos GPS</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 border border-emerald-800 text-emerald-400">
                  PLUG & PLAY
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Conecta smartphones, localizadores de coche OBD/GPRS, Teltonika, Raspberry Pi o microcontroladores
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="px-6 pt-2 border-b border-slate-800 flex items-center gap-1.5 bg-slate-950/50 overflow-x-auto select-none">
          <button
            onClick={() => setActiveTab('mobile')}
            className={`px-3 py-2 text-xs font-semibold border-b-2 transition-all whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'mobile'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>Móviles (Android / iPhone)</span>
          </button>

          <button
            onClick={() => setActiveTab('obd')}
            className={`px-3 py-2 text-xs font-semibold border-b-2 transition-all whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'obd'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Car className="w-4 h-4" />
            <span>Localizadores Vehiculares (SinoTrack/Concox)</span>
          </button>

          <button
            onClick={() => setActiveTab('teltonika')}
            className={`px-3 py-2 text-xs font-semibold border-b-2 transition-all whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'teltonika'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radio className="w-4 h-4" />
            <span>Teltonika (FMB920 / FMC130)</span>
          </button>

          <button
            onClick={() => setActiveTab('debian')}
            className={`px-3 py-2 text-xs font-semibold border-b-2 transition-all whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'debian'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="w-4 h-4" />
            <span>Debian Linux & Raspberry Pi</span>
          </button>

          <button
            onClick={() => setActiveTab('esp32')}
            className={`px-3 py-2 text-xs font-semibold border-b-2 transition-all whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'esp32'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span>ESP32 / Arduino IoT</span>
          </button>

          <button
            onClick={() => setActiveTab('api')}
            className={`px-3 py-2 text-xs font-semibold border-b-2 transition-all whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'api'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Globe className="w-4 h-4" />
            <span>API REST / Webhooks</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* TAB 1: SMARTPHONES (ANDROID & IPHONE) */}
          {activeTab === 'mobile' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>Conectar Teléfono Móvil con App Gratuita (Traccar Client o OsmAnd)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Usa cualquier smartphone Android o iOS como rastreador GPS profesional en tiempo real.
                </p>
              </div>

              {/* Identifier input */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <label className="text-xs font-bold text-slate-200 block">
                  1. Elige un Identificador para tu Teléfono:
                </label>
                <div className="flex items-center gap-2 max-w-md">
                  <input
                    type="text"
                    value={deviceIdInput}
                    onChange={(e) => setDeviceIdInput(e.target.value.replace(/\s+/g, '-'))}
                    className="flex-1 px-3 py-2 text-xs font-mono bg-slate-900 border border-slate-700 rounded-lg text-cyan-300 focus:outline-none focus:border-cyan-500"
                    placeholder="ej: mi-telefono-01"
                  />
                  <span className="text-xs text-slate-400 font-mono">ID de Dispositivo</span>
                </div>
              </div>

              {/* Split: Instructions vs QR Code */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                
                {/* Step by step */}
                <div className="md:col-span-2 space-y-4">
                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                    <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
                      Método Recomendado: Traccar Client (Gratuito)
                    </h4>
                    
                    <ol className="list-decimal pl-5 space-y-2 text-xs text-slate-300">
                      <li>
                        Descarga <strong>Traccar Client</strong> desde 
                        <a href="https://play.google.com/store/apps/details?id=org.traccar.client" target="_blank" rel="noreferrer" className="text-cyan-400 underline ml-1 inline-flex items-center gap-0.5">
                          Google Play <ExternalLink className="w-3 h-3" />
                        </a> o 
                        <a href="https://apps.apple.com/app/traccar-client/id843156976" target="_blank" rel="noreferrer" className="text-cyan-400 underline ml-1 inline-flex items-center gap-0.5">
                          App Store (iOS) <ExternalLink className="w-3 h-3" />
                        </a>.
                      </li>
                      <li>
                        Abre la app, pon tu <strong>Identificador de dispositivo</strong>: <code className="text-cyan-300 bg-slate-900 px-1 py-0.5 rounded font-mono">{deviceIdInput}</code>
                      </li>
                      <li>
                        En <strong>URL del servidor</strong>, pega exactamente esta dirección:
                        <div className="mt-1.5 flex items-center gap-2">
                          <input
                            type="text"
                            readOnly
                            value={osmandUrl}
                            className="flex-1 p-2 text-[11px] font-mono bg-slate-900 border border-slate-700 rounded-lg text-slate-200 select-all"
                          />
                          <button
                            onClick={() => handleCopy(osmandUrl, 'osmandUrl')}
                            className="px-3 py-2 text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-slate-950 rounded-lg transition-colors flex items-center gap-1 shrink-0"
                          >
                            {copiedKey === 'osmandUrl' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            <span>{copiedKey === 'osmandUrl' ? 'Copiado' : 'Copiar URL'}</span>
                          </button>
                        </div>
                      </li>
                      <li>
                        Activa el botón <strong>"Estado del servicio"</strong> en la app.
                      </li>
                      <li className="text-emerald-400 font-semibold">
                        ¡Listo! Tu teléfono empezará a enviar telemetría en tiempo real y aparecerá automáticamente en el mapa.
                      </li>
                    </ol>
                  </div>

                  <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-400 flex items-center justify-between">
                    <span>¿Prefieres <strong>OwnTracks</strong>?</span>
                    <button
                      onClick={() => handleCopy(owntracksUrl, 'otUrl')}
                      className="text-cyan-400 hover:underline flex items-center gap-1 font-mono text-[11px]"
                    >
                      <span>Copiar endpoint OwnTracks HTTP</span>
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* QR Code Container */}
                <div className="p-5 bg-slate-950 border border-slate-800 rounded-xl flex flex-col items-center text-center space-y-3">
                  <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <QrCode className="w-4 h-4 text-cyan-400" />
                    <span>Escanear con tu Móvil</span>
                  </span>

                  <div className="p-2.5 bg-slate-900 border border-slate-700 rounded-xl shadow-lg flex items-center justify-center">
                    {qrSvg ? (
                      <div 
                        className="w-40 h-40 flex items-center justify-center rounded overflow-hidden [&>svg]:w-full [&>svg]:h-full"
                        dangerouslySetInnerHTML={{ __html: qrSvg }}
                      />
                    ) : (
                      <div className="w-40 h-40 flex items-center justify-center text-xs text-slate-500 font-mono">
                        Generando QR...
                      </div>
                    )}
                  </div>

                  <p className="text-[11px] text-slate-400 leading-tight">
                    Escanea este código con la cámara de tu smartphone para copiar la URL del servidor directamente.
                  </p>
                </div>

              </div>
            </div>
          )}

          {/* TAB 2: LOCALIZADORES VEHICULARES (SINOTRACK, CONCOX, TK103) */}
          {activeTab === 'obd' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold text-white">
                  Localizadores GPS para Coche y Moto (SinoTrack, Coban TK103, Concox GT06)
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Configuración mediante comandos SMS enviados al número de la tarjeta SIM del localizador.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* SinoTrack ST-901 / ST-906 */}
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-cyan-400">1. SinoTrack (ST-901, ST-906, ST-905)</h4>
                    <span className="text-[10px] font-mono text-slate-400">SMS a la SIM</span>
                  </div>

                  <div className="space-y-2 text-xs font-mono">
                    <div className="p-2 bg-slate-900 border border-slate-800 rounded flex items-center justify-between">
                      <code>8030000 {serverHost} 5023</code>
                      <button onClick={() => handleCopy(`8030000 ${serverHost} 5023`, 'sms1')} className="text-slate-400 hover:text-white">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="p-2 bg-slate-900 border border-slate-800 rounded flex items-center justify-between">
                      <code>8020000 tu_apn_operador</code>
                      <button onClick={() => handleCopy('8020000 tu_apn_operador', 'sms2')} className="text-slate-400 hover:text-white">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="p-2 bg-slate-900 border border-slate-800 rounded flex items-center justify-between">
                      <code>8050000 10</code>
                      <button onClick={() => handleCopy('8050000 10', 'sms3')} className="text-slate-400 hover:text-white">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Envía estos 3 SMS desde tu móvil al número del tracker. Responderá con <code>SET OK</code>.
                  </p>
                </div>

                {/* Concox GT06 & Coban TK103 */}
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-emerald-400">2. Concox GT06 & Coban TK103</h4>
                    <span className="text-[10px] font-mono text-slate-400">SMS a la SIM</span>
                  </div>

                  <div className="space-y-2 text-xs font-mono">
                    <div className="p-2 bg-slate-900 border border-slate-800 rounded flex items-center justify-between">
                      <code>SERVER,1,{serverHost},5023,0#</code>
                      <button onClick={() => handleCopy(`SERVER,1,${serverHost},5023,0#`, 'sms4')} className="text-slate-400 hover:text-white">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="p-2 bg-slate-900 border border-slate-800 rounded flex items-center justify-between">
                      <code>APN,internet.operador.com#</code>
                      <button onClick={() => handleCopy('APN,internet.operador.com#', 'sms5')} className="text-slate-400 hover:text-white">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="p-2 bg-slate-900 border border-slate-800 rounded flex items-center justify-between">
                      <code>TIMER,10#</code>
                      <button onClick={() => handleCopy('TIMER,10#', 'sms6')} className="text-slate-400 hover:text-white">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Acepta tramas binarias TCP directamente en el puerto <code>:5023</code> del servidor.
                  </p>
                </div>

              </div>
            </div>
          )}

          {/* TAB 3: TELTONIKA TELEMATICS */}
          {activeTab === 'teltonika' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold text-white">
                  Teltonika Telematics Profesional (FMB920, FMC130, FMB120, etc.)
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Configuración mediante el software oficial Teltonika Configurator o por SMS.
                </p>
              </div>

              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-4">
                <h4 className="text-xs font-bold text-cyan-400">Parámetros de Red GPRS en Teltonika Configurator:</h4>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Server Domain / IP</span>
                    <span className="font-mono font-bold text-slate-200">{serverHost}</span>
                  </div>
                  <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Server Port</span>
                    <span className="font-mono font-bold text-cyan-400">5023</span>
                  </div>
                  <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Protocolo</span>
                    <span className="font-mono font-bold text-emerald-400">TCP</span>
                  </div>
                  <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Codec de Datos</span>
                    <span className="font-mono font-bold text-amber-400">Codec 8 (AVL)</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-xs text-slate-300 font-semibold block">
                    O por SMS directo al Teltonika:
                  </span>
                  <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-lg font-mono text-xs text-cyan-300 flex items-center justify-between">
                    <code>setparam 2004:{serverHost};2005:5023;2006:0</code>
                    <button onClick={() => handleCopy(`setparam 2004:${serverHost};2005:5023;2006:0`, 'tt1')} className="text-slate-400 hover:text-white">
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: DEBIAN LINUX & RASPBERRY PI */}
          {activeTab === 'debian' && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>Debian GNU/Linux, Raspberry Pi & Mini-PC con GNSS Hat</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 border border-emerald-700 text-emerald-400">
                      AUTO-CONTENIDO BASE64
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Instalación autónoma en 1 paso inmune a proxys de autenticación HTML (evita el error <code>&lt;!doctype html&gt;</code> de <code>curl</code>).
                  </p>
                </div>

                <button
                  onClick={() =>
                    downloadScriptFile(
                      'install-aegis-gps.sh',
                      generateDebianInstallScript(serverOrigin)
                    )
                  }
                  className="px-3.5 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs rounded-xl transition-all flex items-center gap-2 shrink-0 shadow-md"
                >
                  <Download className="w-4 h-4" />
                  <span>Descargar install-aegis-gps.sh</span>
                </button>
              </div>

              {/* Method 1: Base64 Autonomous One-Liner */}
              <div className="p-4 bg-slate-950 border border-emerald-800/60 rounded-xl space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Opción 1 (Recomendada): Comando en 1 Línea Autónomo (Base64)</span>
                  </span>
                  <button
                    onClick={() =>
                      handleCopy(generateDebianBase64OneLiner(serverOrigin), 'deb-b64')
                    }
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors shrink-0"
                  >
                    {copiedKey === 'deb-b64' ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>¡Comando Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copiar Comando 1-Paso</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg font-mono text-[11px] text-cyan-300 overflow-x-auto max-h-28 select-all break-all">
                  <code>{generateDebianBase64OneLiner(serverOrigin)}</code>
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Al estar codificado íntegramente en <strong>Base64</strong>, este comando decodifica el script directamente en tu terminal Debian con <code>base64 -d | sudo bash</code> sin depender de descargas externas que puedan devolver páginas HTML (<code>&lt;!doctype html&gt;</code>).
                </p>
              </div>

              {/* Method 2: Direct file execution */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2.5">
                <span className="text-xs font-bold text-slate-200 block">
                  Opción 2: Si descargaste el archivo <code>install-aegis-gps.sh</code> desde el botón superior:
                </span>
                <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-lg font-mono text-xs text-slate-200 flex items-center justify-between">
                  <code>sudo bash ~/Descargas/install-aegis-gps.sh || sudo bash ~/Downloads/install-aegis-gps.sh</code>
                  <button
                    onClick={() =>
                      handleCopy(
                        'sudo bash ~/Descargas/install-aegis-gps.sh || sudo bash ~/Downloads/install-aegis-gps.sh',
                        'deb-dl'
                      )
                    }
                    className="p-1.5 rounded bg-slate-800 text-slate-300 hover:text-white shrink-0 ml-2"
                  >
                    {copiedKey === 'deb-dl' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Full script preview */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300">
                    Contenido íntegro del instalador Bash (crea <code>/opt/aegis-gps/aegis_client.py</code> y servicio Systemd):
                  </span>
                  <button
                    onClick={() =>
                      handleCopy(generateDebianInstallScript(serverOrigin), 'deb-raw')
                    }
                    className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-semibold"
                  >
                    {copiedKey === 'deb-raw' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === 'deb-raw' ? 'Script Copiado' : 'Copiar Script Puro'}</span>
                  </button>
                </div>
                <pre className="p-3 bg-slate-900 border border-slate-800 rounded-lg font-mono text-[11px] text-slate-300 overflow-x-auto max-h-48 leading-relaxed">
                  {generateDebianInstallScript(serverOrigin)}
                </pre>
              </div>
            </div>
          )}

          {/* TAB 5: ESP32 & ARDUINO */}
          {activeTab === 'esp32' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold text-white">
                  Microcontroladores IoT (ESP32 / Arduino / Quectel LTE-M)
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Código C++ para transmitir telemetría con antena GPS NEO-6M / NEO-8M y módulo WiFi/LTE.
                </p>
              </div>

              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200">Sketch C++ para ESP32 (Arduino IDE / PlatformIO):</span>
                  <button
                    onClick={() => handleCopy(`// AegisGPS ESP32 Client
#include <WiFi.h>
#include <HTTPClient.h>

const char* serverUrl = "${restPushUrl}";

void sendGps(float lat, float lon, float speed, int heading, int battery) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");

    String json = "{\\"deviceId\\":\\"esp32-gps-01\\",\\"latitude\\":" + String(lat, 6) + 
                  ",\\"longitude\\":" + String(lon, 6) + 
                  ",\\"speed\\":" + String(speed, 1) + 
                  ",\\"heading\\":" + String(heading) + 
                  ",\\"battery\\":" + String(battery) + "}";

    int httpResponseCode = http.POST(json);
    http.end();
  }
}`, 'espCode')}
                    className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 font-semibold"
                  >
                    {copiedKey === 'espCode' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === 'espCode' ? 'Copiado' : 'Copiar Sketch'}</span>
                  </button>
                </div>

                <pre className="p-3 bg-slate-900 border border-slate-800 rounded-lg font-mono text-[11px] text-slate-300 overflow-x-auto max-h-56 leading-relaxed">
{`// AegisGPS ESP32 Client
#include <WiFi.h>
#include <HTTPClient.h>

const char* serverUrl = "${restPushUrl}";

void sendGps(float lat, float lon, float speed, int heading, int battery) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");

    String json = "{\\"deviceId\\":\\"esp32-gps-01\\",\\"latitude\\":" + String(lat, 6) + 
                  ",\\"longitude\\":" + String(lon, 6) + 
                  ",\\"speed\\":" + String(speed, 1) + 
                  ",\\"heading\\":" + String(heading) + 
                  ",\\"battery\\":" + String(battery) + "}";

    int httpResponseCode = http.POST(json);
    http.end();
  }
}`}
                </pre>
              </div>
            </div>
          )}

          {/* TAB 6: API REST & CURL */}
          {activeTab === 'api' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold text-white">
                  API REST & Webhooks para Integración Personalizada
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Envía tramas desde cualquier lenguaje (Python, Node.js, cURL, Bash, C#).
                </p>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-cyan-400">Endpoint 1: JSON Directo (REST Push)</span>
                    <button
                      onClick={() => handleCopy(`curl -X POST ${restPushUrl} \\
  -H "Content-Type: application/json" \\
  -d '{"deviceId":"test-custom","latitude":40.4168,"longitude":-3.7038,"speed":45.0,"heading":180,"battery":95}'`, 'c1')}
                      className="text-xs text-slate-400 hover:text-white flex items-center gap-1 font-mono"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copiar cURL</span>
                    </button>
                  </div>
                  <pre className="p-3 bg-slate-900 rounded font-mono text-[11px] text-cyan-300 overflow-x-auto">
{`curl -X POST ${restPushUrl} \\
  -H "Content-Type: application/json" \\
  -d '{"deviceId":"test-custom","latitude":40.4168,"longitude":-3.7038,"speed":45.0,"heading":180,"battery":95}'`}
                  </pre>
                </div>

                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-400">Endpoint 2: Con Cifrado AES-256-GCM Militar</span>
                    <button
                      onClick={() => handleCopy(`curl -X POST ${aesEncryptedUrl} \\
  -H "Content-Type: application/json" \\
  -d '{"deviceId":"dev-mercedes-7741","ciphertext":"...","iv":"...","authTag":"...","algorithm":"AES-256-GCM"}'`, 'c2')}
                      className="text-xs text-slate-400 hover:text-white flex items-center gap-1 font-mono"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copiar cURL</span>
                    </button>
                  </div>
                  <pre className="p-3 bg-slate-900 rounded font-mono text-[11px] text-emerald-300 overflow-x-auto">
{`curl -X POST ${aesEncryptedUrl} \\
  -H "Content-Type: application/json" \\
  -d '{"deviceId":"dev-mercedes-7741","ciphertext":"...","iv":"...","authTag":"...","algorithm":"AES-256-GCM"}'`}
                  </pre>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Modal Bottom Status Bar */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Servidor escuchando en: <strong className="font-mono text-slate-200">HTTPS (443)</strong> y <strong className="font-mono text-slate-200">TCP (5023)</strong></span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-lg transition-colors"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );
};
