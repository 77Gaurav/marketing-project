-- Adds refresh_token and expires_at columns to devices table.
-- Supports 3-day access tokens, 1-month refresh tokens, and 15-minute activation code expiry.

ALTER TABLE devices ADD COLUMN IF NOT EXISTS refresh_token text;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE INDEX IF NOT EXISTS devices_refresh_token_idx ON devices (refresh_token);
CREATE INDEX IF NOT EXISTS devices_expires_at_idx ON devices (expires_at);
