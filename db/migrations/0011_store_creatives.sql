-- Migration 0011: Store Custom Creatives (images & videos: png, jpeg, jpg, mp4, mkv)
-- Adds storage fields to stores table and creates store_creatives collection table

-- 1. Store-level creative fields (mirroring brand video pattern)
ALTER TABLE stores ADD COLUMN IF NOT EXISTS creative_url text;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS creative_key text;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS creative_bucket text;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS creative_type text;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS video_url text;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS video_key text;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS video_bucket text;

-- 2. Store custom creatives table for storing multiple creatives or versioned assets
CREATE TABLE IF NOT EXISTS store_creatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
  name text NOT NULL,
  mime_type text NOT NULL,
  file_size bigint,
  s3_bucket text NOT NULL,
  s3_key text NOT NULL,
  url text NOT NULL,
  status text NOT NULL DEFAULT 'UPLOADED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS store_creatives_store_id_idx ON store_creatives (store_id);
CREATE INDEX IF NOT EXISTS store_creatives_created_at_idx ON store_creatives (created_at DESC);
