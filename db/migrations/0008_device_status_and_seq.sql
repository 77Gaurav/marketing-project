-- Adds 'Activation Pending' and 'Activated' to device_status enum and creates device_id_seq.

ALTER TYPE device_status ADD VALUE IF NOT EXISTS 'Activation Pending';
ALTER TYPE device_status ADD VALUE IF NOT EXISTS 'Activated';

CREATE SEQUENCE IF NOT EXISTS device_id_seq START WITH 1;
