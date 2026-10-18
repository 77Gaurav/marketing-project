-- String Theory — player devices (Raspberry Pi display hardware).
--
-- Adds `devices` table to support activation, authentication, and heartbeats for physical screen
-- players running on Raspberry Pi hardware across the venue network.

DO $$ BEGIN
  CREATE TYPE device_status AS ENUM ('PENDING', 'ACTIVATED', 'REVOKED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS devices (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id        text NOT NULL,
  activation_code  text,
  status           device_status NOT NULL DEFAULT 'ACTIVATED',
  store_id         uuid REFERENCES stores (id) ON DELETE SET NULL,
  access_token     text,
  last_seen_at     timestamptz,
  activated_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT devices_device_id_blank_chk CHECK (btrim(device_id) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS devices_device_id_key ON devices (device_id);
CREATE INDEX IF NOT EXISTS devices_activation_code_idx ON devices (activation_code);
CREATE INDEX IF NOT EXISTS devices_access_token_idx ON devices (access_token);
CREATE INDEX IF NOT EXISTS devices_store_id_idx ON devices (store_id);
CREATE INDEX IF NOT EXISTS devices_status_idx ON devices (status);

DROP TRIGGER IF EXISTS devices_set_updated_at ON devices;
CREATE TRIGGER devices_set_updated_at BEFORE UPDATE ON devices
  FOR EACH ROW EXECUTE FUNCTION st_set_updated_at();
