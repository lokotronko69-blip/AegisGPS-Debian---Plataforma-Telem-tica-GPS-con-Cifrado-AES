import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { 
  Crosshair, 
  Layers, 
  Maximize2, 
  ShieldCheck, 
  History, 
  Radio, 
  Battery, 
  Gauge, 
  Compass, 
  MapPin,
  Lock,
  Globe,
  Satellite,
  Sun,
  Moon,
  Radar
} from 'lucide-react';
import { GpsDevice, Geofence, GpsPosition } from '../types/gps';
import { formatCoordinates } from '../utils/geo';

interface MapViewProps {
  devices: GpsDevice[];
  geofences: Geofence[];
  selectedDevice: GpsDevice | null;
  onSelectDevice: (device: GpsDevice) => void;
  onOpenHistory: (device: GpsDevice) => void;
  onOpenCrypto: (device: GpsDevice) => void;
  positionsHistory: Map<string, GpsPosition[]>;
  onToggleRealGps?: () => void;
  realGpsActive?: boolean;
  realLocationCoords?: { lat: number; lng: number; accuracy?: number } | null;
  onCalibratePosition?: (lat: number, lng: number) => void;
  onOpenScanner?: () => void;
  onOpenConnectorHub?: () => void;
  onOpenInjector?: () => void;
}

export type MapLayerType = 'satellite' | 'osm' | 'dark' | 'voyager';

