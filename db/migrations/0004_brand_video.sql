-- Add video storage fields to brands for uploaded videos
ALTER TABLE brands ADD COLUMN IF NOT EXISTS video_url text;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS video_key text;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS video_bucket text;
