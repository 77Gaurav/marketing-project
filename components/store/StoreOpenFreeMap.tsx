'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { MapPin, Navigation, RefreshCw, ZoomIn, ZoomOut, Check, Layers } from 'lucide-react';
import 'maplibre-gl/dist/maplibre-gl.css';

// Default Center: Bengaluru, Karnataka, India
export const BENGALURU_CENTER = {
  lng: 77.5946,
  lat: 12.9716,
  zoom: 12,
};

// OpenFreeMap vector tile style endpoints
export const OPENFREEMAP_STYLES = {
  liberty: 'https://tiles.openfreemap.org/styles/liberty',
  bright: 'https://tiles.openfreemap.org/styles/bright',
  positron: 'https://tiles.openfreemap.org/styles/positron',
};

export interface MapStoreItem {
  id: string;
  name: string;
  slug?: string;
  location?: string;
  latitude?: number | null;
  longitude?: number | null;
  screenCount?: number;
  status?: string;
}

interface StoreOpenFreeMapProps {
  latitude?: number | null;
  longitude?: number | null;
  onChangeCoordinates?: (lat: number, lng: number) => void;
  onReverseGeocode?: (shortLocation: string, fullAddress: string) => void;
  interactive?: boolean;
  height?: string;
  storeName?: string;
  storeLocation?: string;
  stores?: MapStoreItem[];
  selectedStoreId?: string;
  onSelectStore?: (storeId: string) => void;
  showRecenterButton?: boolean;
  className?: string;
}

