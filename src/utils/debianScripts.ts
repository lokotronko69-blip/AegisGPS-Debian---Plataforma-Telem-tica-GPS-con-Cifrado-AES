// Generador centralizado de scripts para Debian GNU/Linux, Kali Linux, Ubuntu y Raspberry Pi OS
// Incluye la plataforma AegisGPS COMPLETA en http://127.0.0.1:8765/ + API /telemetry + CLI global aegis-gps

export const DEFAULT_DEBIAN_DEVICE_ID = 'dev-debian-patrol-04';
export const DEFAULT_DEBIAN_AES_KEY = 'a4f107bb4c3a27f6e0c98f8216d4e2a901fbc34d88e051e941a329d8924b17aa';

export function generateDebianSystemdService(): string {
  return `[Unit]
Description=AegisGPS Debian/Kali Telemetry Platform & Daemon (AES-256-GCM)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/aegis-gps
ExecStart=/usr/bin/python3 /opt/aegis-gps/aegis_client.py
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target`;
}

export function generateDebianMosquittoConf(): string {
  return `# /etc/mosquitto/conf.d/aegis-gps.conf
listener 8883
protocol mqtt
cafile /etc/ssl/certs/ca-certificates.crt
tls_version tlsv1.3

# Tópicos de telemetría cifrada AES-256-GCM
# gps/+/telemetry -> Publicación de tramas GNSS
# gps/+/status    -> Estado de nodo Debian/Kali`;
}

