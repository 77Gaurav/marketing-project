-- Migration 0010: Store campaign targeting and device task event journal for delta polling

-- 1. Campaign to store targeting assignment
CREATE TABLE IF NOT EXISTS campaign_stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
  plays_per_hour integer NOT NULL DEFAULT 10,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'DEACTIVATED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_stores_unique UNIQUE (campaign_id, store_id)
);

CREATE INDEX IF NOT EXISTS campaign_stores_store_idx ON campaign_stores (store_id);
CREATE INDEX IF NOT EXISTS campaign_stores_campaign_idx ON campaign_stores (campaign_id);

-- 2. Store task event stream with strictly monotonic revision counter
CREATE TABLE IF NOT EXISTS store_task_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision BIGSERIAL,
  store_id uuid NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
  task_id text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  action text NOT NULL CHECK (action IN ('UPSERT', 'DEACTIVATE', 'DELETE')),
  status text DEFAULT 'ACTIVE',
  creative_id text,
  s3_bucket text,
  s3_key text,
  plays_per_hour integer DEFAULT 10,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS store_task_events_store_revision_idx ON store_task_events (store_id, revision);
CREATE INDEX IF NOT EXISTS store_task_events_revision_idx ON store_task_events (revision);
CREATE INDEX IF NOT EXISTS store_task_events_task_idx ON store_task_events (store_id, task_id);