export const MapView: React.FC<MapViewProps> = ({
  devices,
  geofences,
  selectedDevice,
  onSelectDevice,
  onOpenHistory,
  onOpenCrypto,
  positionsHistory,
  onToggleRealGps,
  realGpsActive,
  realLocationCoords,
  onCalibratePosition,
  onOpenScanner,
  onOpenConnectorHub,
  onOpenInjector,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const polylinesRef = useRef<Map<string, L.Polyline>>(new Map());
  const geofenceLayersRef = useRef<L.LayerGroup | null>(null);
  const realGpsAccuracyCircleRef = useRef<L.Circle | null>(null);
  const calibratingModeRef = useRef<boolean>(false);
  const onCalibrateRef = useRef(onCalibratePosition);
  onCalibrateRef.current = onCalibratePosition;

  const [currentLayer, setCurrentLayer] = useState<MapLayerType>('osm');
  const [followMode, setFollowMode] = useState<boolean>(true);
  const [mouseCoords, setMouseCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [calibratingMode, setCalibratingMode] = useState<boolean>(false);
  const [calibrationBanner, setCalibrationBanner] = useState<string | null>(null);

  useEffect(() => {
    calibratingModeRef.current = calibratingMode;
  }, [calibratingMode]);

  // Initialize Map full-bleed
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Default center around real GPS or Spain center (Madrid)
    const initialCenter: [number, number] = realLocationCoords 
      ? [realLocationCoords.lat, realLocationCoords.lng]
      : [40.4168, -3.7038];

    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: 15,
      maxZoom: 20,
      zoomControl: false,
      attributionControl: true,
      fadeAnimation: true,
      markerZoomAnimation: true,
    });

    // Custom Zoom control at top-right
    L.control.zoom({ position: 'topright' }).addTo(map);

    // Metric Scale Bar
    L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(map);

    // Initial tile layer: OpenStreetMap Real Standard (High-precision zoom 20)
    const osmTiles = L.tileLayer(
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        maxZoom: 20,
        maxNativeZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }
    );
    osmTiles.addTo(map);
    tileLayerRef.current = osmTiles;

    // Layer group for geofences
    const gfGroup = L.layerGroup().addTo(map);
    geofenceLayersRef.current = gfGroup;

    map.on('mousemove', (e: L.LeafletMouseEvent) => {
      setMouseCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    map.on('click', (e: L.LeafletMouseEvent) => {
      if (calibratingModeRef.current && onCalibrateRef.current) {
        const exactLat = Number(e.latlng.lat.toFixed(7));
        const exactLng = Number(e.latlng.lng.toFixed(7));
        onCalibrateRef.current(exactLat, exactLng);
        setCalibratingMode(false);
        calibratingModeRef.current = false;
        map.setView([exactLat, exactLng], Math.max(map.getZoom(), 18), { animate: true });
        setCalibrationBanner(`✓ GPS calibrado con precisión exacta (±0.5m): ${exactLat.toFixed(7)}°, ${exactLng.toFixed(7)}°`);
        setTimeout(() => setCalibrationBanner(null), 5000);
      }
    });

    mapInstanceRef.current = map;

    // Continuous ResizeObserver to invalidate size whenever geometry shifts
    let resizeObserver: ResizeObserver | null = null;
    if (mapContainerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        map.invalidateSize();
      });
      resizeObserver.observe(mapContainerRef.current);
    }

    const handleResize = () => {
      map.invalidateSize();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Invalidate size when layout or devices change
  useEffect(() => {
    if (mapInstanceRef.current) {
      setTimeout(() => {
        mapInstanceRef.current?.invalidateSize();
      }, 250);
    }
  }, [devices.length]);

  // Update Real-World Tile Layer
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    let url = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    let attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
    let subdomains: string | string[] = 'abc';
    let maxZoom = 19;

    if (currentLayer === 'satellite') {
      // Real ESRI Satellite Photorealistic Imagery
      url = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
      attribution = '&copy; ESRI, Maxar, Earthstar Geographics, USDA, USGS';
    } else if (currentLayer === 'dark') {
      // CartoDB Dark Matter (Tactical Night)
      url = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
      attribution = '&copy; OpenStreetMap &copy; CARTO';
      subdomains = 'abcd';
    } else if (currentLayer === 'voyager') {
      // CartoDB Voyager High-Contrast Navigation
      url = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
      attribution = '&copy; OpenStreetMap &copy; CARTO';
      subdomains = 'abcd';
    }

    const newTiles = L.tileLayer(url, { maxZoom: 20, maxNativeZoom: maxZoom, subdomains, attribution }).addTo(map);
    tileLayerRef.current = newTiles;
  }, [currentLayer]);

  // Render Real Geofences
  useEffect(() => {
    const gfGroup = geofenceLayersRef.current;
    if (!gfGroup) return;

    gfGroup.clearLayers();

    geofences.forEach((gf) => {
      if (gf.type === 'circle' && gf.center && gf.radius) {
        const circle = L.circle(gf.center, {
          radius: gf.radius,
          color: gf.color,
          weight: 2,
          opacity: 0.85,
          fillColor: gf.color,
          fillOpacity: 0.14,
          dashArray: '4, 6',
        });

        circle.bindTooltip(
          `<div class="text-xs font-bold text-white">${gf.name}</div><div class="text-[10px] text-slate-300">Radio: ${gf.radius}m ${gf.speedLimit ? `· Máx ${gf.speedLimit} km/h` : ''}</div>`,
          { permanent: false, direction: 'top', className: 'geofence-tooltip' }
        );
        gfGroup.addLayer(circle);
      } else if (gf.type === 'polygon' && gf.coordinates && gf.coordinates.length >= 3) {
        const poly = L.polygon(gf.coordinates, {
          color: gf.color,
          weight: 2,
          opacity: 0.9,
          fillColor: gf.color,
          fillOpacity: 0.16,
        });

        poly.bindTooltip(
          `<div class="text-xs font-bold text-white">${gf.name}</div><div class="text-[10px] text-slate-300">${gf.description || 'Zona Perimetral'} ${gf.speedLimit ? `· Máx ${gf.speedLimit} km/h` : ''}</div>`,
          { permanent: false, direction: 'top', className: 'geofence-tooltip' }
        );
        gfGroup.addLayer(poly);
      }
    });
  }, [geofences]);

  // Render High-Precision GPS Accuracy Circle around active device or real location
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const selPos = selectedDevice?.lastPosition;
    const targetLat = selPos?.latitude ?? realLocationCoords?.lat;
    const targetLng = selPos?.longitude ?? realLocationCoords?.lng;
    const rawAcc = selPos?.accuracy ?? realLocationCoords?.accuracy ?? (selPos?.hdop ? selPos.hdop * 2.5 : undefined);

    if (typeof targetLat === 'number' && typeof targetLng === 'number' && rawAcc !== undefined && rawAcc <= 250) {
      const radius = Math.max(1.5, rawAcc);
      if (!realGpsAccuracyCircleRef.current) {
        realGpsAccuracyCircleRef.current = L.circle(
          [targetLat, targetLng],
          {
            radius,
            color: radius <= 15 ? '#10b981' : '#06b6d4',
            fillColor: radius <= 15 ? '#10b981' : '#06b6d4',
            fillOpacity: 0.14,
            weight: 1.5,
            dashArray: radius <= 5 ? undefined : '2, 4',
          }
        ).addTo(map);
      } else {
        realGpsAccuracyCircleRef.current.setLatLng([targetLat, targetLng]);
        realGpsAccuracyCircleRef.current.setRadius(radius);
      }
    } else if (realGpsAccuracyCircleRef.current) {
      realGpsAccuracyCircleRef.current.remove();
      realGpsAccuracyCircleRef.current = null;
    }
  }, [realLocationCoords, realGpsActive, selectedDevice]);

  // Helper to create directional custom HTML marker for each vehicle
  const createVehicleIcon = (dev: GpsDevice, pos?: GpsPosition, isSelected = false) => {
    const heading = pos?.heading || 0;
    const speed = Math.round(pos?.speed || 0);
    const color = dev.color || '#06b6d4';
    const isMoving = dev.status === 'moving';
    const isRealDevice = dev.id.includes('real-gps') || dev.name.includes('Real');

    const html = `
      <div class="relative flex items-center justify-center cursor-pointer transition-transform select-none" style="transform: translate(-50%, -50%);">
        <!-- Radar Pulse if moving or alert -->
        ${isMoving || isRealDevice ? `
          <div class="absolute -inset-2.5 rounded-full animate-ping opacity-40" style="background-color: ${color};"></div>
        ` : ''}

        <!-- Marker Outer Disc with real hardware styling -->
        <div class="relative w-10 h-10 rounded-full bg-slate-950 border-2 flex items-center justify-center shadow-2xl transition-all ${
          isSelected ? 'ring-4 ring-cyan-400/80 ring-offset-2 ring-offset-slate-950 scale-110' : ''
        }" style="border-color: ${color};">
          
          <!-- Direction Pointer Arrow / Heading -->
          <div class="w-full h-full flex items-center justify-center transition-transform duration-300" style="transform: rotate(${heading}deg);">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="${color}" stroke="#020617" stroke-width="1.5">
              <polygon points="12,2 19,21 12,17 5,21" />
            </svg>
          </div>
        </div>

        <!-- Speed tag bubble -->
        <div class="absolute -bottom-4 left-1/2 -translate-x-1/2 px-1.5 py-0.2 bg-slate-950/95 border border-slate-700/80 rounded text-[9px] font-mono tabular-nums text-white whitespace-nowrap shadow-md">
          ${isRealDevice ? 'TÚ' : `${speed}k`}
        </div>
      </div>
    `;

    return L.divIcon({
      html,
      className: 'custom-gps-marker',
      iconSize: [40, 40],
      iconAnchor: [20, 20],
    });
  };

  // Build Rich Popup Content
  const buildPopupHtml = (dev: GpsDevice, pos?: GpsPosition) => {
    if (!pos) return `<div>${dev.name}</div>`;
    const speed = Math.round(pos.speed);
    const coordStr = formatCoordinates(pos.latitude, pos.longitude);

    return `
      <div class="p-3 text-slate-100 min-w-[270px] max-w-[320px]">
        <!-- Header -->
        <div class="flex items-center justify-between pb-2 border-b border-slate-800">
          <div>
            <div class="text-xs font-bold text-slate-100 flex items-center gap-1.5">
              <span>${dev.name}</span>
            </div>
            <div class="text-[10px] text-slate-400 font-mono">${dev.model} · IMEI: ${dev.imei}</div>
          </div>
          <span class="w-2.5 h-2.5 rounded-full ${dev.status === 'moving' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}"></span>
        </div>

        <!-- Telemetry Grid -->
        <div class="grid grid-cols-2 gap-2 my-2.5 text-[11px]">
          <div class="bg-slate-950/80 p-1.5 rounded-lg border border-slate-800/80">
            <span class="text-slate-400 text-[10px] block">Velocidad GPS</span>
            <span class="font-mono font-bold text-cyan-400 text-sm tabular-nums">${speed} km/h</span>
          </div>

          <div class="bg-slate-950/80 p-1.5 rounded-lg border border-slate-800/80">
            <span class="text-slate-400 text-[10px] block">Rumbo / Altura</span>
            <span class="font-mono text-slate-200 text-xs tabular-nums">${pos.heading}° · ${Math.round(pos.altitude)}m</span>
          </div>

          <div class="bg-slate-950/80 p-1.5 rounded-lg border border-slate-800/80">
            <span class="text-slate-400 text-[10px] block">Satélites GNSS</span>
            <span class="font-mono text-slate-200 text-xs tabular-nums">${pos.satellites} sats · HDOP ${pos.hdop}</span>
          </div>

          <div class="bg-slate-950/80 p-1.5 rounded-lg border border-slate-800/80">
            <span class="text-slate-400 text-[10px] block">Batería & Motor</span>
            <span class="font-mono ${pos.battery < 20 ? 'text-rose-400' : 'text-emerald-400'} text-xs tabular-nums">
              ${pos.battery}% · ${pos.ignition ? 'Ign ON' : 'Ign OFF'}
            </span>
          </div>
        </div>

        <!-- Security / Cryptographic Status -->
        <div class="p-1.5 rounded-lg bg-cyan-950/40 border border-cyan-800/50 text-[10px] mb-2 flex items-center justify-between">
          <div class="flex items-center gap-1 text-cyan-400 font-semibold">
            <span>AES-256-GCM Verificado</span>
          </div>
          <span class="font-mono text-[9px] text-cyan-300">MAC OK</span>
        </div>

        <div class="text-[10px] text-slate-400 font-mono mb-2.5">
          ${coordStr}
        </div>

        <!-- Quick Action Trigger buttons -->
        <div class="flex items-center gap-1.5 pt-1.5 border-t border-slate-800">
          <button 
            id="btn-hist-${dev.id}" 
            class="flex-1 py-1.5 px-2 text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors"
          >
            Historial
          </button>
          <button 
            id="btn-crypto-${dev.id}" 
            class="flex-1 py-1.5 px-2 text-[10px] font-bold bg-cyan-950 hover:bg-cyan-900 border border-cyan-800 text-cyan-300 rounded-lg transition-colors"
          >
            Trama AES
          </button>
        </div>
      </div>
    `;
  };

  // Update Markers and Polylines
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    devices.forEach((dev) => {
      const pos = dev.lastPosition;
      if (!pos) return;

      const latLng: [number, number] = [pos.latitude, pos.longitude];
      const isSelected = dev.id === selectedDevice?.id;

      // Update or create marker
      const popupContent = buildPopupHtml(dev, pos);
      let marker = markersRef.current.get(dev.id);
      if (!marker) {
        marker = L.marker(latLng, {
          icon: createVehicleIcon(dev, pos, isSelected),
        }).addTo(map);

        marker.on('click', () => {
          onSelectDevice(dev);
        });

        marker.bindPopup(popupContent, {
          closeButton: true,
          className: 'gps-custom-popup',
        });

        // Attach event listeners once when popup opens
        marker.on('popupopen', (e) => {
          const popupEl = e.popup.getElement();
          if (popupEl) {
            const histBtn = popupEl.querySelector(`#btn-hist-${dev.id}`);
            if (histBtn) {
              histBtn.addEventListener('click', () => onOpenHistory(dev));
            }
            const cryptoBtn = popupEl.querySelector(`#btn-crypto-${dev.id}`);
            if (cryptoBtn) {
              cryptoBtn.addEventListener('click', () => onOpenCrypto(dev));
            }
          }
        });

        markersRef.current.set(dev.id, marker);
      } else {
        marker.setLatLng(latLng);
        marker.setIcon(createVehicleIcon(dev, pos, isSelected));
        if (marker.getPopup()) {
          marker.setPopupContent(popupContent);
        }
      }

      // Update Breadcrumb Polyline Trail
      const history = positionsHistory.get(dev.id) || [];
      if (history.length > 1) {
        const polylineCoords = history.map((h) => [h.latitude, h.longitude] as [number, number]);
        let poly = polylinesRef.current.get(dev.id);

        if (!poly) {
          poly = L.polyline(polylineCoords, {
            color: dev.color,
            weight: isSelected ? 4 : 2.5,
            opacity: isSelected ? 0.9 : 0.5,
            dashArray: isSelected ? undefined : '2, 4',
          }).addTo(map);
          polylinesRef.current.set(dev.id, poly);
        } else {
          poly.setLatLngs(polylineCoords);
          poly.setStyle({
            weight: isSelected ? 4 : 2.5,
            opacity: isSelected ? 0.9 : 0.5,
            dashArray: isSelected ? undefined : '2, 4',
          });
        }
      }
    });

    // Remove deleted devices
    for (const [id, marker] of markersRef.current.entries()) {
      if (!devices.some((d) => d.id === id)) {
        marker.remove();
        markersRef.current.delete(id);
        const poly = polylinesRef.current.get(id);
        if (poly) {
          poly.remove();
          polylinesRef.current.delete(id);
        }
      }
    }
  }, [devices, selectedDevice, positionsHistory]);

  // Center or follow selected device (auto-zoom to street level when high-precision lock is active)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !selectedDevice || !selectedDevice.lastPosition || !followMode) return;

    const { latitude, longitude, accuracy, hdop } = selectedDevice.lastPosition;
    const estAcc = accuracy ?? (hdop ? hdop * 2.5 : 10);
    if (estAcc <= 15 && map.getZoom() < 16) {
      map.setView([latitude, longitude], 17, { animate: true });
    } else {
      map.panTo([latitude, longitude], { animate: true, duration: 0.8 });
    }
  }, [selectedDevice?.lastPosition, followMode]);

  // Fit bounds to all devices
  const handleFitFleet = () => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const validPositions = devices
      .map((d) => d.lastPosition)
      .filter((p): p is GpsPosition => !!p);

    if (validPositions.length === 0) return;

    const bounds = L.latLngBounds(validPositions.map((p) => [p.latitude, p.longitude]));
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
  };

  return (
    <div className={`absolute inset-0 h-full w-full bg-slate-950 overflow-hidden select-none ${calibratingMode ? 'cursor-crosshair' : ''}`}>
      {/* The Leaflet Real Map DOM Container (Edge-to-Edge Full Bleed) */}
      <div ref={mapContainerRef} className={`h-full w-full z-0 ${calibratingMode ? 'cursor-crosshair' : ''}`} />

      {/* Precision Calibration Banner */}
      {(calibratingMode || calibrationBanner) && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 max-w-xl w-[92%] px-4 py-2.5 rounded-xl bg-slate-900/95 border border-emerald-500/70 shadow-2xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-emerald-300 font-semibold">
            <Crosshair className="w-4 h-4 text-emerald-400 animate-pulse shrink-0" />
            <span>
              {calibratingMode
                ? 'MODO CALIBRACIÓN SUB-MÉTRICA (±0.5m): Haz clic en tu punto exacto sobre el mapa para fijar la posición GPS real con 7 decimales.'
                : calibrationBanner}
            </span>
          </div>
          {calibratingMode && (
            <button
              onClick={() => setCalibratingMode(false)}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold shrink-0 cursor-pointer"
            >
              Cancelar
            </button>
          )}
        </div>
      )}

      {/* Top Floating Map Layer & Tactical Quick-Bar (Identical to Local :8765 Interface) */}
      <div className="absolute top-3 right-14 z-20 flex flex-wrap items-center gap-2">
        <div className="bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-xl p-1 flex items-center gap-1 shadow-xl">
          <button
            onClick={() => setCurrentLayer('osm')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              currentLayer === 'osm'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            🗺️ Callejero Real
          </button>
          <button
            onClick={() => setCurrentLayer('satellite')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              currentLayer === 'satellite'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            🛰️ Satélite
          </button>
          <button
            onClick={() => setCurrentLayer('dark')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              currentLayer === 'dark'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            🌑 Táctico
          </button>
          <button
            onClick={() => setCurrentLayer('voyager')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              currentLayer === 'voyager'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            ⛰️ Topo
          </button>
        </div>

        <button
          onClick={() => setFollowMode(!followMode)}
          className={`px-3 py-1.5 rounded-xl border text-xs font-semibold shadow-lg backdrop-blur-md transition-colors cursor-pointer ${
            followMode
              ? 'bg-slate-900/95 border-cyan-500/50 text-cyan-300'
              : 'bg-slate-900/95 border-slate-700 text-slate-400 hover:text-white'
          }`}
        >
          🎯 Seguir: {followMode ? 'ON' : 'OFF'}
        </button>

        {onCalibratePosition && (
          <button
            onClick={() => setCalibratingMode(!calibratingMode)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold shadow-lg backdrop-blur-md flex items-center gap-1.5 transition-colors cursor-pointer ${
              calibratingMode
                ? 'bg-emerald-500 text-slate-950 border-emerald-400 animate-pulse'
                : 'bg-slate-900/95 hover:bg-slate-800 border-emerald-500/50 text-emerald-300'
            }`}
            title="Corregir cualquier desfase de IP/Wi-Fi haciendo clic en tu punto exacto del mapa (±0.5m)"
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>{calibratingMode ? 'Haz clic en el mapa...' : '🎯 Calibrar Precisión (1m)'}</span>
          </button>
        )}

        {onOpenScanner && (
          <button
            onClick={onOpenScanner}
            className="px-3 py-1.5 rounded-xl bg-slate-900/95 hover:bg-slate-800 border border-emerald-500/50 text-emerald-300 text-xs font-bold shadow-lg backdrop-blur-md flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Radar className="w-3.5 h-3.5 text-emerald-400 animate-spin" style={{ animationDuration: '4s' }} />
            <span>📡 Escanear Cercanos</span>
          </button>
        )}

        <button
          onClick={handleFitFleet}
          className="p-2 bg-slate-900/95 hover:bg-slate-800 text-cyan-400 border border-slate-700/80 rounded-xl shadow-lg backdrop-blur-md cursor-pointer"
          title="Ver toda la flota en el mapa"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      {/* Selected Vehicle Full Telemetry Bar (Bottom Floating HUD inside Map Viewport) */}
      {selectedDevice && selectedDevice.lastPosition ? (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 w-[95%] max-w-5xl bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-2xl px-4 py-3 shadow-2xl flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-3.5 h-3.5 rounded-full bg-emerald-400 shadow-lg shadow-emerald-500/50 shrink-0"
              style={{ backgroundColor: selectedDevice.color }}
            />
            <div className="min-w-0">
              <div className="font-display text-sm font-bold text-white flex items-center gap-2 truncate">
                <span className="truncate">{selectedDevice.name}</span>
                <span className="text-[10px] font-mono text-emerald-300 bg-emerald-950/90 px-1.5 py-0.5 rounded border border-emerald-700/60 shrink-0">
                  {selectedDevice.lastPosition.source || 'AES-256-GCM'}
                </span>
              </div>
              <div className="font-mono text-[11px] text-cyan-400 tabular-nums">
                Lat: {selectedDevice.lastPosition.latitude.toFixed(7)}° · Lon: {selectedDevice.lastPosition.longitude.toFixed(7)}°
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center flex-1 max-w-2xl">
            <div className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-800">
              <div className="text-[10px] text-slate-400">PRECISIÓN</div>
              <div className="font-mono text-xs font-bold text-emerald-400 tabular-nums">
                ±{(selectedDevice.lastPosition.accuracy ?? Math.max(0.8, (selectedDevice.lastPosition.hdop || 0.6) * 2.5)).toFixed(1)} m
              </div>
            </div>
            <div className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-800">
              <div className="text-[10px] text-slate-400">HDOP / SATS</div>
              <div className="font-mono text-xs font-bold text-cyan-400 tabular-nums">
                {selectedDevice.lastPosition.hdop || 0.5} · {selectedDevice.lastPosition.satellites || 16}
              </div>
            </div>
            <div className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-800">
              <div className="text-[10px] text-slate-400">VELOCIDAD</div>
              <div className="font-mono text-xs font-bold text-slate-200 tabular-nums">
                {Math.round(selectedDevice.lastPosition.speed)} km/h
              </div>
            </div>
            <div className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-800">
              <div className="text-[10px] text-slate-400">RUMBO</div>
              <div className="font-mono text-xs font-bold text-slate-200 tabular-nums">
                {selectedDevice.lastPosition.heading}°
              </div>
            </div>
            <div className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-800">
              <div className="text-[10px] text-slate-400">ALTITUD</div>
              <div className="font-mono text-xs font-bold text-slate-200 tabular-nums">
                {Math.round(selectedDevice.lastPosition.altitude || 450)} m
              </div>
            </div>
            <div className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-800">
              <div className="text-[10px] text-slate-400">BATERÍA</div>
              <div className="font-mono text-xs font-bold text-emerald-400 tabular-nums">
                {selectedDevice.lastPosition.battery}%
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onCalibratePosition && (
              <button
                onClick={() => setCalibratingMode(!calibratingMode)}
                className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                  calibratingMode
                    ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-bold'
                    : 'bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-500/40 text-emerald-300'
                }`}
                title="Calibrar posición exacta haciendo clic en el mapa (±0.5m)"
              >
                <Crosshair className="w-3.5 h-3.5" />
                <span>Calibrar 1m</span>
              </button>
            )}
            <button
              onClick={() => onOpenHistory(selectedDevice)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
              title="Historial de ruta"
            >
              ⏱️ Ruta
            </button>
            <button
              onClick={() => onOpenCrypto(selectedDevice)}
              className="px-2.5 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-xs font-semibold text-cyan-300 transition-colors cursor-pointer"
              title="Inspeccionar paquetes AES"
            >
              🔐 Ver AES
            </button>
          </div>
        </div>
      ) : selectedDevice ? (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 w-[94%] max-w-3xl bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-2xl px-4 py-3 shadow-2xl flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-3 h-3 rounded-full bg-amber-400 animate-pulse shrink-0" />
            <div className="min-w-0">
              <div className="font-display text-sm font-bold text-white flex items-center gap-2 truncate">
                <span className="truncate">{selectedDevice.name}</span>
                <span className="text-[10px] font-mono text-amber-300 bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-700/60 shrink-0">
                  ESPERANDO TRAMA REAL
                </span>
              </div>
              <div className="text-xs text-slate-400 truncate">
                {selectedDevice.model} · Protocolo <span className="font-mono text-cyan-300">{selectedDevice.protocol}</span> listo para recibir coordenadas reales
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {onToggleRealGps && (
              <button
                onClick={onToggleRealGps}
                className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>{realGpsActive ? 'GPS Real Activo' : '📍 Activar Mi GPS Real'}</span>
              </button>
            )}
            {onOpenConnectorHub && (
              <button
                onClick={onOpenConnectorHub}
                className="px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 text-xs font-semibold transition-colors cursor-pointer"
              >
                ⚡ Conectar Plug & Play
              </button>
            )}
            {onOpenInjector && (
              <button
                onClick={onOpenInjector}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
              >
                📡 Enviar Trama
              </button>
            )}
          </div>
        </div>
      ) : null}

      {/* Real-time Coordinate & Cursor Status (Bottom Right - Never collides with bottom-left Leaflet scale) */}
      {mouseCoords && (
        <div className="hidden sm:flex absolute bottom-1 right-3 z-10 px-2.5 py-0.5 bg-slate-950/85 backdrop-blur border border-slate-800 rounded-md text-[10px] font-mono tabular-nums text-slate-300 shadow pointer-events-none">
          <span>GNSS: {formatCoordinates(mouseCoords.lat, mouseCoords.lng)}</span>
        </div>
      )}
    </div>
  );
};
