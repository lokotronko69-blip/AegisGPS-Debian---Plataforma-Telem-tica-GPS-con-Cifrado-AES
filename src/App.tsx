import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header, AppTab } from './components/Header';
import { DeviceSidebar } from './components/DeviceSidebar';
import { MapView } from './components/MapView';
import { CryptoInspectorModal } from './components/CryptoInspectorModal';
import { GeofenceManagerModal } from './components/GeofenceManagerModal';
import { HistoryPlaybackModal } from './components/HistoryPlaybackModal';
import { DebianIntegrationModal } from './components/DebianIntegrationModal';
import { TelemetryTesterModal } from './components/TelemetryTesterModal';
import { DeviceRegistrationModal } from './components/DeviceRegistrationModal';
import { DeviceConnectorHubModal } from './components/DeviceConnectorHubModal';
import { CommandCenterModal } from './components/CommandCenterModal';
import { NearbyGpsScannerModal } from './components/NearbyGpsScannerModal';
import { SystemUpdateModal } from './components/SystemUpdateModal';
import { NotificationDrawer } from './components/NotificationDrawer';
import { 
  GpsDevice, 
  GpsPosition, 
  Geofence, 
  GpsAlert, 
  CryptoPacketLog, 
  TelemetryStats 
} from './types/gps';
import { playAlertSound } from './utils/audio';
import { encryptAes256Gcm, generateAes256KeyHex } from './utils/crypto';
import { AEGIS_APP_VERSION, pushLocalKaliOtaUpdate } from './utils/debianScripts';