export default function StoreOpenFreeMap({
  latitude,
  longitude,
  onChangeCoordinates,
  onReverseGeocode,
  interactive = true,
  height = '500px',
  storeName,
  storeLocation,
  stores,
  selectedStoreId,
  onSelectStore,
  showRecenterButton = true,
  className = '',
}: StoreOpenFreeMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const singleMarkerRef = useRef<any>(null);
  const multiMarkersRef = useRef<any[]>([]);
  const isMapLoadedRef = useRef(false);

  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number } | null>(
    latitude && longitude ? { lat: Number(latitude), lng: Number(longitude) } : null,
  );
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
  const [activeStyle, setActiveStyle] = useState<'liberty' | 'bright' | 'positron'>('liberty');

  // Keep local coords in sync when props change from external source (e.g. Geocode search)
  useEffect(() => {
    if (latitude != null && longitude != null) {
      const lat = Number(latitude);
      const lng = Number(longitude);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        setCurrentCoords({ lat, lng });
        if (mapRef.current && isMapLoadedRef.current) {
          if (singleMarkerRef.current) {
            singleMarkerRef.current.setLngLat([lng, lat]);
          }
          mapRef.current.flyTo({ center: [lng, lat], zoom: 14, essential: true });
        }
      }
    }
  }, [latitude, longitude]);

  // Reverse geocode coordinates to human-readable address
  const handleReverseGeocode = useCallback(
    async (lat: number, lng: number) => {
      if (!onReverseGeocode) return;
      setIsReverseGeocoding(true);
      try {
        const res = await fetch(`/api/admin/geocode?lat=${lat}&lon=${lng}`);
        if (res.ok) {
          const data = await res.json();
          if (data.shortLocation || data.displayName) {
            onReverseGeocode(data.shortLocation || data.displayName, data.displayName);
          }
        }
      } catch (err) {
        console.warn('Reverse geocode failed:', err);
      } finally {
        setIsReverseGeocoding(false);
      }
    },
    [onReverseGeocode],
  );

  // Initialize MapLibre GL instance
  useEffect(() => {
    if (!mapContainerRef.current) return;

    let cancelled = false;

    async function initMap() {
      try {
        const maplibregl = await import('maplibre-gl');

        if (cancelled || !mapContainerRef.current) return;

        // Configure MapLibre web worker for Next.js bundler
        if (typeof window !== 'undefined') {
          try {
            const workerUrl = `${window.location.origin}/maplibre-gl-worker.mjs`;
            maplibregl.setWorkerUrl(workerUrl);
          } catch {
            maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs');
          }
        }

        // Initial center: if coordinates provided, center there; otherwise center on Bengaluru
        const initialCenter: [number, number] =
          latitude != null && longitude != null
            ? [Number(longitude), Number(latitude)]
            : [BENGALURU_CENTER.lng, BENGALURU_CENTER.lat];

        const initialZoom = latitude != null && longitude != null ? 14 : BENGALURU_CENTER.zoom;

        const map = new maplibregl.Map({
          container: mapContainerRef.current,
          style: OPENFREEMAP_STYLES[activeStyle],
          center: initialCenter,
          zoom: initialZoom,
          minZoom: 3,
          maxZoom: 19,
          attributionControl: false,
        });

        mapRef.current = map;

        // Add standard navigation controls
        map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
        map.addControl(
          new maplibregl.AttributionControl({
            customAttribution: '© OpenFreeMap • OpenStreetMap',
            compact: true,
          }),
          'bottom-right',
        );

        let setupDone = false;
        const setupMapEntities = () => {
          if (setupDone || cancelled) return;
          setupDone = true;
          isMapLoadedRef.current = true;
          setMapLoaded(true);
          try {
            map.resize();
          } catch {}

          // 1. Single Store Mode
          if (!stores || stores.length === 0) {
            const el = document.createElement('div');
            el.className = 'st-map-marker';
            el.innerHTML = `
              <div style="background-color: #111; color: #fff; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.3); border: 2px solid #fff; cursor: grab;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
              </div>
            `;

            const marker = new maplibregl.Marker({
              element: el,
              draggable: interactive,
            })
              .setLngLat(initialCenter)
              .addTo(map);

            singleMarkerRef.current = marker;

            if (interactive) {
              marker.on('dragend', () => {
                const lngLat = marker.getLngLat();
                const lat = parseFloat(lngLat.lat.toFixed(6));
                const lng = parseFloat(lngLat.lng.toFixed(6));
                setCurrentCoords({ lat, lng });
                onChangeCoordinates?.(lat, lng);
                handleReverseGeocode(lat, lng);
              });

              map.on('click', (e: any) => {
                const lat = parseFloat(e.lngLat.lat.toFixed(6));
                const lng = parseFloat(e.lngLat.lng.toFixed(6));
                marker.setLngLat([lng, lat]);
                setCurrentCoords({ lat, lng });
                onChangeCoordinates?.(lat, lng);
                handleReverseGeocode(lat, lng);
              });
            }

            if (storeName) {
              const popup = new maplibregl.Popup({ offset: 25 }).setHTML(`
                <div style="padding: 4px; font-family: sans-serif;">
                  <strong style="font-size: 13px; color: #111;">${storeName}</strong>
                  ${storeLocation ? `<div style="font-size: 11px; color: #666; margin-top: 2px;">${storeLocation}</div>` : ''}
                  <div style="font-size: 10px; color: #888; margin-top: 4px; font-family: monospace;">${initialCenter[1].toFixed(4)}, ${initialCenter[0].toFixed(4)}</div>
                </div>
              `);
              marker.setPopup(popup);
            }
          }

          // 2. Multi-Store Directory Mode
          if (stores && stores.length > 0) {
            renderMultiStores(map, maplibregl, stores);
          }
        };

        map.on('load', setupMapEntities);
        map.on('style.load', setupMapEntities);
        map.on('error', (err) => {
          console.warn('[OpenFreeMap] Map error:', err);
        });

        // Failsafe timer: ensure spinner disappears within 2 seconds
        setTimeout(() => {
          if (!cancelled && !setupDone) {
            setupMapEntities();
          }
        }, 1800);
      } catch (err: any) {
        console.error('Failed to load OpenFreeMap map:', err);
        setMapError(err?.message || 'Failed to initialize map');
      }
    }

    initMap();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        isMapLoadedRef.current = false;
      }
    };
  }, []);

  // Update multi-store markers when stores prop changes
  const renderMultiStores = async (map: any, maplibregl: any, storeList: MapStoreItem[]) => {
    // Clear existing multi markers
    multiMarkersRef.current.forEach((m) => m.remove());
    multiMarkersRef.current = [];

    const bounds = new maplibregl.LngLatBounds();
    let hasCoords = false;

    storeList.forEach((st) => {
      const lat = st.latitude ? Number(st.latitude) : null;
      const lng = st.longitude ? Number(st.longitude) : null;

      // Fallback for stores without coordinates: omit or default near Bengaluru
      if (lat == null || lng == null) return;

      hasCoords = true;
      bounds.extend([lng, lat]);

      const isSelected = st.id === selectedStoreId;

      const el = document.createElement('div');
      el.className = 'st-store-pin';
      el.innerHTML = `
        <div style="
          background-color: ${isSelected ? '#000' : '#1e293b'};
          color: #fff;
          padding: 4px 8px;
          border-radius: 9999px;
          font-size: 11px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 4px;
          box-shadow: 0 4px 10px rgba(0,0,0,0.25);
          border: 2px solid ${isSelected ? '#3b82f6' : '#fff'};
          cursor: pointer;
          white-space: nowrap;
          transform: translateY(-50%);
        ">
          <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background-color: ${st.status === 'ACTIVE' ? '#10b981' : st.status === 'PENDING' || st.status === 'PENDING_REVIEW' ? '#f59e0b' : '#ef4444'};"></span>
          <span>${st.name}</span>
          ${st.screenCount ? `<span style="opacity: 0.75; font-size: 10px;">(${st.screenCount}s)</span>` : ''}
        </div>
      `;

      el.addEventListener('click', () => {
        onSelectStore?.(st.id);
        map.flyTo({ center: [lng, lat], zoom: 15 });
      });

      const popup = new maplibregl.Popup({ offset: 15 }).setHTML(`
        <div style="padding: 6px; font-family: sans-serif;">
          <strong style="font-size: 13px; color: #111;">${st.name}</strong>
          ${st.location ? `<div style="font-size: 11px; color: #555; margin-top: 2px;">${st.location}</div>` : ''}
          <div style="font-size: 10px; color: #0284c7; margin-top: 4px; font-family: monospace;">
            Long: ${lng.toFixed(5)}, Lat: ${lat.toFixed(5)}
          </div>
        </div>
      `);

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([lng, lat])
        .setPopup(popup)
        .addTo(map);

      multiMarkersRef.current.push(marker);
    });

    if (hasCoords && !selectedStoreId) {
      map.fitBounds(bounds, { padding: 50, maxZoom: 14 });
    }
  };

  // Recenter on Bengaluru
  const handleRecenterBengaluru = () => {
    if (!mapRef.current) return;
    mapRef.current.flyTo({
      center: [BENGALURU_CENTER.lng, BENGALURU_CENTER.lat],
      zoom: BENGALURU_CENTER.zoom,
      essential: true,
    });
  };

  // Switch OpenFreeMap style
  const handleSwitchStyle = (style: 'liberty' | 'bright' | 'positron') => {
    setActiveStyle(style);
    if (mapRef.current) {
      mapRef.current.setStyle(OPENFREEMAP_STYLES[style]);
    }
  };

  return (
    <div className={`relative overflow-hidden rounded-xl border border-line bg-paper ${className}`}>
      {/* Map Canvas Container */}
      <div ref={mapContainerRef} style={{ width: '100%', height }} className="z-0" />

      {/* Loading Overlay */}
      {!mapLoaded && !mapError && (
        <div className="absolute inset-0 flex items-center justify-center bg-paper/80 backdrop-blur-xs z-10">
          <div className="flex items-center gap-2.5 text-xs font-semibold text-ink-muted">
            <RefreshCw className="h-4 w-4 animate-spin text-ink" />
            <span>Loading OpenFreeMap Bengaluru…</span>
          </div>
        </div>
      )}

      {/* Error Message */}
      {mapError && (
        <div className="absolute inset-0 flex items-center justify-center bg-paper/95 p-4 z-10 text-center">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-state-error">Could not load map tile server.</p>
            <p className="text-[11px] text-ink-muted">{mapError}</p>
          </div>
        </div>
      )}

      {/* Top Floating Control Bar */}
      <div className="absolute top-3 left-3 right-14 flex items-center justify-between pointer-events-none z-10">
        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Coordinates Tag */}
          {currentCoords && (
            <div className="inline-flex items-center gap-1.5 rounded-pill bg-ink/90 backdrop-blur-md px-3 py-1.5 text-xs font-medium text-paper-raised shadow-md">
              <MapPin className="h-3 w-3 text-state-ok" />
              <span className="font-mono text-[11px]">
                {currentCoords.lat.toFixed(5)}, {currentCoords.lng.toFixed(5)}
              </span>
              {isReverseGeocoding && <RefreshCw className="h-2.5 w-2.5 animate-spin ml-1 text-ink-muted" />}
            </div>
          )}

          {/* Bengaluru City Badge */}
          <div className="hidden sm:inline-flex items-center gap-1.5 rounded-pill bg-paper/90 backdrop-blur-md border border-line px-2.5 py-1 text-[11px] font-semibold text-ink-muted shadow-sm">
            <span>Bengaluru (BLR)</span>
          </div>
        </div>

        {/* Style Selector */}
        <div className="pointer-events-auto flex items-center bg-paper/90 backdrop-blur-md border border-line rounded-pill p-0.5 shadow-sm">
          {(['liberty', 'bright', 'positron'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => handleSwitchStyle(s)}
              className={`px-2 py-0.5 text-[10px] font-semibold rounded-pill uppercase transition-colors ${
                activeStyle === s
                  ? 'bg-ink text-paper-raised'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Bottom Floating Controls */}
      <div className="absolute bottom-3 left-3 flex items-center gap-2 z-10">
        {showRecenterButton && (
          <button
            type="button"
            onClick={handleRecenterBengaluru}
            className="inline-flex items-center gap-1.5 rounded-pill bg-paper/90 backdrop-blur-md border border-line px-3 py-1.5 text-xs font-semibold text-ink shadow-sm hover:border-ink transition-colors"
            title="Recenter on Bengaluru"
          >
            <Navigation className="h-3.5 w-3.5" />
            <span>Bengaluru Center</span>
          </button>
        )}

        {interactive && (
          <span className="hidden md:inline-block rounded-pill bg-paper/90 backdrop-blur-md border border-line px-2.5 py-1 text-[10px] font-medium text-ink-muted shadow-sm">
            Click map or drag pin to adjust coordinates
          </span>
        )}
      </div>

      {/* Bottom Right OpenFreeMap Badge */}
      <div className="absolute bottom-1 right-24 pointer-events-none z-10">
        <span className="text-[10px] text-ink-muted/70 font-mono bg-paper/70 px-1 rounded">
          OpenFreeMap
        </span>
      </div>
    </div>
  );
}