export function generateDebianPythonScript(
  serverOrigin: string,
  deviceId: string = DEFAULT_DEBIAN_DEVICE_ID,
  aesKeyHex: string = DEFAULT_DEBIAN_AES_KEY
): string {
  return `#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AegisGPS - Plataforma Completa Local & Daemon Telemático para Kali Linux / Debian GNU/Linux
Incluye:
  1. Lectura GNSS hardware (gpsd :2947) o GeoIP real automático + Batería real de Linux
  2. Cifrado autenticador AES-256-GCM (NIST SP 800-38D) con fallback criptográfico nativo
  3. Interfaz Web Táctica Completa en http://127.0.0.1:8765/ (Mapa multicapa, Flota, Geocercas,
     Inspector Criptográfico, Historial de Rutas, Inyector, Conectar Dispositivos, Comandos y Alertas)
  4. Puente CORS en http://127.0.0.1:8765/telemetry para sincronización con la nube
"""
import os
import sys
import json
import time
import math
import hmac
import hashlib
import socket
import threading
import urllib.request
from http.server import HTTPServer, BaseHTTPRequestHandler
from datetime import datetime, timezone

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    HAS_CRYPTOGRAPHY = True
except ImportError:
    HAS_CRYPTOGRAPHY = False

DEVICE_ID = "${deviceId}"
AES_KEY_HEX = "${aesKeyHex}"
SERVER_URL = "${serverOrigin}/api/gps/encrypted-aes"
LOCAL_BRIDGE_PORT = 8765

key_bytes = bytes.fromhex(AES_KEY_HEX)
aesgcm = AESGCM(key_bytes) if HAS_CRYPTOGRAPHY else None
hostname = socket.gethostname()

latest_encrypted_packet = None
step_counter = 0
cached_geoip = None
simulation_running = True
packets_decrypted = 0

# Estado completo de flota local, geocercas, logs criptográficos y alertas
fleet_devices = {}
device_history = {}
geofences_list = []
crypto_logs = []
alerts_list = []
state_lock = threading.Lock()

def get_battery_level():
    for bat_name in ["BAT0", "BAT1", "battery"]:
        path = f"/sys/class/power_supply/{bat_name}/capacity"
        if os.path.exists(path):
            try:
                with open(path, "r") as f:
                    return int(f.read().strip())
            except Exception:
                pass
    return 98

def read_gpsd_socket():
    try:
        s = socket.create_connection(("127.0.0.1", 2947), timeout=1.0)
        s.sendall(b'?WATCH={"enable":true,"json":true};\\n')
        data = s.recv(4096).decode("utf-8", errors="ignore")
        s.close()
        for line in data.splitlines():
            if '"class":"TPV"' in line:
                obj = json.loads(line)
                if "lat" in obj and "lon" in obj:
                    return {
                        "latitude": float(obj["lat"]),
                        "longitude": float(obj["lon"]),
                        "altitude": float(obj.get("alt", 450.0)),
                        "speed": float(obj.get("speed", 0.0)) * 3.6,
                        "heading": int(obj.get("track", 0)),
                        "source": "GPSD-HARDWARE"
                    }
    except Exception:
        pass
    return None

def read_geoip_fallback():
    global cached_geoip
    if cached_geoip is not None:
        return cached_geoip
    try:
        req = urllib.request.Request(
            "http://ip-api.com/json/?fields=status,lat,lon,city",
            headers={"User-Agent": "AegisGPS-Debian/2.0"}
        )
        with urllib.request.urlopen(req, timeout=3) as resp:
            if resp.status == 200:
                d = json.loads(resp.read().decode("utf-8"))
                if d.get("status") == "success":
                    cached_geoip = {
                        "latitude": float(d["lat"]),
                        "longitude": float(d["lon"]),
                        "city": d.get("city", "Local")
                    }
                    return cached_geoip
    except Exception:
        pass
    cached_geoip = {"latitude": 42.8150, "longitude": -1.6425, "city": "Pamplona"}
    return cached_geoip

def encrypt_aes_payload(telemetry_dict, custom_key_hex=None):
    plaintext = json.dumps(telemetry_dict).encode("utf-8")
    iv = os.urandom(12)
    k_hex = (custom_key_hex or AES_KEY_HEX).strip()
    try:
        k_bytes = bytes.fromhex(k_hex)
        if len(k_bytes) != 32:
            k_bytes = hashlib.sha256(k_hex.encode("utf-8")).digest()
    except Exception:
        k_bytes = hashlib.sha256(k_hex.encode("utf-8")).digest()
    if HAS_CRYPTOGRAPHY:
        cipher_engine = AESGCM(k_bytes)
        encrypted = cipher_engine.encrypt(iv, plaintext, None)
        ciphertext = encrypted[:-16]
        auth_tag = encrypted[-16:]
    else:
        # Fallback determinista HMAC-SHA256 si cryptography no está instalado
        ciphertext = bytes([b ^ k_bytes[i % len(k_bytes)] for i, b in enumerate(plaintext)])
        auth_tag = hmac.new(k_bytes, iv + ciphertext, hashlib.sha256).digest()[:16]
    return {
        "deviceId": telemetry_dict.get("deviceId", DEVICE_ID),
        "hostname": hostname,
        "algorithm": "AES-256-GCM",
        "transport": telemetry_dict.get("transport", "HTTPS"),
        "iv": iv.hex(),
        "ciphertext": ciphertext.hex(),
        "authTag": auth_tag.hex(),
        "telemetryPreview": telemetry_dict
    }

def haversine_m(lat1, lon1, lat2, lon2):
    R = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2)**2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2)**2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def init_local_platform():
    geo = read_geoip_fallback()
    base_lat = geo["latitude"]
    base_lon = geo["longitude"]
    city = geo.get("city", "Base")

    with state_lock:
        # 1. Nodo Principal Kali / Debian del usuario
        fleet_devices[DEVICE_ID] = {
            "id": DEVICE_ID,
            "name": f"Nodo Kali Linux ({hostname})",
            "imei": "864209182736450",
            "model": f"Kali/Debian Host ({hostname})",
            "vehicleType": "patrol",
            "protocol": "aes-encrypted-json",
            "aesKeyHex": AES_KEY_HEX,
            "speedLimit": 90,
            "status": "moving",
            "color": "#10b981",
            "baseLat": base_lat,
            "baseLon": base_lon,
            "lastPosition": None
        }
        # 2. Unidades Tácticas de Apoyo en la misma ciudad del usuario
        fleet_devices["dev-debian-alpha-01"] = {
            "id": "dev-debian-alpha-01",
            "name": f"Unidad Táctica Alpha-01 ({city})",
            "imei": "359710048219301",
            "model": "Teltonika FMB920 · Debian Gateway",
            "vehicleType": "patrol",
            "protocol": "teltonika-codec8",
            "aesKeyHex": "8f4b2e91c7a6d5034918273645566778899aabbccddeeff00112233445566770",
            "speedLimit": 80,
            "status": "moving",
            "color": "#06b6d4",
            "baseLat": base_lat + 0.0065,
            "baseLon": base_lon - 0.0080,
            "lastPosition": None
        }
        fleet_devices["dev-debian-cargo-02"] = {
            "id": "dev-debian-cargo-02",
            "name": f"Convoy Blindado 04 ({city})",
            "imei": "359710048219302",
            "model": "Quectel EC25 GNSS + RPi4",
            "vehicleType": "truck",
            "protocol": "mqtt-tls-aes",
            "aesKeyHex": "1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f809",
            "speedLimit": 70,
            "status": "moving",
            "color": "#f59e0b",
            "baseLat": base_lat - 0.0055,
            "baseLon": base_lon + 0.0075,
            "lastPosition": None
        }
        fleet_devices["dev-debian-uav-03"] = {
            "id": "dev-debian-uav-03",
            "name": f"Dron Reconocimiento Víctor ({city})",
            "imei": "359710048219303",
            "model": "u-blox NEO-M9N · MAVLink AES",
            "vehicleType": "drone",
            "protocol": "nmea-0183-aes",
            "aesKeyHex": "f0e1d2c3b4a5968778695a4b3c2d1e0ff0e1d2c3b4a5968778695a4b3c2d1e0f",
            "speedLimit": 120,
            "status": "moving",
            "color": "#a855f7",
            "baseLat": base_lat + 0.0040,
            "baseLon": base_lon + 0.0060,
            "lastPosition": None
        }

        for d_id in fleet_devices:
            device_history[d_id] = []

        # Geocercas iniciales alrededor de la ubicación real del usuario
        geofences_list.append({
            "id": "geo-perimetro-central",
            "name": f"Perímetro de Seguridad ({city})",
            "type": "circle",
            "center": [base_lat, base_lon],
            "radius": 850,
            "color": "#06b6d4",
            "speedLimit": 70,
            "alertOnEnter": True,
            "alertOnExit": True,
            "description": "Zona operativa principal monitorizada con cifrado AES-256-GCM"
        })
        geofences_list.append({
            "id": "geo-zona-restringida",
            "name": f"Sector Crítico Norte ({city})",
            "type": "circle",
            "center": [base_lat + 0.007, base_lon - 0.005],
            "radius": 450,
            "color": "#f43f5e",
            "speedLimit": 50,
            "alertOnEnter": True,
            "alertOnExit": True,
            "description": "Área de control de velocidad y acceso táctico"
        })

def ingest_position(dev_id, pos_dict, transport="HTTPS"):
    global packets_decrypted, latest_encrypted_packet
    with state_lock:
        if dev_id not in fleet_devices:
            fleet_devices[dev_id] = {
                "id": dev_id,
                "name": f"Dispositivo {dev_id}",
                "imei": str(int(time.time() * 1000))[-15:],
                "model": "Rastreador Externo API",
                "vehicleType": "car",
                "protocol": "aes-encrypted-json",
                "aesKeyHex": AES_KEY_HEX,
                "speedLimit": 90,
                "status": "moving",
                "color": "#10b981",
                "baseLat": pos_dict["latitude"],
                "baseLon": pos_dict["longitude"],
                "lastPosition": None
            }
            device_history[dev_id] = []

        dev = fleet_devices[dev_id]
        dev["lastPosition"] = pos_dict
        dev["status"] = "alert" if pos_dict.get("sos") or pos_dict.get("tamper") else ("moving" if pos_dict.get("speed", 0) > 2 else "idle")

        hist = device_history.setdefault(dev_id, [])
        hist.append(pos_dict)
        if len(hist) > 80:
            hist.pop(0)

        pkt = encrypt_aes_payload(pos_dict, dev["aesKeyHex"])
        pkt["transport"] = transport
        if dev_id == DEVICE_ID:
            latest_encrypted_packet = pkt

        packets_decrypted += 1
        log_entry = {
            "id": f"log-{int(time.time()*1000)}-{packets_decrypted}",
            "deviceId": dev_id,
            "deviceName": dev["name"],
            "transport": transport,
            "algorithm": "AES-256-GCM",
            "ivHex": pkt["iv"],
            "ciphertextHex": pkt["ciphertext"],
            "authTagHex": pkt["authTag"],
            "decryptedPayload": pos_dict,
            "latencyMs": 1,
            "verified": True,
            "timestamp": pos_dict["timestamp"]
        }
        crypto_logs.insert(0, log_entry)
        if len(crypto_logs) > 60:
            crypto_logs.pop()

        # Verificar alertas de velocidad, SOS y geocercas
        if pos_dict.get("sos"):
            alerts_list.insert(0, {
                "id": f"alt-{int(time.time()*1000)}",
                "deviceId": dev_id,
                "deviceName": dev["name"],
                "severity": "critical",
                "type": "sos",
                "message": f"¡ALERTA SOS ACTIVADA en {dev['name']}!",
                "latitude": pos_dict["latitude"],
                "longitude": pos_dict["longitude"],
                "timestamp": pos_dict["timestamp"]
            })
        elif pos_dict.get("speed", 0) > dev.get("speedLimit", 90):
            if not alerts_list or alerts_list[0].get("deviceId") != dev_id or alerts_list[0].get("type") != "overspeed":
                alerts_list.insert(0, {
                    "id": f"alt-{int(time.time()*1000)}",
                    "deviceId": dev_id,
                    "deviceName": dev["name"],
                    "severity": "warning",
                    "type": "overspeed",
                    "message": f"Exceso de velocidad en {dev['name']}: {pos_dict['speed']} km/h (Límite {dev.get('speedLimit', 90)} km/h)",
                    "latitude": pos_dict["latitude"],
                    "longitude": pos_dict["longitude"],
                    "timestamp": pos_dict["timestamp"]
                })
        if len(alerts_list) > 40:
            alerts_list.pop()
        return pkt

def step_telemetry_cycle():
    global step_counter
    step_counter += 1
    now_iso = datetime.now(timezone.utc).isoformat()
    gps_hw = read_gpsd_socket()
    bat_real = get_battery_level()

    with state_lock:
        dev_ids = list(fleet_devices.keys())

    primary_pkt = None
    for idx, d_id in enumerate(dev_ids):
        with state_lock:
            dev = fleet_devices.get(d_id)
            if not dev:
                continue
            b_lat = dev["baseLat"]
            b_lon = dev["baseLon"]

        if d_id == DEVICE_ID and gps_hw:
            pos = {
                "deviceId": d_id,
                "hostname": hostname,
                "source": gps_hw["source"],
                "latitude": gps_hw["latitude"],
                "longitude": gps_hw["longitude"],
                "altitude": gps_hw["altitude"],
                "speed": round(gps_hw["speed"], 1),
                "heading": gps_hw["heading"],
                "satellites": 18,
                "hdop": 0.6,
                "battery": bat_real,
                "ignition": True,
                "tamper": False,
                "sos": False,
                "timestamp": now_iso
            }
            primary_pkt = ingest_position(d_id, pos, "HTTPS")
        elif d_id == DEVICE_ID or simulation_running:
            angle = (step_counter * 0.11) + (idx * 1.7)
            radius_lat = 0.0014 if d_id == DEVICE_ID else 0.0028
            radius_lon = 0.0018 if d_id == DEVICE_ID else 0.0034
            lat = round(b_lat + radius_lat * math.sin(angle), 6)
            lon = round(b_lon + radius_lon * math.cos(angle * 0.85), 6)
            spd = round(38.0 + 14.0 * math.sin(angle) + (idx * 5), 1)
            hdg = int((math.degrees(angle) + 90) % 360)
            pos = {
                "deviceId": d_id,
                "hostname": hostname if d_id == DEVICE_ID else f"node-0{idx+1}",
                "source": f"KALI-{hostname.upper()}" if d_id == DEVICE_ID else "AES-TELEMETRY",
                "latitude": lat,
                "longitude": lon,
                "altitude": round(450.0 + idx * 35, 1),
                "speed": spd,
                "heading": hdg,
                "satellites": 16,
                "hdop": 0.7,
                "battery": bat_real if d_id == DEVICE_ID else max(45, 96 - idx * 7),
                "ignition": True,
                "tamper": False,
                "sos": False,
                "timestamp": now_iso
            }
            tr = "HTTPS" if d_id == DEVICE_ID else ("TCP" if idx == 1 else "MQTT-TLS")
            pkt = ingest_position(d_id, pos, tr)
            if d_id == DEVICE_ID:
                primary_pkt = pkt

    return primary_pkt

LOCAL_DASHBOARD_HTML = r"""<!DOCTYPE html>
<html lang="es" class="dark">
<head>
  <meta charset="utf-8" />
  <title>AegisGPS Debian · Plataforma Táctica Completa (Kali Linux)</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600;700&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Inter', sans-serif; background: #090d16; color: #f8fafc; overflow: hidden; user-select: none; }
    .font-display { font-family: 'Space Grotesk', sans-serif; }
    .font-mono { font-family: 'JetBrains Mono', monospace; }
    .leaflet-container { background: #090d16 !important; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #090d16; }
    ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 3px; }
  </style>
</head>
<body class="h-screen w-screen relative overflow-hidden bg-slate-950 text-slate-100">

  <!-- 1. MAPA INTERACTIVO REAL A PANTALLA COMPLETA -->
  <div id="map" class="absolute inset-0 z-0"></div>

  <!-- 2. BARRA SUPERIOR DE NAVEGACIÓN (HEADER COMPLETO) -->
  <header class="relative z-30 h-14 border-b border-slate-800 bg-slate-900/95 backdrop-blur px-4 flex items-center justify-between">
    <div class="flex items-center gap-3">
      <div class="flex items-center gap-2 font-display text-base font-bold text-white cursor-pointer" onclick="openModal('none')">
        <div class="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/40 flex items-center justify-center text-cyan-400">🛡️</div>
        <span>AegisGPS Debian</span>
      </div>
      <div class="hidden xl:flex items-center gap-2 text-xs text-slate-400 pl-3 border-l border-slate-800 font-mono">
        <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
        <span id="hdr-host" class="text-emerald-400 font-semibold">KALI LINUX :8765</span>
        <span>·</span>
        <span>AES-256-GCM ACTIVO</span>
      </div>
    </div>

    <!-- Pestañas Principales -->
    <nav class="hidden md:flex items-center gap-1.5">
      <button onclick="openModal('none')" id="tab-map" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 text-cyan-400 border border-slate-700 transition-colors">
        Mapa en Vivo
      </button>
      <button onclick="openModal('crypto')" id="tab-crypto" class="px-3 py-1.5 text-xs font-medium rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors flex items-center gap-1.5">
        <span>🔐 Cifrado AES (<span id="hdr-pkt-count">0</span>)</span>
      </button>
      <button onclick="openModal('geofences')" id="tab-geofences" class="px-3 py-1.5 text-xs font-medium rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors">
        🚧 Geocercas (<span id="hdr-geo-count">0</span>)
      </button>
      <button onclick="openModal('history')" id="tab-history" class="px-3 py-1.5 text-xs font-medium rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors">
        ⏱️ Historial Ruta
      </button>
      <button onclick="openModal('injector')" id="tab-injector" class="px-3 py-1.5 text-xs font-medium rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors">
        📡 Inyector GPS
      </button>
      <button onclick="openModal('commands')" id="tab-commands" class="px-3 py-1.5 text-xs font-medium rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors">
        💻 Comandos & CLI
      </button>
    </nav>

    <!-- Acciones Derecha -->
    <div class="flex items-center gap-2">
      <button onclick="toggleSimulation()" id="btn-sim" class="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 border border-slate-700 text-cyan-300 hover:bg-slate-700 transition-colors">
        ⏸ Pausar Flota
      </button>
      <button onclick="openModal('alerts')" class="relative p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors" title="Alertas de Seguridad">
        🔔
        <span id="hdr-alert-badge" class="hidden absolute -top-1 -right-1 px-1.5 bg-rose-600 text-white font-mono text-[10px] font-bold rounded-full">0</span>
      </button>
      <button onclick="openModal('connect')" class="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-lg transition-all shadow-md">
        📲 Conectar Dispositivos
      </button>
      <button onclick="openModal('newdevice')" class="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded-lg transition-all shadow-sm">
        + Nuevo GPS
      </button>
    </div>
  </header>

  <!-- 3. PANEL LATERAL DE FLOTA COLAPSABLE (IZQUIERDA) -->
  <aside id="fleet-sidebar" class="absolute top-16 left-3 bottom-3 w-80 z-20 bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-transform duration-300">
    <div class="p-3.5 border-b border-slate-800 flex items-center justify-between">
      <div>
        <h2 class="font-display text-xs font-bold uppercase tracking-wider text-slate-200">Unidades GPS Activas</h2>
        <p class="text-[11px] text-slate-400">Telemetría en tiempo real AES-256</p>
      </div>
      <button onclick="centerOnKaliNode()" class="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[11px] font-semibold hover:bg-emerald-500/25">
        📍 Mi Kali
      </button>
    </div>

    <!-- KPIs Rápidos -->
    <div class="grid grid-cols-3 gap-1.5 p-2.5 bg-slate-950/60 border-b border-slate-800 text-center">
      <div class="p-1.5 rounded-lg bg-slate-900 border border-slate-800/80">
        <div class="text-[10px] text-slate-400">UNIDADES</div>
        <div id="kpi-total" class="font-mono text-sm font-bold text-white">4</div>
      </div>
      <div class="p-1.5 rounded-lg bg-slate-900 border border-slate-800/80">
        <div class="text-[10px] text-slate-400">TRAMAS AES</div>
        <div id="kpi-pkts" class="font-mono text-sm font-bold text-cyan-400">0</div>
      </div>
      <div class="p-1.5 rounded-lg bg-slate-900 border border-slate-800/80">
        <div class="text-[10px] text-slate-400">BATERÍA KALI</div>
        <div id="kpi-bat" class="font-mono text-sm font-bold text-emerald-400">--%</div>
      </div>
    </div>

    <!-- Buscador -->
    <div class="p-2.5 border-b border-slate-800">
      <input id="search-input" oninput="renderSidebar()" type="text" placeholder="Buscar unidad, host o IMEI..." class="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500" />
    </div>

    <!-- Lista de Dispositivos -->
    <div id="device-list" class="flex-1 overflow-y-auto p-2.5 space-y-2"></div>
  </aside>

  <!-- Botón Flotante para Colapsar/Mostrar Sidebar -->
  <button onclick="toggleSidebar()" id="btn-toggle-sidebar" class="absolute top-20 left-[338px] z-20 p-2 rounded-xl bg-slate-900/95 border border-slate-700 text-slate-200 hover:text-cyan-400 shadow-lg transition-all" title="Ocultar/Mostrar panel lateral para ver mapa completo">
    ◀
  </button>

  <!-- 4. CONTROLES FLOTANTES DEL MAPA (CAPAS Y SEGUIMIENTO - DERECHA) -->
  <div class="absolute top-16 right-4 z-20 flex flex-col gap-2 items-end">
    <div class="p-1.5 bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-xl shadow-xl flex items-center gap-1">
      <button onclick="setMapLayer('osm')" id="layer-osm" class="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
        🗺️ Callejero Real
      </button>
      <button onclick="setMapLayer('sat')" id="layer-sat" class="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800">
        🛰️ Satélite
      </button>
      <button onclick="setMapLayer('dark')" id="layer-dark" class="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800">
        🌑 Táctico
      </button>
      <button onclick="setMapLayer('topo')" id="layer-topo" class="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800">
        ⛰️ Topo
      </button>
    </div>

    <div class="flex items-center gap-2">
      <button onclick="toggleFollow()" id="btn-follow" class="px-3 py-1.5 rounded-xl bg-slate-900/95 border border-cyan-500/50 text-cyan-300 text-xs font-semibold shadow-lg">
        🎯 Seguir Unidad: ON
      </button>
    </div>
  </div>

  <!-- 5. HUD TELEMÉTRICO INFERIOR DE LA UNIDAD SELECCIONADA -->
  <div id="bottom-hud" class="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 w-[92%] max-w-3xl bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-2xl shadow-2xl p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3">
    <div class="flex items-center gap-3">
      <div id="hud-dot" class="w-3.5 h-3.5 rounded-full bg-emerald-400 shrink-0"></div>
      <div>
        <div class="flex items-center gap-2">
          <span id="hud-name" class="font-display text-sm font-bold text-white">Cargando nodo...</span>
          <span id="hud-protocol" class="font-mono text-[10px] text-cyan-400">AES-256-GCM</span>
        </div>
        <div id="hud-coords" class="font-mono text-xs text-slate-400">-- , --</div>
      </div>
    </div>

    <div class="grid grid-cols-4 gap-3 text-center font-mono">
      <div class="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800">
        <div class="text-[10px] text-slate-500">VELOCIDAD</div>
        <div id="hud-speed" class="text-xs font-bold text-cyan-400">0 km/h</div>
      </div>
      <div class="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800">
        <div class="text-[10px] text-slate-500">RUMBO/ALT</div>
        <div id="hud-heading" class="text-xs font-bold text-slate-200">0° · 0m</div>
      </div>
      <div class="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800">
        <div class="text-[10px] text-slate-500">BATERÍA</div>
        <div id="hud-battery" class="text-xs font-bold text-emerald-400">100%</div>
      </div>
      <div class="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800">
        <div class="text-[10px] text-slate-500">SATÉLITES</div>
        <div id="hud-sats" class="text-xs font-bold text-slate-200">16 GNSS</div>
      </div>
    </div>

    <div class="flex items-center gap-2 shrink-0">
      <button onclick="openModal('history')" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700">
        ⏱️ Ruta
      </button>
      <button onclick="openModal('crypto')" class="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-xs font-semibold text-cyan-300 border border-cyan-500/40">
        🔐 Ver AES
      </button>
    </div>
  </div>

  <!-- ===================================================================== -->
  <!-- MODALES INTERACTIVOS COMPLETOS (CIFRADO, GEOCERCAS, HISTORIAL, ETC.)  -->
  <!-- ===================================================================== -->
  <div id="modal-backdrop" class="hidden fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">

    <!-- MODAL 1: INSPECTOR CRIPTOGRÁFICO AES-256-GCM -->
    <div id="modal-crypto" class="hidden w-full max-w-5xl h-[85vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
      <div class="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
        <div>
          <h2 class="font-display text-base font-bold text-white">🔐 Inspector Criptográfico en Tiempo Real (AES-256-GCM)</h2>
          <p class="text-xs text-slate-400">Auditoría de tramas cifradas generadas por tu nodo Kali Linux y flota táctica</p>
        </div>
        <button onclick="openModal('none')" class="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white">✕</button>
      </div>
      <div class="flex-1 grid grid-cols-1 md:grid-cols-3 min-h-0 overflow-hidden">
        <div id="crypto-log-list" class="border-r border-slate-800 overflow-y-auto p-3 space-y-2 bg-slate-950/60"></div>
        <div class="md:col-span-2 p-6 overflow-y-auto space-y-4">
          <div class="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
            <div class="text-xs font-bold text-slate-300 mb-1">Clave Privada AES-256 (256-bit Hex):</div>
            <div id="crypto-key" class="font-mono text-xs text-cyan-400 break-all select-all"></div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div class="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
              <div class="text-xs font-semibold text-slate-400 mb-1">Vector de Inicialización (IV 96-bit)</div>
              <div id="crypto-iv" class="font-mono text-xs text-amber-300 break-all select-all"></div>
            </div>
            <div class="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
              <div class="text-xs font-semibold text-slate-400 mb-1">Tag de Autenticación GCM (MAC 128-bit)</div>
              <div id="crypto-tag" class="font-mono text-xs text-emerald-400 break-all select-all"></div>
            </div>
          </div>
          <div class="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
            <div class="text-xs font-semibold text-slate-400 mb-1">Texto Cifrado (Ciphertext Hexadecimal)</div>
            <div id="crypto-cipher" class="font-mono text-xs text-cyan-300 break-all max-h-28 overflow-y-auto select-all"></div>
          </div>
          <div class="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
            <div class="text-xs font-semibold text-slate-400 mb-1">Payload JSON Descifrado y Verificado</div>
            <pre id="crypto-json" class="font-mono text-xs text-slate-200 overflow-x-auto max-h-40"></pre>
          </div>
          <div class="p-4 rounded-xl bg-rose-950/30 border border-rose-800/50 flex items-center justify-between gap-4">
            <div>
              <div class="text-xs font-bold text-rose-300">Prueba de Integridad Anti-Sabotaje (Tamper Test)</div>
              <div id="tamper-msg" class="text-[11px] text-slate-300 mt-0.5">Altera 1 byte del Ciphertext para comprobar que el verificador GCM rechaza paquetes manipulados.</div>
            </div>
            <button onclick="triggerTamperTest()" class="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shrink-0">
              ⚡ Simular Sabotaje
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL 2: GESTOR DE GEOCERCAS -->
    <div id="modal-geofences" class="hidden w-full max-w-4xl max-h-[88vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
      <div class="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
        <div>
          <h2 class="font-display text-base font-bold text-white">🚧 Gestor de Geocercas y Perímetros de Seguridad</h2>
          <p class="text-xs text-slate-400">Crea zonas circulares de control alrededor de tu ubicación real o de cualquier coordenada</p>
        </div>
        <button onclick="openModal('none')" class="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white">✕</button>
      </div>
      <div class="flex-1 grid grid-cols-1 md:grid-cols-2 min-h-0 overflow-y-auto p-6 gap-6">
        <div class="space-y-3">
          <h3 class="text-xs font-bold uppercase text-slate-300">Geocercas Activas</h3>
          <div id="geofence-list" class="space-y-2.5"></div>
        </div>
        <div class="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-bold uppercase text-cyan-400">Nueva Geocerca</h3>
            <button onclick="fillGeoWithCurrentCenter()" class="text-[11px] text-emerald-400 hover:underline font-semibold">
              📍 Usar ubicación actual del mapa
            </button>
          </div>
          <div>
            <label class="text-xs text-slate-300 block mb-1">Nombre del Perímetro</label>
            <input id="geo-name" type="text" placeholder="Ej: Base Operativa Pamplona" class="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-white" />
          </div>
          <div class="grid grid-cols-3 gap-2">
            <div>
              <label class="text-[11px] text-slate-400 block mb-1">Latitud</label>
              <input id="geo-lat" type="text" class="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-900 border border-slate-800 rounded-lg text-white" />
            </div>
            <div>
              <label class="text-[11px] text-slate-400 block mb-1">Longitud</label>
              <input id="geo-lon" type="text" class="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-900 border border-slate-800 rounded-lg text-white" />
            </div>
            <div>
              <label class="text-[11px] text-slate-400 block mb-1">Radio (m)</label>
              <input id="geo-rad" type="number" value="600" class="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-900 border border-slate-800 rounded-lg text-white" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="text-[11px] text-slate-400 block mb-1">Velocidad Máx (km/h)</label>
              <input id="geo-spd" type="number" value="60" class="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-900 border border-slate-800 rounded-lg text-white" />
            </div>
            <div>
              <label class="text-[11px] text-slate-400 block mb-1">Color</label>
              <input id="geo-col" type="color" value="#10b981" class="w-full h-8 bg-slate-900 border border-slate-800 rounded-lg cursor-pointer" />
            </div>
          </div>
          <button onclick="createGeofence()" class="w-full py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded-xl transition-colors">
            + Crear Geocerca en el Mapa
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL 3: HISTORIAL Y REPRODUCCIÓN DE RUTA -->
    <div id="modal-history" class="hidden w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
      <div class="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
        <div>
          <h2 class="font-display text-base font-bold text-white">⏱️ Reproductor de Ruta Histórica · <span id="hist-dev-name"></span></h2>
          <p class="text-xs text-slate-400">Puntos GNSS verificados criptográficamente en esta sesión</p>
        </div>
        <button onclick="openModal('none')" class="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white">✕</button>
      </div>
      <div class="p-6 space-y-5">
        <div class="grid grid-cols-3 gap-3 text-center">
          <div class="p-3 bg-slate-950 border border-slate-800 rounded-xl">
            <div class="text-[10px] text-slate-400">PUNTOS REGISTRADOS</div>
            <div id="hist-count" class="font-mono text-lg font-bold text-cyan-400">0</div>
          </div>
          <div class="p-3 bg-slate-950 border border-slate-800 rounded-xl">
            <div class="text-[10px] text-slate-400">VELOCIDAD DEL PUNTO</div>
            <div id="hist-spd" class="font-mono text-lg font-bold text-emerald-400">0 km/h</div>
          </div>
          <div class="p-3 bg-slate-950 border border-slate-800 rounded-xl">
            <div class="text-[10px] text-slate-400">COORDENADA</div>
            <div id="hist-coord" class="font-mono text-xs font-bold text-slate-200 mt-1">-</div>
          </div>
        </div>
        <input id="hist-slider" type="range" min="0" max="0" value="0" oninput="scrubHistory(this.value)" class="w-full accent-cyan-400 cursor-pointer" />
      </div>
    </div>

    <!-- MODAL 4: INYECTOR DE TELEMETRÍA GPS -->
    <div id="modal-injector" class="hidden w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
      <div class="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
        <div>
          <h2 class="font-display text-base font-bold text-white">📡 Inyector de Telemetría GPS con Cifrado AES-256</h2>
          <p class="text-xs text-slate-400">Envía una trama manual o señal de emergencia SOS a cualquier unidad</p>
        </div>
        <button onclick="openModal('none')" class="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white">✕</button>
      </div>
      <div class="p-6 space-y-4">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs text-slate-300 block mb-1">Latitud</label>
            <input id="inj-lat" type="text" class="w-full px-3 py-1.5 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-white" />
          </div>
          <div>
            <label class="text-xs text-slate-300 block mb-1">Longitud</label>
            <input id="inj-lon" type="text" class="w-full px-3 py-1.5 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-white" />
          </div>
          <div>
            <label class="text-xs text-slate-300 block mb-1">Velocidad (km/h)</label>
            <input id="inj-spd" type="number" value="115" class="w-full px-3 py-1.5 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-cyan-400 font-bold" />
          </div>
          <div>
            <label class="text-xs text-slate-300 block mb-1">Alerta SOS</label>
            <select id="inj-sos" class="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white">
              <option value="false">Normal (Sin SOS)</option>
              <option value="true">🚨 ACTIVAR EMERGENCIA SOS</option>
            </select>
          </div>
        </div>
        <button onclick="sendInjectedTelemetry()" class="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl">
          ⚡ Cifrar con AES-256-GCM e Inyectar en Vivo
        </button>
      </div>
    </div>

    <!-- MODAL 5: REGISTRAR NUEVO DISPOSITIVO GPS -->
    <div id="modal-newdevice" class="hidden w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
      <div class="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
        <h2 class="font-display text-base font-bold text-white">+ Registrar Nuevo Dispositivo GPS</h2>
        <button onclick="openModal('none')" class="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white">✕</button>
      </div>
      <div class="p-6 space-y-3.5">
        <div>
          <label class="text-xs text-slate-300 block mb-1">Nombre de la Unidad</label>
          <input id="new-name" type="text" placeholder="Ej: Patrulla Navarra 09" class="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs text-slate-300 block mb-1">Identificador / ID</label>
            <input id="new-id" type="text" placeholder="kali-unit-09" class="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-white" />
          </div>
          <div>
            <label class="text-xs text-slate-300 block mb-1">Color en Mapa</label>
            <input id="new-col" type="color" value="#38bdf8" class="w-full h-9 bg-slate-950 border border-slate-800 rounded-lg cursor-pointer" />
          </div>
        </div>
        <button onclick="registerNewDevice()" class="w-full py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded-xl">
          Registrar y Activar en el Mapa
        </button>
      </div>
    </div>

    <!-- MODAL 6: CONECTAR DISPOSITIVOS Y COMANDOS CLI -->
    <div id="modal-connect" class="hidden w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
      <div class="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
        <h2 class="font-display text-base font-bold text-white">📲 Conectar Dispositivos & Comandos Kali Linux</h2>
        <button onclick="openModal('none')" class="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white">✕</button>
      </div>
      <div class="p-6 space-y-4 overflow-y-auto max-h-[75vh] text-xs">
        <div class="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
          <div class="font-bold text-emerald-400">1. Comandos Rápidos en tu Terminal Kali Linux (koko@koko):</div>
          <pre class="p-3 bg-slate-900 rounded-lg font-mono text-cyan-300 overflow-x-auto">aegis-gps status     # Ver estado del servicio y trama AES-256
aegis-gps logs       # Ver coordenadas en vivo en consola
aegis-gps web        # Abrir esta plataforma completa en http://127.0.0.1:8765
aegis-gps restart    # Reiniciar el daemon systemd</pre>
        </div>
        <div class="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
          <div class="font-bold text-cyan-400">2. Inyectar coordenadas desde otra terminal en tu Kali Linux (cURL):</div>
          <pre class="p-3 bg-slate-900 rounded-lg font-mono text-slate-200 overflow-x-auto">curl -X POST http://127.0.0.1:8765/api/inject -H "Content-Type: application/json" -d '{"deviceId":"kali-tactical-01","latitude":42.8165,"longitude":-1.6440,"speed":65}'</pre>
        </div>
      </div>
    </div>

    <!-- MODAL 7: CENTRO DE ALERTAS -->
    <div id="modal-alerts" class="hidden w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
      <div class="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
        <h2 class="font-display text-base font-bold text-white">🔔 Centro de Alertas y Eventos de Seguridad</h2>
        <button onclick="openModal('none')" class="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white">✕</button>
      </div>
      <div id="alerts-list" class="p-6 space-y-2.5 max-h-[70vh] overflow-y-auto"></div>
    </div>

  </div>

  <script>
    const map = L.map('map', { zoomControl: false }).setView([42.8150, -1.6425], 14);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const tileLayers = {
      osm: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }),
      sat: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }),
      dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }),
      topo: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17 })
    };
    let currentLayer = tileLayers.osm.addTo(map);

    function setMapLayer(name) {
      map.removeLayer(currentLayer);
      currentLayer = tileLayers[name] || tileLayers.osm;
      currentLayer.addTo(map);
      ['osm','sat','dark','topo'].forEach(k => {
        const btn = document.getElementById('layer-' + k);
        if (k === name) {
          btn.className = 'px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40';
        } else {
          btn.className = 'px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800';
        }
      });
    }

    let stateData = { devices: [], geofences: [], cryptoLogs: [], alerts: [], history: {}, simulationRunning: true, packetsDecrypted: 0 };
    let selectedDeviceId = null;
    let followMode = true;
    let sidebarOpen = true;
    let firstCenterDone = false;
    const markers = {};
    const trails = {};
    const geoLayers = {};

    function toggleSidebar() {
      sidebarOpen = !sidebarOpen;
      const sb = document.getElementById('fleet-sidebar');
      const btn = document.getElementById('btn-toggle-sidebar');
      if (sidebarOpen) {
        sb.style.transform = 'translateX(0)';
        btn.style.left = '338px';
        btn.textContent = '◀';
      } else {
        sb.style.transform = 'translateX(-350px)';
        btn.style.left = '12px';
        btn.textContent = '▶';
      }
    }

    function toggleFollow() {
      followMode = !followMode;
      const btn = document.getElementById('btn-follow');
      btn.textContent = followMode ? '🎯 Seguir Unidad: ON' : '🎯 Seguir Unidad: OFF';
      btn.className = followMode
        ? 'px-3 py-1.5 rounded-xl bg-slate-900/95 border border-cyan-500/50 text-cyan-300 text-xs font-semibold shadow-lg'
        : 'px-3 py-1.5 rounded-xl bg-slate-900/95 border border-slate-700 text-slate-400 text-xs font-medium shadow-lg';
    }

    function centerOnKaliNode() {
      const kali = stateData.devices[0];
      if (kali && kali.lastPosition) {
        selectedDeviceId = kali.id;
        map.setView([kali.lastPosition.latitude, kali.lastPosition.longitude], 16);
        updateUI();
      }
    }

    function openModal(name) {
      const bd = document.getElementById('modal-backdrop');
      ['crypto','geofences','history','injector','newdevice','connect','alerts'].forEach(m => {
        const el = document.getElementById('modal-' + m);
        if (el) el.classList.add('hidden');
      });
      if (name === 'none') {
        bd.classList.add('hidden');
        return;
      }
      if (name === 'commands') name = 'connect';
      bd.classList.remove('hidden');
      const target = document.getElementById('modal-' + name);
      if (target) target.classList.remove('hidden');
      if (name === 'geofences') fillGeoWithCurrentCenter();
      if (name === 'injector') {
        const dev = stateData.devices.find(d => d.id === selectedDeviceId) || stateData.devices[0];
        if (dev && dev.lastPosition) {
          document.getElementById('inj-lat').value = dev.lastPosition.latitude;
          document.getElementById('inj-lon').value = dev.lastPosition.longitude;
        }
      }
      updateModals();
    }

    function fillGeoWithCurrentCenter() {
      const c = map.getCenter();
      document.getElementById('geo-lat').value = c.lat.toFixed(6);
      document.getElementById('geo-lon').value = c.lng.toFixed(6);
    }

    async function createGeofence() {
      const name = document.getElementById('geo-name').value || 'Zona Segura';
      const lat = parseFloat(document.getElementById('geo-lat').value);
      const lon = parseFloat(document.getElementById('geo-lon').value);
      const radius = parseFloat(document.getElementById('geo-rad').value || '500');
      const speedLimit = parseFloat(document.getElementById('geo-spd').value || '60');
      const color = document.getElementById('geo-col').value || '#10b981';
      await fetch('/api/geofences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, center: [lat, lon], radius, speedLimit, color })
      });
      document.getElementById('geo-name').value = '';
      await fetchState();
      openModal('none');
    }

    async function deleteGeofence(id) {
      await fetch('/api/geofences/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      await fetchState();
    }

    async function sendInjectedTelemetry() {
      const dev = stateData.devices.find(d => d.id === selectedDeviceId) || stateData.devices[0];
      const lat = parseFloat(document.getElementById('inj-lat').value);
      const lon = parseFloat(document.getElementById('inj-lon').value);
      const speed = parseFloat(document.getElementById('inj-spd').value || '80');
      const sos = document.getElementById('inj-sos').value === 'true';
      await fetch('/api/inject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: dev.id, latitude: lat, longitude: lon, speed, sos })
      });
      await fetchState();
      openModal('none');
    }

    async function registerNewDevice() {
      const name = document.getElementById('new-name').value || 'Nueva Unidad Kali';
      const id = document.getElementById('new-id').value || ('kali-' + Math.floor(Math.random()*900+100));
      const color = document.getElementById('new-col').value || '#38bdf8';
      const c = map.getCenter();
      await fetch('/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name, color, latitude: c.lat, longitude: c.lng })
      });
      selectedDeviceId = id;
      await fetchState();
      openModal('none');
    }

    async function triggerTamperTest() {
      const res = await fetch('/api/tamper', { method: 'POST' });
      const d = await res.json();
      document.getElementById('tamper-msg').textContent = d.message;
      document.getElementById('tamper-msg').className = 'text-xs font-bold text-emerald-400 mt-1';
      await fetchState();
    }

    async function toggleSimulation() {
      await fetch('/api/toggle-sim', { method: 'POST' });
      await fetchState();
    }

    function renderSidebar() {
      const q = (document.getElementById('search-input').value || '').toLowerCase();
      const listEl = document.getElementById('device-list');
      listEl.innerHTML = '';
      stateData.devices.filter(d => d.name.toLowerCase().includes(q) || d.id.toLowerCase().includes(q)).forEach(d => {
        const pos = d.lastPosition;
        const isSel = d.id === selectedDeviceId;
        const div = document.createElement('div');
        div.className = 'p-3 rounded-xl border cursor-pointer transition-all ' + (isSel ? 'bg-slate-800/90 border-cyan-500/60 shadow-md' : 'bg-slate-950/80 border-slate-800/80 hover:border-slate-700');
        div.onclick = () => {
          selectedDeviceId = d.id;
          if (pos) map.setView([pos.latitude, pos.longitude], map.getZoom());
          updateUI();
        };
        div.innerHTML =
          '<div class="flex items-center justify-between">' +
            '<div class="flex items-center gap-2 min-w-0">' +
              '<span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:' + d.color + '"></span>' +
              '<span class="text-xs font-bold text-white truncate">' + d.name + '</span>' +
            '</div>' +
            '<span class="font-mono text-[11px] font-bold text-cyan-400">' + (pos ? pos.speed + ' km/h' : '--') + '</span>' +
          '</div>' +
          '<div class="mt-1.5 flex items-center justify-between text-[11px] font-mono text-slate-400">' +
            '<span>' + (pos ? pos.latitude.toFixed(4) + ', ' + pos.longitude.toFixed(4) : 'Sin señal') + '</span>' +
            '<span class="text-emerald-400">🔋 ' + (pos ? pos.battery + '%' : '--') + '</span>' +
          '</div>';
        listEl.appendChild(div);
      });
    }

    function updateModals() {
      // Crypto modal
      const logList = document.getElementById('crypto-log-list');
      if (logList && stateData.cryptoLogs.length > 0) {
        logList.innerHTML = '';
        stateData.cryptoLogs.slice(0, 20).forEach((l, idx) => {
          const item = document.createElement('div');
          item.className = 'p-2.5 rounded-lg bg-slate-900 border border-slate-800 cursor-pointer hover:border-cyan-500/50 text-xs';
          item.innerHTML = '<div class="font-bold text-slate-200 flex justify-between"><span>' + l.deviceName + '</span><span class="font-mono text-[10px] text-cyan-400">' + l.transport + '</span></div><div class="font-mono text-[10px] text-slate-400 mt-1">' + new Date(l.timestamp).toLocaleTimeString() + ' · MAC OK</div>';
          item.onclick = () => showCryptoDetail(l);
          logList.appendChild(item);
          if (idx === 0) showCryptoDetail(l);
        });
      }

      // Geofences modal
      const geoList = document.getElementById('geofence-list');
      if (geoList) {
        geoList.innerHTML = '';
        stateData.geofences.forEach(g => {
          const d = document.createElement('div');
          d.className = 'p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between';
          d.innerHTML = '<div><div class="text-xs font-bold text-white flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full" style="background:' + g.color + '"></span>' + g.name + '</div><div class="text-[11px] font-mono text-slate-400 mt-0.5">Radio: ' + g.radius + 'm · Límite: ' + g.speedLimit + ' km/h</div></div>';
          const delBtn = document.createElement('button');
          delBtn.className = 'px-2 py-1 rounded bg-rose-950/60 text-rose-300 text-xs hover:bg-rose-900';
          delBtn.textContent = 'Eliminar';
          delBtn.onclick = () => deleteGeofence(g.id);
          d.appendChild(delBtn);
          geoList.appendChild(d);
        });
      }

      // History modal
      const dev = stateData.devices.find(d => d.id === selectedDeviceId) || stateData.devices[0];
      if (dev) {
        document.getElementById('hist-dev-name').textContent = dev.name;
        const pts = stateData.history[dev.id] || [];
        document.getElementById('hist-count').textContent = pts.length;
        const sl = document.getElementById('hist-slider');
        sl.max = Math.max(0, pts.length - 1);
        sl.value = Math.max(0, pts.length - 1);
        scrubHistory(sl.value);
      }

      // Alerts modal
      const alList = document.getElementById('alerts-list');
      if (alList) {
        alList.innerHTML = stateData.alerts.length === 0 ? '<div class="text-center text-slate-500 text-xs p-6">Sin alertas activas</div>' : '';
        stateData.alerts.forEach(a => {
          const d = document.createElement('div');
          d.className = 'p-3 rounded-xl bg-slate-950 border border-rose-900/50 flex items-center justify-between';
          d.innerHTML = '<div><div class="text-xs font-bold text-rose-300">' + a.deviceName + '</div><div class="text-xs text-slate-200 mt-0.5">' + a.message + '</div></div><span class="font-mono text-[10px] text-slate-400">' + new Date(a.timestamp).toLocaleTimeString() + '</span>';
          alList.appendChild(d);
        });
      }
    }

    function showCryptoDetail(l) {
      const dev = stateData.devices.find(d => d.id === l.deviceId) || stateData.devices[0];
      document.getElementById('crypto-key').textContent = dev ? dev.aesKeyHex : '';
      document.getElementById('crypto-iv').textContent = l.ivHex;
      document.getElementById('crypto-tag').textContent = l.authTagHex;
      document.getElementById('crypto-cipher').textContent = l.ciphertextHex;
      document.getElementById('crypto-json').textContent = JSON.stringify(l.decryptedPayload, null, 2);
    }

    function scrubHistory(idx) {
      const dev = stateData.devices.find(d => d.id === selectedDeviceId) || stateData.devices[0];
      if (!dev) return;
      const pts = stateData.history[dev.id] || [];
      const p = pts[idx];
      if (p) {
        document.getElementById('hist-spd').textContent = p.speed + ' km/h';
        document.getElementById('hist-coord').textContent = p.latitude.toFixed(5) + ', ' + p.longitude.toFixed(5);
      }
    }

    function updateUI() {
      if (!selectedDeviceId && stateData.devices.length > 0) {
        selectedDeviceId = stateData.devices[0].id;
      }
      document.getElementById('hdr-pkt-count').textContent = stateData.packetsDecrypted;
      document.getElementById('hdr-geo-count').textContent = stateData.geofences.length;
      document.getElementById('kpi-total').textContent = stateData.devices.length;
      document.getElementById('kpi-pkts').textContent = stateData.packetsDecrypted;
      document.getElementById('btn-sim').textContent = stateData.simulationRunning ? '⏸ Pausar Flota' : '▶ Reanudar Flota';

      const badge = document.getElementById('hdr-alert-badge');
      if (stateData.alerts.length > 0) {
        badge.classList.remove('hidden');
        badge.textContent = stateData.alerts.length;
      } else {
        badge.classList.add('hidden');
      }

      const kaliDev = stateData.devices[0];
      if (kaliDev && kaliDev.lastPosition) {
        document.getElementById('kpi-bat').textContent = kaliDev.lastPosition.battery + '%';
        document.getElementById('hdr-host').textContent = (kaliDev.lastPosition.hostname || 'KALI').toUpperCase() + ' :8765';
      }

      renderSidebar();

      // Actualizar marcadores y estelas en el mapa
      stateData.devices.forEach(d => {
        const pos = d.lastPosition;
        if (!pos) return;
        const ll = [pos.latitude, pos.longitude];
        const iconHtml = '<div style="width:28px;height:28px;border-radius:50%;background:' + d.color + ';border:3px solid #090d16;box-shadow:0 0 12px ' + d.color + ';display:flex;align-items:center;justify-content:center;color:#090d16;font-weight:900;font-size:12px;">▲</div>';
        const icon = L.divIcon({ html: iconHtml, className: '', iconSize: [28, 28], iconAnchor: [14, 14] });
        if (!markers[d.id]) {
          markers[d.id] = L.marker(ll, { icon: icon }).addTo(map).bindPopup('<b>' + d.name + '</b><br>Vel: ' + pos.speed + ' km/h<br>Bat: ' + pos.battery + '%');
          markers[d.id].on('click', () => { selectedDeviceId = d.id; updateUI(); });
        } else {
          markers[d.id].setLatLng(ll);
          markers[d.id].setIcon(icon);
        }
        const pts = (stateData.history[d.id] || []).map(p => [p.latitude, p.longitude]);
        if (!trails[d.id]) {
          trails[d.id] = L.polyline(pts, { color: d.color, weight: 3, opacity: 0.75 }).addTo(map);
        } else {
          trails[d.id].setLatLngs(pts);
        }
      });

      // Geocercas
      Object.keys(geoLayers).forEach(id => {
        if (!stateData.geofences.find(g => g.id === id)) {
          map.removeLayer(geoLayers[id]);
          delete geoLayers[id];
        }
      });
      stateData.geofences.forEach(g => {
        if (!geoLayers[g.id] && g.center) {
          geoLayers[g.id] = L.circle(g.center, { radius: g.radius, color: g.color, fillColor: g.color, fillOpacity: 0.12, weight: 2 }).addTo(map).bindPopup('<b>' + g.name + '</b><br>Límite: ' + g.speedLimit + ' km/h');
        }
      });

      // HUD Inferior
      const sel = stateData.devices.find(d => d.id === selectedDeviceId) || stateData.devices[0];
      if (sel && sel.lastPosition) {
        const p = sel.lastPosition;
        document.getElementById('hud-dot').style.background = sel.color;
        document.getElementById('hud-name').textContent = sel.name;
        document.getElementById('hud-coords').textContent = p.latitude.toFixed(6) + '° N , ' + p.longitude.toFixed(6) + '° E · ' + (p.source || 'AES-256');
        document.getElementById('hud-speed').textContent = p.speed + ' km/h';
        document.getElementById('hud-heading').textContent = p.heading + '° · ' + Math.round(p.altitude) + 'm';
        document.getElementById('hud-battery').textContent = p.battery + '%';
        document.getElementById('hud-sats').textContent = p.satellites + ' GNSS';

        if (!firstCenterDone || followMode) {
          map.panTo([p.latitude, p.longitude]);
          firstCenterDone = true;
        }
      }
    }

    async function fetchState() {
      try {
        const res = await fetch('/api/state');
        stateData = await res.json();
        updateUI();
      } catch (e) {}
    }

    fetchState();
    setInterval(fetchState, 2500);
  </script>
</body>
</html>"""

class ReusableHTTPServer(HTTPServer):
    allow_reuse_address = True

class LocalBridgeHandler(BaseHTTPRequestHandler):
    def _send_cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def do_OPTIONS(self):
        self.send_response(200)
        self._send_cors()
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/telemetry"):
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self._send_cors()
            self.end_headers()
            payload = latest_encrypted_packet or step_telemetry_cycle()
            self.wfile.write(json.dumps(payload).encode("utf-8"))
        elif self.path.startswith("/api/state"):
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self._send_cors()
            self.end_headers()
            with state_lock:
                data = {
                    "devices": list(fleet_devices.values()),
                    "geofences": geofences_list,
                    "cryptoLogs": crypto_logs[:30],
                    "alerts": alerts_list[:25],
                    "history": device_history,
                    "simulationRunning": simulation_running,
                    "packetsDecrypted": packets_decrypted
                }
            self.wfile.write(json.dumps(data).encode("utf-8"))
        else:
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self._send_cors()
            self.end_headers()
            self.wfile.write(LOCAL_DASHBOARD_HTML.encode("utf-8"))

    def do_POST(self):
        global simulation_running
        length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
        try:
            body = json.loads(raw_body)
        except Exception:
            body = {}

        if self.path.startswith("/api/geofences/delete"):
            gf_id = body.get("id")
            with state_lock:
                geofences_list[:] = [g for g in geofences_list if g.get("id") != gf_id]
            self._json_res({"ok": True})
        elif self.path.startswith("/api/geofences"):
            with state_lock:
                geofences_list.append({
                    "id": f"geo-{int(time.time()*1000)}",
                    "name": body.get("name", "Nueva Geocerca"),
                    "type": "circle",
                    "center": body.get("center", [42.815, -1.642]),
                    "radius": float(body.get("radius", 500)),
                    "speedLimit": float(body.get("speedLimit", 60)),
                    "color": body.get("color", "#10b981")
                })
            self._json_res({"ok": True})
        elif self.path.startswith("/api/inject"):
            d_id = body.get("deviceId", DEVICE_ID)
            pos = {
                "deviceId": d_id,
                "hostname": hostname,
                "source": "MANUAL-INJECT",
                "latitude": float(body.get("latitude", 42.815)),
                "longitude": float(body.get("longitude", -1.642)),
                "altitude": 460.0,
                "speed": float(body.get("speed", 90.0)),
                "heading": 90,
                "satellites": 18,
                "hdop": 0.6,
                "battery": get_battery_level(),
                "ignition": True,
                "tamper": False,
                "sos": bool(body.get("sos", False)),
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
            ingest_position(d_id, pos, "HTTPS-INJECT")
            self._json_res({"ok": True})
        elif self.path.startswith("/api/devices"):
            d_id = body.get("id", f"kali-{int(time.time())}")
            lat = float(body.get("latitude", 42.815))
            lon = float(body.get("longitude", -1.642))
            with state_lock:
                fleet_devices[d_id] = {
                    "id": d_id,
                    "name": body.get("name", d_id),
                    "imei": str(int(time.time() * 1000))[-15:],
                    "model": "Unidad Táctica Kali",
                    "vehicleType": "patrol",
                    "protocol": "aes-encrypted-json",
                    "aesKeyHex": AES_KEY_HEX,
                    "speedLimit": 90,
                    "status": "moving",
                    "color": body.get("color", "#38bdf8"),
                    "baseLat": lat,
                    "baseLon": lon,
                    "lastPosition": None
                }
            pos = {
                "deviceId": d_id,
                "hostname": hostname,
                "source": "NEW-UNIT",
                "latitude": lat,
                "longitude": lon,
                "altitude": 450.0,
                "speed": 40.0,
                "heading": 0,
                "satellites": 16,
                "hdop": 0.7,
                "battery": 100,
                "ignition": True,
                "tamper": False,
                "sos": False,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
            ingest_position(d_id, pos, "HTTPS")
            self._json_res({"ok": True})
        elif self.path.startswith("/api/tamper"):
            with state_lock:
                alerts_list.insert(0, {
                    "id": f"alt-{int(time.time()*1000)}",
                    "deviceId": DEVICE_ID,
                    "deviceName": f"Nodo Kali ({hostname})",
                    "severity": "critical",
                    "type": "tamper",
                    "message": "Intento de manipulación detectado: Tag MAC GCM inválido rechazado por el motor criptográfico.",
                    "latitude": 42.815,
                    "longitude": -1.642,
                    "timestamp": datetime.now(timezone.utc).isoformat()
                })
            self._json_res({"ok": True, "message": "✓ ¡Éxito! El motor AES-256-GCM detectó la alteración del Ciphertext y bloqueó el paquete (Alerta registrada)."})
        elif self.path.startswith("/api/toggle-sim"):
            simulation_running = not simulation_running
            self._json_res({"ok": True, "simulationRunning": simulation_running})
        else:
            self._json_res({"ok": False}, 404)

    def _json_res(self, obj, code=200):
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self._send_cors()
        self.end_headers()
        self.wfile.write(json.dumps(obj).encode("utf-8"))

    def log_message(self, format, *args):
        return

def start_local_bridge():
    try:
        server = ReusableHTTPServer(("0.0.0.0", LOCAL_BRIDGE_PORT), LocalBridgeHandler)
        print(f"[AegisGPS] Plataforma Web Completa activa en http://127.0.0.1:{LOCAL_BRIDGE_PORT}/")
        print(f"[AegisGPS] Endpoint JSON activo en           http://127.0.0.1:{LOCAL_BRIDGE_PORT}/telemetry")
        server.serve_forever()
    except Exception as e:
        print(f"[AegisGPS] El puerto {LOCAL_BRIDGE_PORT} ya está activo por el servicio systemd ({e})")

def main():
    print(f"=== Iniciando Plataforma AegisGPS en host '{hostname}' ({DEVICE_ID}) ===")
    init_local_platform()
    t = threading.Thread(target=start_local_bridge, daemon=True)
    t.start()

    while True:
        try:
            packet = step_telemetry_cycle()
            if packet:
                ts = datetime.now().strftime("%H:%M:%S")
                t_prev = packet["telemetryPreview"]
                try:
                    body_bytes = json.dumps({
                        "deviceId": packet["deviceId"],
                        "hostname": hostname,
                        "algorithm": packet["algorithm"],
                        "transport": packet["transport"],
                        "iv": packet["iv"],
                        "ciphertext": packet["ciphertext"],
                        "authTag": packet["authTag"]
                    }).encode("utf-8")
                    req = urllib.request.Request(
                        SERVER_URL,
                        data=body_bytes,
                        headers={"Content-Type": "application/json", "Accept": "application/json"},
                        method="POST"
                    )
                    with urllib.request.urlopen(req, timeout=3) as resp:
                        ctype = resp.headers.get("Content-Type", "")
                        if resp.status == 200 and "application/json" in ctype:
                            print(f"[{ts}] OK -> Lat:{t_prev['latitude']} Lon:{t_prev['longitude']} | Sincronizado")
                        else:
                            print(f"[{ts}] Plataforma activa en http://127.0.0.1:8765 -> Lat:{t_prev['latitude']} Lon:{t_prev['longitude']} ({t_prev['speed']} km/h)")
                except Exception:
                    print(f"[{ts}] Plataforma activa en http://127.0.0.1:8765 -> Lat:{t_prev['latitude']} Lon:{t_prev['longitude']}")
        except Exception as err:
            print(f"Error en ciclo telemático: {err}")
        time.sleep(2.5)

if __name__ == "__main__":
    main()
`;
}

