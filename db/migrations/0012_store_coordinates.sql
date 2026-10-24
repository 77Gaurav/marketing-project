-- Migration 0012: Store Coordinates (Latitude & Longitude)
-- Adds geographic coordinates to stores for mapping and location resolution (e.g. OpenFreeMap).

ALTER TABLE stores ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS longitude double precision;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS coordinates jsonb;

-- Range checks for standard GPS WGS84 coordinates:
-- Latitude: -90.0 to 90.0
-- Longitude: -180.0 to 180.0
ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_latitude_range_chk;
ALTER TABLE stores ADD CONSTRAINT stores_latitude_range_chk CHECK (
  latitude IS NULL OR (latitude >= -90.0 AND latitude <= 90.0)
);

ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_longitude_range_chk;
ALTER TABLE stores ADD CONSTRAINT stores_longitude_range_chk CHECK (
  longitude IS NULL OR (longitude >= -180.0 AND longitude <= 180.0)
);

CREATE INDEX IF NOT EXISTS stores_lat_lng_idx ON stores (latitude, longitude);
