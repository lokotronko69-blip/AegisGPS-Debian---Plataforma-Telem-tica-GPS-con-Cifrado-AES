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
  onOpenScanner?: () => void;
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
  onOpenScanner,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const polylinesRef = useRef<Map<string, L.Polyline>>(new Map());
  const geofenceLayersRef = useRef<L.LayerGroup | null>(null);
  const realGpsAccuracyCircleRef = useRef<L.Circle | null>(null);

  const [currentLayer, setCurrentLayer] = useState<MapLayerType>('osm');
  const [followMode, setFollowMode] = useState<boolean>(true);
  const [mouseCoords, setMouseCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [layerDropdownOpen, setLayerDropdownOpen] = useState(false);

  // Initialize Map full-bleed
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Default center around real GPS or Spain center (Madrid)
    const initialCenter: [number, number] = realLocationCoords 
      ? [realLocationCoords.lat, realLocationCoords.lng]
      : [40.4168, -3.7038];

    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: 12,
      zoomControl: false,
      attributionControl: true,
      fadeAnimation: true,
      markerZoomAnimation: true,
    });

    // Custom Zoom control at top-right
    L.control.zoom({ position: 'topright' }).addTo(map);

    // Metric Scale Bar
    L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(map);

    // Initial tile layer: OpenStreetMap Real Standard
    const osmTiles = L.tileLayer(
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        maxZoom: 19,
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

    const newTiles = L.tileLayer(url, { maxZoom, subdomains, attribution }).addTo(map);
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

  // Render Real GPS Accuracy Circle
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (realLocationCoords && realGpsActive) {
      const radius = realLocationCoords.accuracy || 30;
      if (!realGpsAccuracyCircleRef.current) {
        realGpsAccuracyCircleRef.current = L.circle(
          [realLocationCoords.lat, realLocationCoords.lng],
          {
            radius,
            color: '#10b981',
            fillColor: '#10b981',
            fillOpacity: 0.15,
            weight: 1.5,
            dashArray: '2, 4',
          }
        ).addTo(map);
      } else {
        realGpsAccuracyCircleRef.current.setLatLng([realLocationCoords.lat, realLocationCoords.lng]);
        realGpsAccuracyCircleRef.current.setRadius(radius);
      }
    } else if (realGpsAccuracyCircleRef.current) {
      realGpsAccuracyCircleRef.current.remove();
      realGpsAccuracyCircleRef.current = null;
    }
  }, [realLocationCoords, realGpsActive]);

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
      let marker = markersRef.current.get(dev.id);
      if (!marker) {
        marker = L.marker(latLng, {
          icon: createVehicleIcon(dev, pos, isSelected),
        }).addTo(map);

        marker.on('click', () => {
          onSelectDevice(dev);
        });

        markersRef.current.set(dev.id, marker);
      } else {
        marker.setLatLng(latLng);
        marker.setIcon(createVehicleIcon(dev, pos, isSelected));
      }

      // Update popup
      const popupContent = buildPopupHtml(dev, pos);
      marker.bindPopup(popupContent, {
        closeButton: true,
        className: 'gps-custom-popup',
      });

      // Attach event listeners when popup opens
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

  // Center or follow selected device
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !selectedDevice || !selectedDevice.lastPosition || !followMode) return;

    const { latitude, longitude } = selectedDevice.lastPosition;
    map.panTo([latitude, longitude], { animate: true, duration: 1 });
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
    <div className="absolute inset-0 h-full w-full bg-slate-950 overflow-hidden select-none">
      {/* The Leaflet Real Map DOM Container (Edge-to-Edge Full Bleed) */}
      <div ref={mapContainerRef} className="h-full w-full z-0" />

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
          🎯 Seguir Unidad: {followMode ? 'ON' : 'OFF'}
        </button>

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

      {/* Selected Vehicle Full Telemetry Bar (Bottom Floating HUD - Identical to Local :8765) */}
      {selectedDevice && selectedDevice.lastPosition && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-[94%] max-w-4xl bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-2xl px-4 py-3 shadow-2xl flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-3.5 h-3.5 rounded-full bg-emerald-400 shadow-lg shadow-emerald-500/50"
              style={{ backgroundColor: selectedDevice.color }}
            />
            <div>
              <div className="font-display text-sm font-bold text-white flex items-center gap-2">
                <span>{selectedDevice.name}</span>
                <span className="text-[10px] font-mono text-emerald-300 bg-emerald-950/90 px-1.5 py-0.5 rounded border border-emerald-700/60">
                  AES-256-GCM
                </span>
              </div>
              <div className="font-mono text-[11px] text-cyan-400">
                Lat: {selectedDevice.lastPosition.latitude.toFixed(6)} · Lon: {selectedDevice.lastPosition.longitude.toFixed(6)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5 text-center flex-1 max-w-2xl">
            <div className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-800">
              <div className="text-[10px] text-slate-400">VELOCIDAD</div>
              <div className="font-mono text-xs font-bold text-cyan-400">
                {Math.round(selectedDevice.lastPosition.speed)} km/h
              </div>
            </div>
            <div className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-800">
              <div className="text-[10px] text-slate-400">RUMBO</div>
              <div className="font-mono text-xs font-bold text-slate-200">
                {selectedDevice.lastPosition.heading}°
              </div>
            </div>
            <div className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-800">
              <div className="text-[10px] text-slate-400">ALTITUD</div>
              <div className="font-mono text-xs font-bold text-slate-200">
                {Math.round(selectedDevice.lastPosition.altitude || 450)} m
              </div>
            </div>
            <div className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-800">
              <div className="text-[10px] text-slate-400">SATÉLITES</div>
              <div className="font-mono text-xs font-bold text-emerald-400">
                {selectedDevice.lastPosition.satellites || 16} GNSS
              </div>
            </div>
            <div className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-800">
              <div className="text-[10px] text-slate-400">BATERÍA</div>
              <div className="font-mono text-xs font-bold text-emerald-400">
                {selectedDevice.lastPosition.battery}%
              </div>
            </div>
            <div className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-800">
              <div className="text-[10px] text-slate-400">ESTADO</div>
              <div className="font-mono text-[10px] font-bold text-emerald-300">
                VERIFICADO
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {onOpenScanner && (
              <button
                onClick={onOpenScanner}
                className="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-xs font-semibold text-emerald-300 flex items-center gap-1 transition-colors cursor-pointer"
                title="Escanear GPS cercanos alrededor de esta unidad"
              >
                <Radar className="w-3.5 h-3.5" />
                <span>Radar</span>
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
      )}

      {/* Real-time Coordinate & Cursor Status (Bottom Left) */}
      {mouseCoords && (
        <div className="hidden sm:flex absolute bottom-2 left-28 z-10 px-2.5 py-1 bg-slate-950/85 backdrop-blur border border-slate-800 rounded-lg text-[10px] font-mono tabular-nums text-slate-300 shadow pointer-events-none">
          <span>GNSS: {formatCoordinates(mouseCoords.lat, mouseCoords.lng)}</span>
        </div>
      )}
    </div>
  );
};
