-- Migration 0013: Store Status (Active / Pending / Deactivated)
-- Extends store_status enum with PENDING and DEACTIVATED, and aligns default value.

ALTER TYPE store_status ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE store_status ADD VALUE IF NOT EXISTS 'DEACTIVATED';

-- Migrate any existing records to the unified status set:
UPDATE stores SET status = 'PENDING' WHERE status::text = 'PENDING_REVIEW';
UPDATE stores SET status = 'DEACTIVATED' WHERE status::text IN ('PAUSED', 'CLOSED');

-- Update default on stores table to 'PENDING'
ALTER TABLE stores ALTER COLUMN status SET DEFAULT 'PENDING';
