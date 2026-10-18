-- Adds `device_credential` column to `devices` table for automatic player re-authentication.

ALTER TABLE devices ADD COLUMN IF NOT EXISTS device_credential text;
CREATE INDEX IF NOT EXISTS devices_device_credential_idx ON devices (device_credential);
