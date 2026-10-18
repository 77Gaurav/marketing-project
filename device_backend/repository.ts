import type { Executor } from '@/lib/db/pool';
import type { Store } from '@/lib/db/types';
import type { Device, DeviceRow } from './types';

const COLUMNS =
  'id, device_id, activation_code, device_credential, status, store_id, access_token, last_seen_at, activated_at, created_at, updated_at';

function toDevice(row: DeviceRow): Device {
  return {
    id: row.id,
    deviceId: row.device_id,
    activationCode: row.activation_code,
    deviceCredential: row.device_credential,
    status: row.status,
    storeId: row.store_id,
    accessToken: row.access_token,
    lastSeenAt: row.last_seen_at ? row.last_seen_at.toISOString() : null,
    activatedAt: row.activated_at ? row.activated_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/** Look up a device by its Raspberry Pi hardware identifier. */
export async function findDeviceByHardwareId(
  db: Executor,
  deviceId: string,
): Promise<Device | null> {
  const result = await db.query<DeviceRow>(
    `SELECT ${COLUMNS} FROM devices WHERE device_id = $1 LIMIT 1`,
    [deviceId],
  );
  return result.rows[0] ? toDevice(result.rows[0]) : null;
}

/** Look up a device by its bearer access token. */
export async function findDeviceByAccessToken(
  db: Executor,
  accessToken: string,
): Promise<Device | null> {
  const result = await db.query<DeviceRow>(
    `SELECT ${COLUMNS} FROM devices WHERE access_token = $1 LIMIT 1`,
    [accessToken],
  );
  return result.rows[0] ? toDevice(result.rows[0]) : null;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Look up a store by its UUID or by slug.
 * This allows activation callers to provide either store UUID or the store's readable slug.
 */
export async function findStoreByIdOrSlug(
  db: Executor,
  storeIdentifier: string,
): Promise<Store | null> {
  const trimmed = storeIdentifier.trim();
  const isUuid = UUID_REGEX.test(trimmed);

  if (isUuid) {
    const result = await db.query(
      `SELECT id, name, slug, location, screen_count, website, owner_user_id,
              contact_name, contact_email, contact_phone, status, created_at
       FROM stores
       WHERE id = $1
       LIMIT 1`,
      [trimmed],
    );
    if (result.rows[0]) {
      const row = result.rows[0];
      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        location: row.location,
        screenCount: row.screen_count,
        website: row.website,
        ownerUserId: row.owner_user_id,
        contactName: row.contact_name,
        contactEmail: row.contact_email,
        contactPhone: row.contact_phone,
        status: row.status,
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : '',
      };
    }
  }

  // Fallback: look up by slug (case-insensitive) or name
  const result = await db.query(
    `SELECT id, name, slug, location, screen_count, website, owner_user_id,
            contact_name, contact_email, contact_phone, status, created_at
     FROM stores
     WHERE LOWER(slug) = LOWER($1) OR slug = $1 OR LOWER(name) = LOWER($1)
     LIMIT 1`,
    [trimmed],
  );

  if (result.rows[0]) {
    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      location: row.location,
      screenCount: row.screen_count,
      website: row.website,
      ownerUserId: row.owner_user_id,
      contactName: row.contact_name,
      contactEmail: row.contact_email,
      contactPhone: row.contact_phone,
      status: row.status,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : '',
    };
  }

  return null;
}

/**
 * Activate a device and bind it to a store with a newly minted access token.
 *
 * Supports two flows:
 *   1. An operator pre-created a device slot with a specific activation code in 'PENDING' status:
 *      the incoming request binds the device_id and store_id to that slot and activates it.
 *   2. Self-registration / fresh activation:
 *      inserts or upserts by device_id, recording activation code, store_id, and access token.
 */
export async function activateDevice(
  db: Executor,
  {
    deviceId,
    activationCode,
    storeId,
    accessToken,
    deviceCredential,
  }: {
    deviceId: string;
    activationCode: string;
    storeId: string | null;
    accessToken: string;
    deviceCredential?: string | null;
  },
): Promise<Device> {
  // 1. Check if there is an unactivated slot pre-assigned with this activation code
  const pendingSlot = await db.query<{ id: string; store_id: string | null }>(
    `SELECT id, store_id FROM devices WHERE activation_code = $1 AND status = 'PENDING' LIMIT 1`,
    [activationCode],
  );

  if (pendingSlot.rows.length > 0) {
    const finalStoreId = storeId ?? pendingSlot.rows[0].store_id;
    const result = await db.query<DeviceRow>(
      `UPDATE devices
       SET device_id = $1,
           status = 'ACTIVATED',
           activated_at = now(),
           access_token = $2,
           store_id = $3,
           device_credential = COALESCE($5, device_credential),
           last_seen_at = now()
       WHERE id = $4
       RETURNING ${COLUMNS}`,
      [deviceId, accessToken, finalStoreId, pendingSlot.rows[0].id, deviceCredential ?? null],
    );
    return toDevice(result.rows[0]);
  }

  // 2. Otherwise insert or update by device_id
  const result = await db.query<DeviceRow>(
    `INSERT INTO devices (device_id, activation_code, status, store_id, activated_at, access_token, device_credential, last_seen_at)
     VALUES ($1, $2, 'ACTIVATED', $3, now(), $4, $5, now())
     ON CONFLICT (device_id) DO UPDATE
       SET activation_code = EXCLUDED.activation_code,
           status = 'ACTIVATED',
           store_id = COALESCE(EXCLUDED.store_id, devices.store_id),
           activated_at = now(),
           access_token = EXCLUDED.access_token,
           device_credential = COALESCE(EXCLUDED.device_credential, devices.device_credential),
           last_seen_at = now()
     RETURNING ${COLUMNS}`,
    [deviceId, activationCode, storeId, accessToken, deviceCredential ?? null],
  );

  return toDevice(result.rows[0]);
}

/**
 * Update a device's session token and last seen timestamp upon authentication.
 */
export async function updateDeviceSession(
  db: Executor,
  {
    deviceId,
    accessToken,
    storeId,
  }: {
    deviceId: string;
    accessToken: string;
    storeId?: string | null;
  },
): Promise<Device> {
  const result = await db.query<DeviceRow>(
    `UPDATE devices
     SET access_token = $1,
         store_id = COALESCE($2, store_id),
         last_seen_at = now()
     WHERE device_id = $3
     RETURNING ${COLUMNS}`,
    [accessToken, storeId ?? null, deviceId],
  );
  return toDevice(result.rows[0]);
}

/** Record a heartbeat / check-in from the device. */
export async function updateDeviceLastSeen(db: Executor, deviceId: string): Promise<void> {
  await db.query(`UPDATE devices SET last_seen_at = now() WHERE device_id = $1`, [deviceId]);
}
