'use client';

import { useState, useCallback } from 'react';
import { Search, MapPin, Navigation, RefreshCw, Check, ArrowRight, Compass } from 'lucide-react';
import StoreOpenFreeMap, { BENGALURU_CENTER } from './StoreOpenFreeMap';

interface GeocodeResult {
  name: string;
  displayName: string;
  lat: number;
  lon: number;
  type?: string;
}

interface StoreLocationPickerProps {
  locationValue: string;
  latitudeValue?: number | null;
  longitudeValue?: number | null;
  onChangeLocation: (location: string) => void;
  onChangeCoordinates: (lat: number | null, lng: number | null) => void;
  disabled?: boolean;
  error?: string;
  mapHeight?: string;
}

export default function StoreLocationPicker({
  locationValue,
  latitudeValue,
  longitudeValue,
  onChangeLocation,
  onChangeCoordinates,
  disabled = false,
  error,
  mapHeight = '500px',
}: StoreLocationPickerProps) {
  const [isSearching, setIsSearching] = useState(false);
  const [searchFeedback, setSearchFeedback] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<GeocodeResult[]>([]);
  const [showResultsDropdown, setShowResultsDropdown] = useState(false);

  // Convert text location to Longitude & Latitude using OpenStreetMap / OpenFreeMap geocoding
  const handleConvertLocation = async (customQuery?: string) => {
    const query = (customQuery ?? locationValue).trim();
    if (!query) {
      setSearchFeedback('Please enter a location name or area first.');
      return;
    }

    setIsSearching(true);
    setSearchFeedback(null);
    setShowResultsDropdown(false);

    try {
      const res = await fetch(`/api/admin/geocode?q=${encodeURIComponent(query)}`);
      if (!res.ok) {
        throw new Error('Geocoding service unavailable');
      }

      const data = await res.json();
      const results: GeocodeResult[] = data.results || [];

      if (results.length > 0) {
        setSearchResults(results);

        // Pick top result
        const top = results[0];
        const lat = parseFloat(top.lat.toFixed(6));
        const lng = parseFloat(top.lon.toFixed(6));

        onChangeCoordinates(lat, lng);

        if (results.length > 1) {
          setShowResultsDropdown(true);
          setSearchFeedback(`Located: ${top.name}. (${results.length} matches in Bengaluru)`);
        } else {
          setSearchFeedback(`Successfully converted to Long: ${lng}, Lat: ${lat}`);
        }
      } else {
        // Fallback to Bengaluru center
        onChangeCoordinates(BENGALURU_CENTER.lat, BENGALURU_CENTER.lng);
        setSearchFeedback('Location not found. Placed pin at Bengaluru center.');
      }
    } catch (err: any) {
      console.warn('Geocode lookup failed:', err);
      setSearchFeedback('Could not resolve location. You can click on the map to set the pin.');
    } finally {
      setIsSearching(false);
    }
  };

  // Called when user selects a candidate from the search results dropdown
  const handleSelectResult = (item: GeocodeResult) => {
    const lat = parseFloat(item.lat.toFixed(6));
    const lng = parseFloat(item.lon.toFixed(6));
    onChangeCoordinates(lat, lng);
    setShowResultsDropdown(false);
    setSearchFeedback(`Pinned to: ${item.name} (${lat}, ${lng})`);
  };

  // Called when pin moves on the map
  const handleMapCoordinateChange = useCallback(
    (lat: number, lng: number) => {
      onChangeCoordinates(lat, lng);
    },
    [onChangeCoordinates],
  );

  // Called when map reverse geocodes a clicked point
  const handleReverseGeocode = useCallback(
    (shortLocation: string) => {
      if (!locationValue || locationValue.trim().length === 0) {
        onChangeLocation(shortLocation);
      }
    },
    [locationValue, onChangeLocation],
  );

  return (
    <div className="space-y-4">
      {/* Location Input & Geocode Conversion Bar */}
      <div>
        <label htmlFor="store-location" className="block text-sm font-semibold text-ink mb-1.5">
          Store Location
        </label>
        <div className="relative">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                id="store-location"
                type="text"
                value={locationValue}
                disabled={disabled}
                placeholder="e.g. 100 Feet Rd, Indiranagar, Bengaluru"
                onChange={(e) => {
                  onChangeLocation(e.target.value);
                  if (searchFeedback) setSearchFeedback(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleConvertLocation();
                  }
                }}
                className={`w-full rounded-md border ${
                  error ? 'border-state-error' : 'border-line-strong'
                } bg-paper px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-muted/50 focus:border-ink focus:outline-none transition-colors`}
              />
            </div>

            <button
              type="button"
              disabled={disabled || isSearching || !locationValue.trim()}
              onClick={() => handleConvertLocation()}
              className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2.5 text-xs font-semibold text-paper-raised hover:bg-ink/85 disabled:opacity-50 transition-all shadow-sm"
              title="Convert location to Longitude, Latitude and show on Bengaluru map"
            >
              {isSearching ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Compass className="h-3.5 w-3.5" />
              )}
              <span>{isSearching ? 'Converting…' : 'Convert to Long,Lat'}</span>
            </button>
          </div>

          {/* Multiple Matches Suggestions Dropdown */}
          {showResultsDropdown && searchResults.length > 1 && (
            <div className="absolute left-0 right-0 top-full mt-1.5 z-20 rounded-lg border border-line bg-paper p-1 shadow-lg max-h-48 overflow-y-auto">
              <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-ink-muted border-b border-line">
                Select matching place in Bengaluru:
              </div>
              {searchResults.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectResult(item)}
                  className="w-full text-left px-2.5 py-1.5 text-xs text-ink hover:bg-paper-raised rounded flex items-center justify-between gap-2 transition-colors"
                >
                  <span className="truncate font-medium">{item.displayName}</span>
                  <span className="font-mono text-[10px] text-ink-muted shrink-0">
                    {item.lon.toFixed(4)}, {item.lat.toFixed(4)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {error && <p className="mt-1.5 text-xs text-state-error">{error}</p>}
        {searchFeedback && (
          <p className="mt-1.5 text-xs text-ink-muted flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5 text-state-ok" />
            <span>{searchFeedback}</span>
          </p>
        )}
      </div>

      {/* OpenFreeMap Interactive Map (Bengaluru Centered) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-ink-muted">
          <span className="font-semibold uppercase tracking-wider text-[11px]">
            OpenFreeMap • Bengaluru Store Map
          </span>
          <span className="text-[11px]">Click map or drag marker to set exact venue coordinates</span>
        </div>

        <StoreOpenFreeMap
          latitude={latitudeValue}
          longitude={longitudeValue}
          onChangeCoordinates={handleMapCoordinateChange}
          onReverseGeocode={handleReverseGeocode}
          interactive={!disabled}
          height={mapHeight}
        />
      </div>

      {/* Coordinates Attributes Display / Manual Inputs */}
      <div className="rounded-lg border border-line bg-paper-raised/40 p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                Longitude (Lng)
              </span>
              <span className="font-mono text-xs font-semibold text-ink">
                {longitudeValue != null ? Number(longitudeValue).toFixed(6) : 'Not set (77.5946 BLR)'}
              </span>
            </div>

            <div className="h-6 w-px bg-line" />

            <div>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                Latitude (Lat)
              </span>
              <span className="font-mono text-xs font-semibold text-ink">
                {latitudeValue != null ? Number(latitudeValue).toFixed(6) : 'Not set (12.9716 BLR)'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                onChangeCoordinates(BENGALURU_CENTER.lat, BENGALURU_CENTER.lng);
                setSearchFeedback('Reset to central Bengaluru coordinates (12.9716, 77.5946).');
              }}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-muted hover:text-ink transition-colors"
            >
              <Navigation className="h-3 w-3" />
              <span>Reset to Bengaluru Center</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