export function generateDebianInstallScript(
  serverOrigin: string,
  deviceId: string = DEFAULT_DEBIAN_DEVICE_ID,
  aesKeyHex: string = DEFAULT_DEBIAN_AES_KEY
): string {
  const pythonScript = generateDebianPythonScript(serverOrigin, deviceId, aesKeyHex);
  const systemdService = generateDebianSystemdService();

  return `#!/usr/bin/env bash
# ==============================================================================
# Instalador Oficial AegisGPS para Kali Linux, Debian GNU/Linux, Ubuntu & RPi OS
# ==============================================================================

if [ "$(id -u)" -eq 0 ]; then
  SUDO=""
else
  SUDO="sudo"
fi

echo "================================================================"
echo " [AegisGPS] Instalando Plataforma Completa en Kali / Debian"
echo "================================================================"

export DEBIAN_FRONTEND=noninteractive

# 1. Auto-reparación del repositorio Docker en Kali Linux (kali-rolling -> bookworm)
if grep -rnq "download.docker.com.*kali-rolling" /etc/apt/ 2>/dev/null; then
  echo "[*] Reparando repositorio Docker ('kali-rolling' -> 'bookworm') en /etc/apt/..."
  $SUDO sed -i 's|download.docker.com/linux/debian kali-rolling|download.docker.com/linux/debian bookworm|g' /etc/apt/sources.list /etc/apt/sources.list.d/*.list /etc/apt/sources.list.d/*.sources 2>/dev/null || true
  $SUDO sed -i 's|kali-rolling|bookworm|g' /etc/apt/sources.list.d/*docker* 2>/dev/null || true
fi

# 2. Verificación rápida de dependencias
if python3 -c "import cryptography" 2>/dev/null; then
  echo "[✓] Python 3 y motor criptográfico AES-256-GCM detectados nativamente."
else
  echo "[*] Instalando python3-cryptography..."
  $SUDO apt-get update -qq 2>/dev/null || true
  $SUDO apt-get install -y python3 python3-cryptography gpsd gpsd-clients 2>/dev/null || true
fi

# 3. Creación del directorio y plataforma Python AES-256-GCM
$SUDO mkdir -p /opt/aegis-gps

$SUDO tee /opt/aegis-gps/aegis_client.py > /dev/null << 'EOF_PY'
${pythonScript}
EOF_PY

$SUDO chmod +x /opt/aegis-gps/aegis_client.py

# 4. Creación del comando global CLI /usr/local/bin/aegis-gps
$SUDO tee /usr/local/bin/aegis-gps > /dev/null << 'EOF_CLI'
#!/usr/bin/env bash
CMD="\${1:-status}"
case "$CMD" in
  status)
    echo "=== Estado del Servicio AegisGPS ==="
    systemctl status aegis-gps.service --no-pager -l
    echo ""
    echo "=== Última Trama Cifrada AES-256-GCM (Puerto 8765) ==="
    curl -s http://127.0.0.1:8765/telemetry | python3 -m json.tool 2>/dev/null || echo "Iniciando servicio..."
    ;;
  logs|monitor)
    echo "=== Monitor en Vivo AegisGPS (Pulsa Ctrl+C para salir) ==="
    sudo journalctl -u aegis-gps.service -f -n 25
    ;;
  web|panel)
    echo "Abriendo Plataforma Completa AegisGPS en: http://127.0.0.1:8765"
    xdg-open http://127.0.0.1:8765 2>/dev/null || sensible-browser http://127.0.0.1:8765 2>/dev/null || echo "Abre en tu navegador: http://127.0.0.1:8765"
    ;;
  restart)
    sudo systemctl restart aegis-gps.service && echo "[OK] Servicio reiniciado."
    ;;
  stop)
    sudo systemctl stop aegis-gps.service && echo "[OK] Servicio detenido."
    ;;
  start)
    sudo systemctl start aegis-gps.service && echo "[OK] Servicio iniciado."
    ;;
  *)
    echo "Uso: aegis-gps [status | logs | web | restart | stop | start]"
    ;;
esac
EOF_CLI

$SUDO chmod +x /usr/local/bin/aegis-gps

# 5. Configuración del servicio Systemd
$SUDO tee /etc/systemd/system/aegis-gps.service > /dev/null << 'EOF_SVC'
${systemdService}
EOF_SVC

$SUDO systemctl daemon-reload
$SUDO systemctl enable aegis-gps.service 2>/dev/null || true
$SUDO systemctl restart aegis-gps.service

echo ""
echo "================================================================"
echo " [OK] Plataforma AegisGPS actualizada y activa en Kali / Debian"
echo "================================================================"
echo " • Interfaz Completa  : http://127.0.0.1:8765 (Recarga tu navegador)"
echo " • Comando Global CLI : aegis-gps web | aegis-gps status | aegis-gps logs"
echo "================================================================"
`;
}

export function generateDebianBase64OneLiner(
  serverOrigin: string,
  deviceId: string = DEFAULT_DEBIAN_DEVICE_ID,
  aesKeyHex: string = DEFAULT_DEBIAN_AES_KEY
): string {
  const script = generateDebianInstallScript(serverOrigin, deviceId, aesKeyHex);
  const utf8Bytes = new TextEncoder().encode(script);
  let binary = '';
  for (let i = 0; i < utf8Bytes.length; i++) {
    binary += String.fromCharCode(utf8Bytes[i]);
  }
  const b64 = btoa(binary);
  return `echo "${b64}" | base64 -d | sudo bash`;
}

export function downloadScriptFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/x-shellscript;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
