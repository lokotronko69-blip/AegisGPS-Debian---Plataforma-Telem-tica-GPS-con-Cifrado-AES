import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from './components/Header';
import { DeviceSidebar } from './components/DeviceSidebar';
import { MapView } from './components/MapView';
import { CryptoInspectorModal } from './components/CryptoInspectorModal';
import { GeofenceManagerModal } from './components/GeofenceManagerModal';
import { HistoryPlaybackModal } from './components/HistoryPlaybackModal';
import { DebianIntegrationModal } from './components/DebianIntegrationModal';
import { TelemetryTesterModal } from './components/TelemetryTesterModal';
import { DeviceRegistrationModal } from './components/DeviceRegistrationModal';
import { DeviceConnectorHubModal } from './components/DeviceConnectorHubModal';
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

export default function App() {
  const [devices, setDevices] = useState<GpsDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<GpsDevice | null>(null);
  const [positionsHistory, setPositionsHistory] = useState<Map<string, GpsPosition[]>>(new Map());
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [alerts, setAlerts] = useState<GpsAlert[]>([]);
  const [cryptoLogs, setCryptoLogs] = useState<CryptoPacketLog[]>([]);
  const [stats, setStats] = useState<TelemetryStats | null>(null);

  // App Navigation & Modals State
  const [currentTab, setCurrentTab] = useState<'map' | 'crypto' | 'geofences' | 'debian' | 'simulation'>('map');
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isConnectorHubOpen, setIsConnectorHubOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyTargetDevice, setHistoryTargetDevice] = useState<GpsDevice | null>(null);
  const [deviceHistoryPositions, setDeviceHistoryPositions] = useState<GpsPosition[]>([]);

  // Sidebar Collapse State (allows 100% full background real map view)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Real Hardware Device GPS Geolocation
  const [realGpsActive, setRealGpsActive] = useState(false);
  const [realLocationCoords, setRealLocationCoords] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const geoWatchIdRef = useRef<number | null>(null);
  const realDeviceKeyRef = useRef<string>(generateAes256KeyHex());

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

  // Handle Real GPS Hardware Geolocation
  const handleToggleRealGps = async () => {
    if (realGpsActive) {
      if (geoWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(geoWatchIdRef.current);
        geoWatchIdRef.current = null;
      }
      setRealGpsActive(false);
      return;
    }

    if (!('geolocation' in navigator)) {
      alert('Tu navegador o dispositivo no soporta geolocalización GNSS');
      return;
    }

    // Register real device if not already in fleet
    const realDeviceId = 'dev-real-gps-user';
    const existing = devices.find((d) => d.id === realDeviceId || d.imei === '869910293847561');
    if (!existing) {
      try {
        const realDev: Partial<GpsDevice> = {
          id: realDeviceId,
          name: 'Mi Dispositivo Real (Local GNSS)',
          imei: '869910293847561',
          model: 'Navegador Web / Dispositivo Físico',
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
    }

    // Start watching real position
    setRealGpsActive(true);
    geoWatchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        setRealLocationCoords(coords);

        // Prepare telemetry packet
        const payloadObj = {
          deviceId: realDeviceId,
          latitude: coords.lat,
          longitude: coords.lng,
          altitude: pos.coords.altitude || 650,
          speed: pos.coords.speed ? pos.coords.speed * 3.6 : 0,
          heading: pos.coords.heading || 0,
          satellites: 18,
          hdop: 0.6,
          battery: 100,
          ignition: true,
          tamper: false,
          sos: false,
          timestamp: new Date().toISOString(),
        };

        // Encrypt with AES-256-GCM
        try {
          const encrypted = await encryptAes256Gcm(
            JSON.stringify(payloadObj),
            realDeviceKeyRef.current
          );

          await fetch('/api/gps/encrypted-aes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              deviceId: realDeviceId,
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
      },
      (err) => {
        console.warn('Geolocation error:', err.message);
        setRealGpsActive(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 10000,
      }
    );
  };

  // Handle Simulation Toggle
  const handleToggleSimulation = async () => {
    try {
      const res = await fetch('/api/simulation/toggle', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setStats((prev) => prev ? { ...prev, simulationRunning: data.simulationRunning } : null);
      }
    } catch (err) {
      console.error('Error toggling simulation:', err);
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
    <div className="relative h-screen w-screen overflow-hidden select-none bg-slate-950 text-slate-100">
      
      {/* 1. Real-World Map as Full-Bleed Background */}
      <div className="absolute inset-0 z-0">
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
        />
      </div>

      {/* 2. Floating Top Bar Header */}
      <div className="relative z-30 pointer-events-auto">
        <Header
          currentTab={currentTab}
          onSelectTab={setCurrentTab}
          stats={stats}
          audioEnabled={audioEnabled}
          onToggleAudio={() => setAudioEnabled(!audioEnabled)}
          onToggleSimulation={handleToggleSimulation}
          unreadAlertsCount={unreadAlertsCount}
          onOpenNotifications={() => setIsNotificationsOpen(true)}
          onOpenRegisterDevice={() => setIsRegisterOpen(true)}
          onOpenConnectorHub={() => setIsConnectorHubOpen(true)}
          connectedSse={connectedSse}
        />
      </div>

      {/* 3. Main Floating Controls Layer (Passes click-throughs to the real map) */}
      <div className="absolute inset-0 top-14 z-20 pointer-events-none flex">
        
        {/* Floating Collapsible Device Fleet Sidebar */}
        <div className="pointer-events-none h-full">
          <DeviceSidebar
            devices={devices}
            selectedDeviceId={selectedDevice?.id || null}
            onSelectDevice={setSelectedDevice}
            onOpenHistory={handleOpenHistory}
            onOpenCrypto={() => setCurrentTab('crypto')}
            isCollapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
            realGpsActive={realGpsActive}
            onToggleRealGps={handleToggleRealGps}
          />
        </div>

        {/* Center / Right Click-through area over map */}
        <div className="flex-1 pointer-events-none relative">
          
          {/* Floating Instant Alert Toast (Top Right) */}
          {latestToast && (
            <div className="pointer-events-auto absolute top-4 right-4 z-40 max-w-sm p-3.5 bg-slate-900/95 backdrop-blur-md border border-rose-900/60 rounded-2xl shadow-2xl flex items-start gap-3 animate-in slide-in-from-top-2 duration-200">
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

      {/* Universal Device Connector Hub Modal */}
      <DeviceConnectorHubModal
        isOpen={isConnectorHubOpen}
        onClose={() => setIsConnectorHubOpen(false)}
        devices={devices}
        onSelectDeviceForMap={(dev) => {
          setSelectedDevice(dev);
          setIsConnectorHubOpen(false);
        }}
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
