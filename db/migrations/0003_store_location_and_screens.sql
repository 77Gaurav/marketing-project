-- String Theory — store location and screen count.
--
-- `stores` was created empty in 0001 as a target for role-based access and the discovery flow, and
-- nothing in this repository wrote to it. The admin console is the first writer, and an operator
-- looking at the network needs two facts per venue: where it is, and how much inventory it
-- contributes. Both become columns here rather than being inferred from a trading name later.
--
-- `location` is free text rather than a set of address columns on purpose. Venues are described by
-- "third floor, by the escalators" about as often as by a postcode, and forcing that into
-- address/city/postcode would discard the half a human actually reads. It is normalisable when
-- something first needs to query by geography.
--
-- `screen_count` is a declared inventory figure rather than a count of rows, because there is no
-- `screens` table yet: the network's supply is an attribute of the venue. The moment an individual
-- screen needs its own identity — resolution, orientation, a per-screen schedule — that table gets
-- created and this column becomes a denormalised total for it to keep in step.

ALTER TABLE stores ADD COLUMN IF NOT EXISTS location text NOT NULL DEFAULT '';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS screen_count integer NOT NULL DEFAULT 0;

-- The DEFAULT on `location` is deliberate and stays: it keeps this statement safe to apply to a table
-- that already holds rows, and the blank check below then refuses any insert that forgets the value.
-- An insert can no longer omit the column and land a venue with no location.
ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_location_blank_chk;
ALTER TABLE stores ADD CONSTRAINT stores_location_blank_chk CHECK (btrim(location) <> '');

-- Upper bound as well as lower. A venue with a six-figure screen count is a typo, and letting it in
-- would quietly distort every network total derived from this column.
ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_screen_count_range_chk;
ALTER TABLE stores ADD CONSTRAINT stores_screen_count_range_chk CHECK (
  screen_count >= 0 AND screen_count <= 100000
);

-- The console ranks the network by inventory far more often than it looks a venue up by name, and
-- does it on every page load, so both access paths get an index.
CREATE INDEX IF NOT EXISTS stores_screen_count_idx ON stores (screen_count DESC);
CREATE INDEX IF NOT EXISTS stores_location_idx ON stores (location);