export default function App() {
  const [devices, setDevices] = useState<GpsDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<GpsDevice | null>(null);
  const [positionsHistory, setPositionsHistory] = useState<Map<string, GpsPosition[]>>(new Map());
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [alerts, setAlerts] = useState<GpsAlert[]>([]);
  const [cryptoLogs, setCryptoLogs] = useState<CryptoPacketLog[]>([]);
  const [stats, setStats] = useState<TelemetryStats | null>(null);

  // App Navigation & Modals State
  const [currentTab, setCurrentTab] = useState<AppTab>('map');
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isConnectorHubOpen, setIsConnectorHubOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isUpdaterOpen, setIsUpdaterOpen] = useState(false);
  const [localUpdateAvailable, setLocalUpdateAvailable] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyTargetDevice, setHistoryTargetDevice] = useState<GpsDevice | null>(null);
  const [deviceHistoryPositions, setDeviceHistoryPositions] = useState<GpsPosition[]>([]);

  // Sidebar Collapse State (allows 100% full background real map view)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Real Hardware Device GPS Geolocation & Sub-Meter Precision Lock
  const [realGpsActive, setRealGpsActive] = useState(false);
  const [realLocationCoords, setRealLocationCoords] = useState<{ lat: number; lng: number; accuracy?: number } | null>(() => {
    try {
      const saved = localStorage.getItem('aegis_calibrated_exact_coords');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
          return { lat: parsed.lat, lng: parsed.lng, accuracy: parsed.accuracy ?? 0.5 };
        }
      }
    } catch {
      // ignore
    }
    return null;
  });
  const geoWatchIdRef = useRef<number | null>(null);
  const realDeviceKeyRef = useRef<string>(generateAes256KeyHex());
  const bestAccuracyRef = useRef<number>(999999);
  const hasLockedRealGnssRef = useRef<boolean>(false);
  const manualCalibratedRef = useRef<boolean>(false);

  // Telemetry Settings
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [connectedSse, setConnectedSse] = useState(false);

  // Real-time Toast Alert
  const [latestToast, setLatestToast] = useState<GpsAlert | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initial Fetch of Devices, Geofences, Stats
  const fetchData = useCallback(async () => {
    try {
      const [devRes, gfRes, alertsRes, logsRes, statsRes] = await Promise.all([
        fetch('/api/devices'),
        fetch('/api/geofences'),
        fetch('/api/alerts'),
        fetch('/api/crypto-logs'),
        fetch('/api/stats'),
      ]);

      if (devRes.ok) {
        const devData = await devRes.json();
        const unique = Array.from(new Map<string, GpsDevice>(devData.map((d: GpsDevice) => [d.id, d])).values());
        setDevices(unique);
        if (unique.length > 0 && !selectedDevice) {
          setSelectedDevice(unique[0]);
        }
      }
      if (gfRes.ok) setGeofences(await gfRes.json());
      if (alertsRes.ok) setAlerts(await alertsRes.json());
      if (logsRes.ok) setCryptoLogs(await logsRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } catch (err) {
      console.error('Error fetching initial data:', err);
    }
  }, [selectedDevice]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Connect to Real-time SSE Stream
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    function connect() {
      eventSource = new EventSource('/api/stream/events');

      eventSource.onopen = () => {
        setConnectedSse(true);
      };

      eventSource.addEventListener('snapshot', (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.devices) {
            const unique = Array.from(new Map<string, GpsDevice>(data.devices.map((d: GpsDevice) => [d.id, d])).values());
            setDevices(unique);
            setSelectedDevice((prev) => {
              if (!prev) return unique[0] || null;
              return unique.find((d) => d.id === prev.id) || prev;
            });
          }
          if (data.alerts) setAlerts(data.alerts);
          if (data.cryptoLogs) setCryptoLogs(data.cryptoLogs);
        } catch {
          // ignore
        }
      });

      eventSource.addEventListener('position_update', (e) => {
        try {
          const payload = JSON.parse(e.data) as {
            device: GpsDevice;
            position: GpsPosition;
            protocolSource: string;
          };

          setDevices((prev) => {
            const map = new Map<string, GpsDevice>(prev.map((d) => [d.id, d]));
            map.set(payload.device.id, payload.device);
            return Array.from(map.values());
          });

          setSelectedDevice((prev) => {
            if (!prev) return payload.device;
            if (prev.id === payload.device.id) return payload.device;
            return prev;
          });

          setPositionsHistory((prev) => {
            const next = new Map(prev);
            const list = next.get(payload.position.deviceId) || [];
            next.set(payload.position.deviceId, [...list, payload.position].slice(-300));
            return next;
          });

          // Update stats
          setStats((prev) => prev ? {
            ...prev,
            packetsDecrypted: prev.packetsDecrypted + 1,
          } : null);
        } catch {
          // ignore
        }
      });

      eventSource.addEventListener('crypto_log', (e) => {
        try {
          const log = JSON.parse(e.data) as CryptoPacketLog;
          setCryptoLogs((prev) => [log, ...prev].slice(0, 100));
        } catch {
          // ignore
        }
      });

      eventSource.addEventListener('notification', (e) => {
        try {
          const alert = JSON.parse(e.data) as GpsAlert;
          setAlerts((prev) => [alert, ...prev].slice(0, 200));

          // Trigger audio chime if enabled
          if (audioEnabled) {
            playAlertSound(alert.severity);
          }

          // Show floating toast
          setLatestToast(alert);
          if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
          toastTimeoutRef.current = setTimeout(() => {
            setLatestToast(null);
          }, 4500);
        } catch {
          // ignore
        }
      });

      eventSource.addEventListener('device_registered', (e) => {
        try {
          const newDev = JSON.parse(e.data) as GpsDevice;
          setDevices((prev) => {
            const map = new Map<string, GpsDevice>(prev.map((d) => [d.id, d]));
            map.set(newDev.id, newDev);
            return Array.from(map.values());
          });
        } catch {
          // ignore
        }
      });

      eventSource.addEventListener('device_removed', (e) => {
        try {
          const { id } = JSON.parse(e.data) as { id: string };
          setDevices((prev) => prev.filter((d) => d.id !== id));
        } catch {
          // ignore
        }
      });

      eventSource.addEventListener('geofence_updated', (e) => {
        try {
          const gf = JSON.parse(e.data) as Geofence;
          setGeofences((prev) => {
            const index = prev.findIndex((g) => g.id === gf.id);
            if (index !== -1) {
              const updated = [...prev];
              updated[index] = gf;
              return updated;
            }
            return [...prev, gf];
          });
        } catch {
          // ignore
        }
      });

      eventSource.addEventListener('geofence_deleted', (e) => {
        try {
          const { id } = JSON.parse(e.data) as { id: string };
          setGeofences((prev) => prev.filter((g) => g.id !== id));
        } catch {
          // ignore
        }
      });

      eventSource.addEventListener('alerts_cleared', () => {
        setAlerts([]);
      });

      eventSource.onerror = () => {
        setConnectedSse(false);
        if (eventSource) eventSource.close();
        reconnectTimeout = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      if (eventSource) eventSource.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, [audioEnabled]);

  // Auto-detect & relay local Kali/Debian daemon on 127.0.0.1:8765 if active
  useEffect(() => {
    let bridgeInterval: NodeJS.Timeout | null = null;
    let isCancelled = false;

    async function probeAndRelayLocalDaemon() {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 1200);
        const res = await fetch('http://127.0.0.1:8765/telemetry', { signal: ctrl.signal });
        clearTimeout(timer);
        if (!res.ok || isCancelled) return;
        const pkt = await res.json();
        if (pkt && pkt.version !== AEGIS_APP_VERSION) {
          setLocalUpdateAvailable(true);
          pushLocalKaliOtaUpdate(window.location.origin)
            .then((resOta) => {
              if (resOta.verifiedVersion === AEGIS_APP_VERSION) {
                setLocalUpdateAvailable(false);
              }
            })
            .catch(() => {});
        } else {
          setLocalUpdateAvailable(false);
        }
        if (pkt && pkt.iv && pkt.ciphertext) {
          // If user has a calibrated or high-precision browser lock, sync it to local daemon if daemon is still on GeoIP
          const previewSource = String(pkt.telemetryPreview?.source || '');
          if (previewSource.includes('GEOIP')) {
            try {
              const savedCal = localStorage.getItem('aegis_calibrated_exact_coords');
              if (savedCal) {
                const cal = JSON.parse(savedCal);
                if (typeof cal.lat === 'number' && typeof cal.lng === 'number') {
                  await fetch('http://127.0.0.1:8765/api/inject', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      deviceId: pkt.deviceId || 'dev-debian-patrol-04',
                      latitude: cal.lat,
                      longitude: cal.lng,
                      altitude: 450,
                      speed: 0,
                      heading: 0,
                      satellites: 19,
                      hdop: 0.4,
                      accuracy: 0.5,
                      lockExact: true,
                      browserGps: true,
                    }),
                  });
                }
              }
            } catch {
              // ignore
            }
          }

          await fetch('/api/gps/encrypted-aes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              deviceId: pkt.deviceId || 'dev-debian-patrol-04',
              hostname: pkt.hostname,
              algorithm: pkt.algorithm || 'AES-256-GCM',
              transport: 'HTTPS',
              iv: pkt.iv,
              ciphertext: pkt.ciphertext,
              authTag: pkt.authTag,
            }),
          });

          if (!bridgeInterval && !isCancelled) {
            bridgeInterval = setInterval(async () => {
              try {
                const r = await fetch('http://127.0.0.1:8765/telemetry');
                if (r.ok) {
                  const p = await r.json();
                  await fetch('/api/gps/encrypted-aes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      deviceId: p.deviceId || 'dev-debian-patrol-04',
                      hostname: p.hostname,
                      algorithm: p.algorithm || 'AES-256-GCM',
                      transport: 'HTTPS',
                      iv: p.iv,
                      ciphertext: p.ciphertext,
                      authTag: p.authTag,
                    }),
                  });
                }
              } catch {
                // ignore transient local bridge error
              }
            }, 3000);
          }
        }
      } catch {
        // Local daemon not running on 127.0.0.1:8765 yet
      }
    }

    probeAndRelayLocalDaemon();

    return () => {
      isCancelled = true;
      if (bridgeInterval) clearInterval(bridgeInterval);
    };
  }, []);

  // Ensure Real User Device exists and return its ID and AES key
  const ensureRealUserDevice = async (): Promise<{ id: string; aesKeyHex: string }> => {
    const realDeviceId = 'dev-real-gps-user';
    const existing = devices.find((d) => d.id === realDeviceId || d.imei === '869910293847561');
    if (existing && existing.aesKeyHex) {
      realDeviceKeyRef.current = existing.aesKeyHex;
      return { id: existing.id, aesKeyHex: existing.aesKeyHex };
    }
    try {
      const realDev: Partial<GpsDevice> = {
        id: realDeviceId,
        name: 'Mi Dispositivo Real (Local GNSS)',
        imei: '869910293847561',
        model: 'Navegador Web / Nodo Físico',
        vehicleType: 'person',
        protocol: 'aes-encrypted-json',
        aesKeyHex: realDeviceKeyRef.current,
        speedLimit: 120,
        color: '#10b981',
      };
      await handleRegisterDevice(realDev);
    } catch {
      // ignore if already registered
    }
    return { id: realDeviceId, aesKeyHex: realDeviceKeyRef.current };
  };

  // Transmit High-Precision Encrypted Coordinates to Cloud & Local Kali Daemon
  const transmitHighPrecisionCoords = async (
    lat: number,
    lng: number,
    accuracy = 1.5,
    speedKmh = 0,
    heading = 0,
    altitude = 450,
    source = 'GNSS-ALTA-PRECISION',
    targetDevice?: GpsDevice | null
  ) => {
    const cleanLat = Number(lat.toFixed(7));
    const cleanLng = Number(lng.toFixed(7));
    const cleanAcc = Math.max(0.5, Number(accuracy.toFixed(1)));
    const computedHdop = Number(Math.max(0.4, Math.min(2.5, cleanAcc / 5)).toFixed(2));
    const computedSats = cleanAcc <= 2 ? 19 : cleanAcc <= 10 ? 17 : cleanAcc <= 30 ? 14 : 10;

    setRealLocationCoords({ lat: cleanLat, lng: cleanLng, accuracy: cleanAcc });

    const devInfo = targetDevice && targetDevice.aesKeyHex
      ? { id: targetDevice.id, aesKeyHex: targetDevice.aesKeyHex }
      : await ensureRealUserDevice();

    const payloadObj = {
      deviceId: devInfo.id,
      latitude: cleanLat,
      longitude: cleanLng,
      altitude: Math.round(altitude || 450),
      speed: Number(speedKmh.toFixed(1)),
      heading: Math.round(heading || 0),
      satellites: computedSats,
      hdop: computedHdop,
      accuracy: cleanAcc,
      source,
      battery: 100,
      ignition: true,
      tamper: false,
      sos: false,
      timestamp: new Date().toISOString(),
    };

    try {
      const encrypted = await encryptAes256Gcm(
        JSON.stringify(payloadObj),
        devInfo.aesKeyHex
      );
      await fetch('/api/gps/encrypted-aes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: devInfo.id,
          ciphertext: encrypted.ciphertextHex,
          iv: encrypted.ivHex,
          authTag: encrypted.authTagHex,
          algorithm: 'AES-256-GCM',
          transport: 'HTTPS',
        }),
      });
    } catch (err) {
      console.error('Error transmitiendo ubicación real cifrada:', err);
    }

    // Also sync high-precision fix to local Kali Linux daemon (:8765) if running
    if (cleanAcc <= 100 || source === 'CALIBRADO-EXACTO-1M') {
      fetch('http://127.0.0.1:8765/api/inject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: 'dev-debian-patrol-04',
          latitude: cleanLat,
          longitude: cleanLng,
          altitude: Math.round(altitude || 450),
          speed: Number(speedKmh.toFixed(1)),
          heading: Math.round(heading || 0),
          satellites: computedSats,
          hdop: computedHdop,
          accuracy: cleanAcc,
          browserGps: true,
          lockExact: source === 'CALIBRADO-EXACTO-1M',
        }),
      }).catch(() => {});
    }
  };

  // 1-Click Sub-Meter Map Calibration Handler (Fixes any ISP GeoIP or Wi-Fi offset)
  const handleCalibrateExactPosition = async (lat: number, lng: number) => {
    const cleanLat = Number(lat.toFixed(7));
    const cleanLng = Number(lng.toFixed(7));
    manualCalibratedRef.current = true;
    hasLockedRealGnssRef.current = true;
    bestAccuracyRef.current = 0.5;

    try {
      localStorage.setItem(
        'aegis_calibrated_exact_coords',
        JSON.stringify({
          lat: cleanLat,
          lng: cleanLng,
          accuracy: 0.5,
          calibratedAt: new Date().toISOString(),
        })
      );
    } catch {
      // ignore storage errors
    }

    setRealGpsActive(true);
    await transmitHighPrecisionCoords(
      cleanLat,
      cleanLng,
      0.5,
      0,
      0,
      selectedDevice?.lastPosition?.altitude || 450,
      'CALIBRADO-EXACTO-1M',
      selectedDevice
    );
  };

  // Handle Real GPS Hardware Geolocation (with High-Accuracy Filter & Zero Coarse Overwrite)
  const handleToggleRealGps = async () => {
    if (realGpsActive) {
      if (geoWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(geoWatchIdRef.current);
        geoWatchIdRef.current = null;
      }
      setRealGpsActive(false);
      return;
    }

    await ensureRealUserDevice();
    setRealGpsActive(true);

    // Check if user previously calibrated an exact sub-meter point
    try {
      const savedCal = localStorage.getItem('aegis_calibrated_exact_coords');
      if (savedCal) {
        const cal = JSON.parse(savedCal);
        if (typeof cal.lat === 'number' && typeof cal.lng === 'number') {
          hasLockedRealGnssRef.current = true;
          bestAccuracyRef.current = 15;
          await transmitHighPrecisionCoords(
            cal.lat,
            cal.lng,
            cal.accuracy || 0.8,
            0,
            0,
            450,
            'CALIBRADO-EXACTO-1M'
          );
        }
      }
    } catch {
      // ignore
    }

    const runDesktopFallback = async () => {
      // NEVER overwrite if we already locked a real GNSS fix or manual calibration!
      if (hasLockedRealGnssRef.current || manualCalibratedRef.current) {
        return;
      }
      try {
        const localRes = await fetch('http://127.0.0.1:8765/telemetry');
        if (localRes.ok) {
          const pkt = await localRes.json();
          const t = pkt.telemetryPreview;
          if (t && typeof t.latitude === 'number') {
            const isLocked = String(t.source || '').includes('EXACT') || String(t.source || '').includes('GNSS') || String(t.source || '').includes('HW');
            await transmitHighPrecisionCoords(
              t.latitude,
              t.longitude,
              isLocked ? 1.5 : 180,
              t.speed || 0,
              t.heading || 0,
              t.altitude || 450,
              t.source || 'NODO-LOCAL-KALI'
            );
            return;
          }
        }
      } catch {
        // fallback to HTTPS GeoIP only if no lock exists
      }
      try {
        const geoRes = await fetch('https://get.geojs.io/v1/ip/geo.json');
        if (geoRes.ok) {
          const geoData = await geoRes.json();
          const lat = parseFloat(geoData.latitude);
          const lng = parseFloat(geoData.longitude);
          if (!isNaN(lat) && !isNaN(lng) && !hasLockedRealGnssRef.current) {
            await transmitHighPrecisionCoords(lat, lng, 250, 0, 0, 450, 'GEOIP-RED-APROX');
          }
        }
      } catch {
        // ignore
      }
    };

    if (!('geolocation' in navigator)) {
      await runDesktopFallback();
      return;
    }

    const processGnssPosition = async (pos: GeolocationPosition) => {
      const acc = pos.coords.accuracy || 20;

      // If user manually calibrated sub-meter position on desktop, don't let coarse Wi-Fi (>25m) jump away
      if (manualCalibratedRef.current && acc > 25) {
        return;
      }

      // Reject sudden coarse cell/IP outlier jumps if we already achieved a tight GNSS lock
      if (hasLockedRealGnssRef.current && bestAccuracyRef.current <= 30 && acc > bestAccuracyRef.current * 2.5) {
        return;
      }

      hasLockedRealGnssRef.current = true;
      if (acc < bestAccuracyRef.current) {
        bestAccuracyRef.current = acc;
      }

      await transmitHighPrecisionCoords(
        pos.coords.latitude,
        pos.coords.longitude,
        acc,
        pos.coords.speed ? pos.coords.speed * 3.6 : 0,
        pos.coords.heading || 0,
        pos.coords.altitude || 450,
        acc <= 15 ? 'GNSS-ALTA-PRECISION' : 'GNSS-NAVEGADOR'
      );
    };

    // Immediate high-accuracy acquisition request
    navigator.geolocation.getCurrentPosition(
      processGnssPosition,
      () => {},
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );

    // Continuous high-accuracy watch stream (20s timeout so cold GNSS locks don't abort into GeoIP)
    geoWatchIdRef.current = navigator.geolocation.watchPosition(
      processGnssPosition,
      async () => {
        if (!hasLockedRealGnssRef.current && !manualCalibratedRef.current) {
          await runDesktopFallback();
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 20000,
      }
    );
  };

  // Delete Device Handler (Real-World Fleet Management)
  const handleDeleteDevice = async (deviceId: string) => {
    try {
      const res = await fetch(`/api/devices/${deviceId}`, { method: 'DELETE' });
      if (res.ok) {
        setDevices((prev) => prev.filter((d) => d.id !== deviceId));
        setSelectedDevice((prev) => (prev?.id === deviceId ? null : prev));
      }
    } catch (err) {
      console.error('Error deleting device:', err);
    }
  };

  // Open Route History Replay
  const handleOpenHistory = async (dev: GpsDevice) => {
    setHistoryTargetDevice(dev);
    try {
      const res = await fetch(`/api/positions/${dev.id}`);
      if (res.ok) {
        const positions = await res.json();
        setDeviceHistoryPositions(positions);
      } else {
        setDeviceHistoryPositions(positionsHistory.get(dev.id) || []);
      }
    } catch {
      setDeviceHistoryPositions(positionsHistory.get(dev.id) || []);
    }
    setIsHistoryOpen(true);
  };

  // Register Device Handler
  const handleRegisterDevice = async (deviceData: Partial<GpsDevice>) => {
    const res = await fetch('/api/devices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(deviceData),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Error al registrar dispositivo');
    }
    const newDev = await res.json();
    setDevices((prev) => {
      const map = new Map<string, GpsDevice>(prev.map((d) => [d.id, d]));
      map.set(newDev.id, newDev);
      return Array.from(map.values());
    });
    setSelectedDevice(newDev);
  };

  // Add Geofence Handler
  const handleAddGeofence = async (gfData: Partial<Geofence>) => {
    const res = await fetch('/api/geofences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(gfData),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Error al crear geocerca');
    }
    const newGf = await res.json();
    setGeofences((prev) => [...prev, newGf]);
  };

  // Delete Geofence Handler
  const handleDeleteGeofence = async (id: string) => {
    const res = await fetch(`/api/geofences/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setGeofences((prev) => prev.filter((g) => g.id !== id));
    }
  };

  // Clear Alerts
  const handleClearAlerts = async () => {
    await fetch('/api/alerts/clear', { method: 'POST' });
    setAlerts([]);
  };

  const unreadAlertsCount = alerts.filter((a) => !a.read).length;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden select-none bg-slate-950 text-slate-100">
      {/* 1. Unified Top Command Header */}
      <div className="relative z-30 shrink-0 pointer-events-auto">
        <Header
          currentTab={currentTab}
          onSelectTab={setCurrentTab}
          stats={stats}
          audioEnabled={audioEnabled}
          onToggleAudio={() => setAudioEnabled(!audioEnabled)}
          realGpsActive={realGpsActive}
          onToggleRealGps={handleToggleRealGps}
          unreadAlertsCount={unreadAlertsCount}
          onOpenNotifications={() => setIsNotificationsOpen(true)}
          onOpenRegisterDevice={() => setIsRegisterOpen(true)}
          onOpenConnectorHub={() => setIsConnectorHubOpen(true)}
          onOpenScanner={() => setIsScannerOpen(true)}
          onOpenUpdater={() => setIsUpdaterOpen(true)}
          onOpenHistory={() => {
            const target = selectedDevice || devices[0];
            if (target) handleOpenHistory(target);
          }}
          geofencesCount={geofences.length}
          updateAvailable={localUpdateAvailable}
          connectedSse={connectedSse}
        />
      </div>

      {/* 2. Main Interactive Workspace Area (Non-Overlapping Split Layout: Sidebar + Map) */}
      <div className="relative flex-1 flex min-h-0 w-full overflow-hidden">
        {/* Left: Collapsible Device Fleet Sidebar */}
        <DeviceSidebar
          devices={devices}
          selectedDeviceId={selectedDevice?.id || null}
          onSelectDevice={setSelectedDevice}
          onDeleteDevice={handleDeleteDevice}
          onOpenHistory={handleOpenHistory}
          onOpenCrypto={() => setCurrentTab('crypto')}
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          realGpsActive={realGpsActive}
          onToggleRealGps={handleToggleRealGps}
          onOpenScanner={() => setIsScannerOpen(true)}
          onOpenConnectorHub={() => setIsConnectorHubOpen(true)}
          packetsDecrypted={stats?.packetsDecrypted || 0}
        />

        {/* Right: Dedicated Real-World Map Viewport (Never covered by Sidebar) */}
        <div className="relative flex-1 min-w-0 h-full overflow-hidden">
          <MapView
            devices={devices}
            geofences={geofences}
            selectedDevice={selectedDevice}
            onSelectDevice={setSelectedDevice}
            onOpenHistory={handleOpenHistory}
            onOpenCrypto={() => setCurrentTab('crypto')}
            positionsHistory={positionsHistory}
            onToggleRealGps={handleToggleRealGps}
            realGpsActive={realGpsActive}
            realLocationCoords={realLocationCoords}
            onCalibratePosition={handleCalibrateExactPosition}
            onOpenScanner={() => setIsScannerOpen(true)}
            onOpenConnectorHub={() => setIsConnectorHubOpen(true)}
            onOpenInjector={() => setCurrentTab('simulation')}
          />

          {/* Floating Instant Alert Toast (Top Right inside map viewport) */}
          {latestToast && (
            <div className="pointer-events-auto absolute top-16 right-4 z-40 max-w-sm p-3.5 bg-slate-900/95 backdrop-blur-md border border-rose-900/60 rounded-2xl shadow-2xl flex items-start gap-3 animate-in slide-in-from-top-2 duration-200">
              <div className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping mt-1 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between text-xs font-bold text-white">
                  <span>{latestToast.deviceName}</span>
                  <span className="text-[10px] font-mono text-slate-400">
                    {new Date(latestToast.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-xs text-rose-300 mt-0.5 leading-snug">
                  {latestToast.message}
                </p>
              </div>
              <button
                onClick={() => setLatestToast(null)}
                className="text-slate-400 hover:text-white"
              >
                ×
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modals & Drawers */}
      <CryptoInspectorModal
        isOpen={currentTab === 'crypto'}
        onClose={() => setCurrentTab('map')}
        logs={cryptoLogs}
        devices={devices}
        selectedDevice={selectedDevice}
      />

      <GeofenceManagerModal
        isOpen={currentTab === 'geofences'}
        onClose={() => setCurrentTab('map')}
        geofences={geofences}
        onAddGeofence={handleAddGeofence}
        onDeleteGeofence={handleDeleteGeofence}
        defaultCenter={[
          realLocationCoords?.lat ||
            selectedDevice?.lastPosition?.latitude ||
            42.8150,
          realLocationCoords?.lng ||
            selectedDevice?.lastPosition?.longitude ||
            -1.6425,
        ]}
      />

      <DebianIntegrationModal
        isOpen={currentTab === 'debian'}
        onClose={() => setCurrentTab('map')}
        tcpPort={stats?.tcpPort || 5023}
      />

      <TelemetryTesterModal
        isOpen={currentTab === 'simulation'}
        onClose={() => setCurrentTab('map')}
        devices={devices}
        selectedDevice={selectedDevice}
      />

      <CommandCenterModal
        isOpen={currentTab === 'commands'}
        onClose={() => setCurrentTab('map')}
        tcpPort={stats?.tcpPort || 5023}
        onOpenTab={(tab) => setCurrentTab(tab)}
        onToggleRealGps={handleToggleRealGps}
        realGpsActive={realGpsActive}
      />

      <HistoryPlaybackModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        device={historyTargetDevice}
        historyPositions={deviceHistoryPositions}
      />

      <DeviceRegistrationModal
        isOpen={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
        onRegisterDevice={handleRegisterDevice}
      />

      {/* OTA System & Local Kali Daemon Updater Modal */}
      <SystemUpdateModal
        isOpen={isUpdaterOpen}
        onClose={() => setIsUpdaterOpen(false)}
        onRefreshState={fetchData}
      />

      {/* Nearby GPS Proximity Scanner Modal */}
      <NearbyGpsScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        centerLat={
          realLocationCoords?.lat ||
          selectedDevice?.lastPosition?.latitude ||
          devices.find((d) => d.id === 'dev-debian-patrol-04')?.lastPosition?.latitude ||
          42.8150
        }
        centerLng={
          realLocationCoords?.lng ||
          selectedDevice?.lastPosition?.longitude ||
          devices.find((d) => d.id === 'dev-debian-patrol-04')?.lastPosition?.longitude ||
          -1.6425
        }
        devices={devices}
        onDeviceConnected={(connectedDevs, focusDev) => {
          setDevices((prev) => {
            const map = new Map<string, GpsDevice>(prev.map((d) => [d.id, d]));
            connectedDevs.forEach((cd) => map.set(cd.id, cd));
            return Array.from(map.values());
          });
          if (focusDev) {
            setSelectedDevice(focusDev);
          }
        }}
        onCreateGeofence={handleAddGeofence}
      />

      {/* Universal Device Connector Hub Modal (Plug & Play Proximity Scanner) */}
      <DeviceConnectorHubModal
        isOpen={isConnectorHubOpen}
        onClose={() => setIsConnectorHubOpen(false)}
        devices={devices}
        centerLat={
          realLocationCoords?.lat ||
          selectedDevice?.lastPosition?.latitude ||
          devices.find((d) => d.id === 'dev-debian-patrol-04')?.lastPosition?.latitude ||
          42.8150
        }
        centerLng={
          realLocationCoords?.lng ||
          selectedDevice?.lastPosition?.longitude ||
          devices.find((d) => d.id === 'dev-debian-patrol-04')?.lastPosition?.longitude ||
          -1.6425
        }
        realGpsActive={realGpsActive}
        onToggleRealGps={handleToggleRealGps}
        onDeviceConnected={(connectedDevs, focusDev) => {
          setDevices((prev) => {
            const map = new Map<string, GpsDevice>(prev.map((d) => [d.id, d]));
            connectedDevs.forEach((cd) => map.set(cd.id, cd));
            return Array.from(map.values());
          });
          if (focusDev) {
            setSelectedDevice(focusDev);
          }
        }}
        onSelectDeviceForMap={(dev) => {
          setSelectedDevice(dev);
          setIsConnectorHubOpen(false);
        }}
        onOpenFullScanner={() => setIsScannerOpen(true)}
      />

      <NotificationDrawer
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        alerts={alerts}
        onClearAlerts={handleClearAlerts}
        onFocusAlertLocation={(lat, lng) => {
          setIsNotificationsOpen(false);
          setSelectedDevice((prev) =>
            prev ? { ...prev, lastPosition: { ...prev.lastPosition!, latitude: lat, longitude: lng } } : null
          );
        }}
      />
    </div>
  );
}
