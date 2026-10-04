import React, { useState } from 'react';
import {
  Terminal,
  Copy,
  Check,
  X,
  Play,
  Server,
  Radio,
  Cpu,
  ShieldCheck,
  Search,
  Wrench,
  Compass,
  Zap,
  Download,
  Activity
} from 'lucide-react';
import {
  generateDebianBase64OneLiner,
  generateDebianInstallScript,
  downloadScriptFile,
} from '../utils/debianScripts';

interface CommandCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  tcpPort: number;
  onOpenTab?: (tab: 'map' | 'crypto' | 'geofences' | 'debian' | 'simulation') => void;
  onToggleRealGps?: () => void;
  realGpsActive?: boolean;
  onToggleSimulation?: () => void;
  simulationRunning?: boolean;
}

interface CommandItem {
  id: string;
  category: 'debian' | 'hardware' | 'api' | 'app';
  title: string;
  description: string;
  command: string;
  note?: string;
  liveAction?: () => Promise<string>;
}

export const CommandCenterModal: React.FC<CommandCenterModalProps> = ({
  isOpen,
  onClose,
  tcpPort,
  onOpenTab,
  onToggleRealGps,
  realGpsActive,
  onToggleSimulation,
  simulationRunning,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'debian' | 'hardware' | 'api' | 'app'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [executionOutput, setExecutionOutput] = useState<{ id: string; result: string; ok: boolean } | null>(null);

  if (!isOpen) return null;

  const serverOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const serverHost = typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1';
  const base64Installer = generateDebianBase64OneLiner(serverOrigin);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRunLive = async (item: CommandItem) => {
    if (!item.liveAction) return;
    setRunningId(item.id);
    try {
      const resText = await item.liveAction();
      setExecutionOutput({ id: item.id, result: resText, ok: true });
    } catch (err: unknown) {
      setExecutionOutput({
        id: item.id,
        result: err instanceof Error ? err.message : 'Error al ejecutar comando',
        ok: false,
      });
    } finally {
      setRunningId(null);
    }
  };

  const commands: CommandItem[] = [
    // 1. DEBIAN / KALI LINUX SERVICE COMMANDS
    {
      id: 'cmd-install-b64',
      category: 'debian',
      title: 'Instalar AegisGPS en Debian / Kali Linux / Ubuntu (1 Paso Base64)',
      description: 'Instala el cliente Python AES-256-GCM y el servicio systemd sin usar descargas curl externas (evita el error <!doctype html>).',
      command: base64Installer,
      note: 'Pega este comando directamente en tu terminal de Kali o Debian.',
    },
    {
      id: 'cmd-status',
      category: 'debian',
      title: 'Ver estado del servicio AegisGPS en Linux',
      description: 'Comprueba si el daemon systemd está activo (active/running) y muestra los últimos eventos.',
      command: 'sudo systemctl status aegis-gps.service --no-pager -l',
    },
    {
      id: 'cmd-logs',
      category: 'debian',
      title: 'Ver tramas GPS y logs cifrados AES-256 en tiempo real',
      description: 'Muestra en vivo cada coordenada leída y cifrada por tu máquina Debian/Kali.',
      command: 'sudo journalctl -u aegis-gps.service -f -n 30',
    },
    {
      id: 'cmd-bridge-test',
      category: 'debian',
      title: 'Consultar puente local del daemon Debian (Puerto 8765)',
      description: 'Verifica en tu terminal que el servicio local está generando paquetes cifrados AES-256-GCM.',
      command: 'curl -s http://127.0.0.1:8765/telemetry | python3 -m json.tool',
      liveAction: async () => {
        const res = await fetch('http://127.0.0.1:8765/telemetry');
        const data = await res.json();
        await fetch('/api/gps/encrypted-aes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deviceId: data.deviceId || 'dev-debian-patrol-04',
            algorithm: data.algorithm || 'AES-256-GCM',
            transport: 'HTTPS',
            iv: data.iv,
            ciphertext: data.ciphertext,
            authTag: data.authTag,
          }),
        });
        return JSON.stringify(data, null, 2);
      },
    },
    {
      id: 'cmd-restart-stop',
      category: 'debian',
      title: 'Reiniciar, Detener o Iniciar el servicio AegisGPS',
      description: 'Controla el ciclo de vida del servicio en segundo plano en tu sistema Linux.',
      command: 'sudo systemctl restart aegis-gps.service   # o stop / start',
    },
    {
      id: 'cmd-manual-run',
      category: 'debian',
      title: 'Ejecutar el cliente Python manualmente en primer plano (Modo Debug)',
      description: 'Detiene temporalmente el servicio y ejecuta el script en tu consola para depuración directa.',
      command: 'sudo systemctl stop aegis-gps.service && sudo python3 /opt/aegis-gps/aegis_client.py',
    },
    {
      id: 'cmd-uninstall',
      category: 'debian',
      title: 'Desinstalar por completo AegisGPS de Debian / Kali',
      description: 'Detiene el daemon, elimina los archivos de /opt/aegis-gps y limpia la unidad systemd.',
      command: 'sudo systemctl disable --now aegis-gps.service && sudo rm -rf /opt/aegis-gps /etc/systemd/system/aegis-gps.service && sudo systemctl daemon-reload',
    },

    // 2. HARDWARE GPS & KALI REPO FIX COMMANDS
    {
      id: 'cmd-fix-kali-docker',
      category: 'hardware',
      title: 'Reparar error APT «download.docker.com kali-rolling Release» en Kali Linux',
      description: 'Corrige automáticamente el repositorio de Docker en Kali Linux reemplazando kali-rolling por bookworm.',
      command: "sudo sed -i 's|kali-rolling|bookworm|g' /etc/apt/sources.list /etc/apt/sources.list.d/*.list /etc/apt/sources.list.d/*.sources 2>/dev/null && sudo apt-get update",
    },
    {
      id: 'cmd-usb-gps-detect',
      category: 'hardware',
      title: 'Detectar antenas GPS USB / UART conectadas (/dev/ttyUSB0, /dev/ttyACM0)',
      description: 'Lista los puertos serie activos y filtra mensajes del kernel para receptores u-blox, GlobalSat o Quectel.',
      command: 'ls -l /dev/ttyUSB* /dev/ttyACM* /dev/serial* 2>/dev/null || sudo dmesg | grep -iE "tty|gps|usb|pl2303|ch341|cp210x" | tail -n 20',
    },
    {
      id: 'cmd-gpsd-start',
      category: 'hardware',
      title: 'Vincular antena GPS USB al demonio gpsd',
      description: 'Inicia gpsd leyendo tramas NMEA desde /dev/ttyUSB0 en el puerto local 2947.',
      command: 'sudo systemctl stop gpsd.socket gpsd.service && sudo gpsd -N -n /dev/ttyUSB0',
    },
    {
      id: 'cmd-cgps-monitor',
      category: 'hardware',
      title: 'Monitorizar satélites y precisión DOP en terminal (cgps / gpspipe)',
      description: 'Abre el panel interactivo de gpsd en consola o vuelca 10 sentencias NMEA crudas.',
      command: 'cgps -s   # o bien: gpspipe -r -n 10',
    },

    // 3. API & TELEMETRY INJECTION COMMANDS
    {
      id: 'cmd-api-push',
      category: 'api',
      title: 'Enviar posición GPS en vivo mediante API REST JSON (POST /api/gps/push)',
      description: 'Registra o actualiza instantáneamente un dispositivo en el mapa enviando latitud, longitud, velocidad y batería.',
      command: `curl -X POST "${serverOrigin}/api/gps/push" -H "Content-Type: application/json" -d '{"deviceId":"kali-tactical-01","latitude":40.4185,"longitude":-3.7025,"speed":62.5,"heading":135,"battery":96}'`,
      liveAction: async () => {
        const res = await fetch('/api/gps/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deviceId: 'kali-tactical-01',
            latitude: 40.4185 + (Math.random() - 0.5) * 0.008,
            longitude: -3.7025 + (Math.random() - 0.5) * 0.008,
            speed: 62.5,
            heading: 135,
            battery: 96,
          }),
        });
        return JSON.stringify(await res.json(), null, 2);
      },
    },
    {
      id: 'cmd-api-osmand',
      category: 'api',
      title: 'Enviar posición con protocolo Traccar / OsmAnd (GET / POST)',
      description: 'Compatible con la app móvil Traccar Client y scripts ligeros mediante parámetros URL.',
      command: `curl -s "${serverOrigin}/api/gps/osmand?id=movil-tactico-02&lat=40.4220&lon=-3.6990&speed=45&bearing=90&batt=89"`,
      liveAction: async () => {
        const lat = (40.422 + (Math.random() - 0.5) * 0.006).toFixed(6);
        const lon = (-3.699 + (Math.random() - 0.5) * 0.006).toFixed(6);
        const res = await fetch(
          `/api/gps/osmand?id=movil-tactico-02&lat=${lat}&lon=${lon}&speed=45&bearing=90&batt=89`
        );
        return JSON.stringify(await res.json(), null, 2);
      },
    },
    {
      id: 'cmd-api-nmea',
      category: 'api',
      title: 'Inyectar sentencia satelital NMEA 0183 ($GPRMC)',
      description: 'Envía una trama estándar NMEA 0183 para ser decodificada por el servidor telemático.',
      command: `curl -X POST "${serverOrigin}/api/gps/raw-stream" -H "Content-Type: application/json" -d '{"deviceId":"dev-debian-alpha-01","format":"nmea","data":"$GPRMC,123519,A,4025.008,N,00342.228,W,025.0,084.4,041026,003.1,W*6A"}'`,
      liveAction: async () => {
        const res = await fetch('/api/gps/raw-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deviceId: 'dev-debian-alpha-01',
            format: 'nmea',
            data: '$GPRMC,123519,A,4025.008,N,00342.228,W,025.0,084.4,041026,003.1,W*6A',
          }),
        });
        return JSON.stringify(await res.json(), null, 2);
      },
    },
    {
      id: 'cmd-api-tcp-nc',
      category: 'api',
      title: `Enviar trama GPS por Socket TCP directo (Netcat Puerto ${tcpPort})`,
      description: 'Conecta por socket TCP crudo usando netcat (nc) desde una terminal en la misma red o servidor.',
      command: `echo '$GPRMC,123519,A,4025.008,N,00342.228,W,025.0,084.4,041026,003.1,W*6A' | nc -w 2 ${serverHost} ${tcpPort}`,
    },
    {
      id: 'cmd-api-devices',
      category: 'api',
      title: 'Listar todos los dispositivos GPS y claves AES activas (GET /api/devices)',
      description: 'Devuelve el inventario completo de unidades, estado de ignición, batería y última coordenada.',
      command: `curl -s "${serverOrigin}/api/devices" | python3 -m json.tool`,
      liveAction: async () => {
        const res = await fetch('/api/devices');
        const list = await res.json();
        return JSON.stringify(
          list.map((d: { id: string; name: string; status: string; lastPosition?: { latitude: number; longitude: number } }) => ({
            id: d.id,
            name: d.name,
            status: d.status,
            lat: d.lastPosition?.latitude,
            lng: d.lastPosition?.longitude,
          })),
          null,
          2
        );
      },
    },

    // 4. APPLICATION LOCAL PANEL & KALI CLI COMMANDS (WORK FROM /home/koko)
    {
      id: 'cmd-app-open-web',
      category: 'app',
      title: 'Abrir Consola Web Local con Mapa en tu navegador de Kali Linux (:8765)',
      description: 'El servicio instalado en /opt/aegis-gps incluye su propio servidor web ligero en el puerto 8765 (no requiere npm ni package.json).',
      command: 'xdg-open http://127.0.0.1:8765 2>/dev/null || firefox http://127.0.0.1:8765 &',
      note: 'También puedes escribir simplemente http://127.0.0.1:8765 en la barra de direcciones del navegador de Kali.',
    },
    {
      id: 'cmd-app-global-cli',
      category: 'app',
      title: 'Usar el comando global aegis-gps desde cualquier carpeta (~ /home/koko)',
      description: 'Tras ejecutar el instalador Base64, dispones del comando global aegis-gps en /usr/local/bin.',
      command: 'aegis-gps status   # Opciones: aegis-gps status | aegis-gps logs | aegis-gps web | aegis-gps restart',
    },
    {
      id: 'cmd-app-direct-python',
      category: 'app',
      title: 'Lanzar el servidor local AegisGPS directamente desde /home/koko (Sin npm)',
      description: 'Ejecuta el daemon Python instalado en /opt/aegis-gps/aegis_client.py directamente sin necesitar package.json.',
      command: 'sudo systemctl restart aegis-gps.service && curl -s http://127.0.0.1:8765/telemetry | python3 -m json.tool',
    },
  ];

  const filteredCommands = commands.filter((cmd) => {
    const matchesCat = selectedCategory === 'all' || cmd.category === selectedCategory;
    const matchesSearch =
      cmd.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cmd.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cmd.command.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-5xl h-[90vh] bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/95">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-white flex items-center gap-2">
                <span>Centro de Comandos, CLI & Guía de Uso de AegisGPS</span>
              </h2>
              <p className="text-xs text-slate-400">
                Todos los comandos para Kali Linux / Debian, antenas GPS USB, inyección API cURL y controles rápidos de la plataforma
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                downloadScriptFile(
                  'install-aegis-gps.sh',
                  generateDebianInstallScript(serverOrigin)
                )
              }
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Descargar install-aegis-gps.sh</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Interactive Quick App Controls Bar */}
        <div className="px-6 py-3 bg-slate-950/80 border-b border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <button
            onClick={() => {
              if (onToggleRealGps) onToggleRealGps();
            }}
            className={`p-2.5 rounded-xl border text-left transition-all flex items-center gap-2.5 ${
              realGpsActive
                ? 'bg-emerald-950/80 border-emerald-600 text-emerald-300'
                : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-200'
            }`}
          >
            <Compass className="w-4 h-4 text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-bold truncate">
                {realGpsActive ? 'GPS Real: ACTIVO' : 'Activar Mi GPS Real'}
              </div>
              <div className="text-[10px] text-slate-400 truncate">
                Geolocalización local AES-256
              </div>
            </div>
          </button>

          <button
            onClick={() => {
              if (onToggleSimulation) onToggleSimulation();
            }}
            className="p-2.5 rounded-xl border bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-200 text-left transition-all flex items-center gap-2.5"
          >
            <Activity className="w-4 h-4 text-cyan-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-bold truncate">
                {simulationRunning ? 'Pausar Flota Demo' : 'Reanudar Flota Demo'}
              </div>
              <div className="text-[10px] text-slate-400 truncate">
                {simulationRunning ? 'Dejar solo tus GPS reales' : 'Activar movimiento demo'}
              </div>
            </div>
          </button>

          <button
            onClick={() => {
              if (onOpenTab) onOpenTab('crypto');
            }}
            className="p-2.5 rounded-xl border bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-200 text-left transition-all flex items-center gap-2.5"
          >
            <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-bold truncate">Inspector AES-256</div>
              <div className="text-[10px] text-slate-400 truncate">
                Auditar IV, MAC y sabotaje
              </div>
            </div>
          </button>

          <button
            onClick={() => {
              if (onOpenTab) onOpenTab('simulation');
            }}
            className="p-2.5 rounded-xl border bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-200 text-left transition-all flex items-center gap-2.5"
          >
            <Zap className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-bold truncate">Inyector Manual</div>
              <div className="text-[10px] text-slate-400 truncate">
                Enviar coordenadas de prueba
              </div>
            </div>
          </button>
        </div>

        {/* Filter & Search Bar */}
        <div className="px-6 py-3 border-b border-slate-800 bg-slate-900/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                selectedCategory === 'all'
                  ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              Todos ({commands.length})
            </button>
            <button
              onClick={() => setSelectedCategory('debian')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                selectedCategory === 'debian'
                  ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Server className="w-3.5 h-3.5" />
              <span>Servicio Debian / Kali</span>
            </button>
            <button
              onClick={() => setSelectedCategory('hardware')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                selectedCategory === 'hardware'
                  ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>Antenas USB & Reparación APT</span>
            </button>
            <button
              onClick={() => setSelectedCategory('api')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                selectedCategory === 'api'
                  ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>API cURL & Envío en Vivo</span>
            </button>
            <button
              onClick={() => setSelectedCategory('app')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                selectedCategory === 'app'
                  ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>Consola Local Kali (:8765)</span>
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar comando (ej. systemctl, curl, kali)..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        {/* Command List Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {filteredCommands.map((item) => (
            <div
              key={item.id}
              className="p-4 bg-slate-950 border border-slate-800/90 rounded-xl space-y-2.5 hover:border-slate-700 transition-colors"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-bold text-white">{item.title}</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">{item.description}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {item.liveAction && (
                    <button
                      onClick={() => handleRunLive(item)}
                      disabled={runningId === item.id}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors"
                      title="Ejecutar este comando ahora mismo y ver su efecto en el mapa"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>{runningId === item.id ? 'Ejecutando...' : 'Probar en Vivo'}</span>
                    </button>
                  )}

                  <button
                    onClick={() => handleCopy(item.command, item.id)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center gap-1.5 transition-colors border border-slate-700"
                  >
                    {copiedId === item.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copiar</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg font-mono text-[11px] text-cyan-300 overflow-x-auto max-h-24 select-all break-all">
                <code>{item.command}</code>
              </div>

              {item.note && (
                <p className="text-[11px] text-emerald-400/90 font-medium">{item.note}</p>
              )}

              {executionOutput && executionOutput.id === item.id && (
                <div className="mt-2 p-3 bg-slate-900/90 border border-emerald-800/60 rounded-lg space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-emerald-400">
                    <span>Respuesta en vivo del servidor:</span>
                    <button
                      onClick={() => setExecutionOutput(null)}
                      className="text-slate-400 hover:text-white"
                    >
                      Cerrar
                    </button>
                  </div>
                  <pre className="font-mono text-[11px] text-slate-200 overflow-x-auto max-h-40">
                    {executionOutput.result}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>

      </div>
    </div>
  );
};
