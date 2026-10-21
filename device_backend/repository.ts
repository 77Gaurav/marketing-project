import type { Executor } from '@/lib/db/pool';
import type { Store } from '@/lib/db/types';
import type { Device, DeviceRow, DeviceStatus, DeviceActivationSuccessResult } from './types';
import {
  generateDeviceAccessToken,
  generateDeviceRefreshToken,
  SHORT_LIVED_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from './token';

const COLUMNS =
  'id, device_id, activation_code, device_credential, status, store_id, access_token, refresh_token, expires_at, last_seen_at, activated_at, created_at, updated_at';

function toDevice(row: DeviceRow): Device {
  let status: DeviceStatus = row.status;
  if ((status as string) === 'PENDING') status = 'Activation Pending';
  if ((status as string) === 'ACTIVATED') status = 'Activated';
  return {
    id: row.id,
    deviceId: row.device_id,
    activationCode: row.activation_code,
    deviceCredential: row.device_credential,
    status,
    storeId: row.store_id,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
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

/** Look up a device by its long-lived refresh token. */
export async function findDeviceByRefreshToken(
  db: Executor,
  refreshToken: string,
): Promise<Device | null> {
  const result = await db.query<DeviceRow>(
    `SELECT ${COLUMNS} FROM devices WHERE refresh_token = $1 LIMIT 1`,
    [refreshToken],
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

/**
 * Update a device's short-lived access token and last_seen_at upon authentication.
 */
export async function updateDeviceAccessToken(
  db: Executor,
  deviceId: string,
  accessToken: string,
): Promise<Device | null> {
  const result = await db.query<DeviceRow>(
    `UPDATE devices
     SET access_token = $1,
         last_seen_at = now(),
         updated_at = now()
     WHERE device_id = $2
     RETURNING ${COLUMNS}`,
    [accessToken, deviceId],
  );
  return result.rows[0] ? toDevice(result.rows[0]) : null;
}

/**
 * Update a device's token pair (short-lived access token & rotated refresh token)
 * with updated refresh expiration and last_seen_at timestamp (Sliding Window Rotation).
 */
export async function updateDeviceTokens(
  db: Executor,
  {
    deviceId,
    accessToken,
    refreshToken,
    expiresAt,
  }: {
    deviceId: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
  },
): Promise<Device | null> {
  const result = await db.query<DeviceRow>(
    `UPDATE devices
     SET access_token = $1,
         refresh_token = $2,
         expires_at = $3,
         last_seen_at = now(),
         updated_at = now()
     WHERE device_id = $4
     RETURNING ${COLUMNS}`,
    [accessToken, refreshToken, expiresAt, deviceId],
  );
  return result.rows[0] ? toDevice(result.rows[0]) : null;
}

/** Record a heartbeat / check-in from the device. */
export async function updateDeviceLastSeen(db: Executor, deviceId: string): Promise<void> {
  await db.query(`UPDATE devices SET last_seen_at = now() WHERE device_id = $1`, [deviceId]);
}

/**
 * Generate a clean, human-readable one-time activation code.
 */
export function generateActivationCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'ACT-';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Cleans up expired pending devices whose activation code was not activated within 15 minutes.
 * "If unactivated, dont show activation as pending, delete it"
 */
export async function cleanupExpiredPendingDevices(db: Executor): Promise<number> {
  const result = await db.query(
    `DELETE FROM devices
     WHERE (status = 'Activation Pending' OR status = 'PENDING')
       AND (
         (expires_at IS NOT NULL AND expires_at < now())
         OR (expires_at IS NULL AND created_at < now() - INTERVAL '15 minutes')
       )`,
  );
  return result.rowCount ?? 0;
}

/**
 * Creates a new pending device slot linked with storeId.
 * Generates an auto-incremented deviceId from PostgreSQL sequence,
 * links it with storeId, and returns a one-time activation code valid for 15 minutes.
 */
export async function createPendingDevice(
  db: Executor,
  { storeId }: { storeId: string },
): Promise<{
  id: string;
  deviceId: string;
  activationCode: string;
  expiresAt: string;
  status: 'Activation Pending';
  storeId: string;
  createdAt: string;
}> {
  // Clean up any unactivated expired codes first
  await cleanupExpiredPendingDevices(db);

  // Resolve store by ID, slug, or name
  const store = await findStoreByIdOrSlug(db, storeId);
  if (!store) {
    throw new Error('Invalid Store id');
  }

  // Device activation is only permitted when the store is active
  if (store.status !== 'ACTIVE') {
    throw new Error('Store is not activated. Device activation is only permitted when the store is active.');
  }


  // Generate auto-incremented deviceId from PostgreSQL sequence
  const seqResult = await db.query<{ next_id: string }>(
    `SELECT nextval('device_id_seq')::text AS next_id`,
  );
  const nextDeviceId = seqResult.rows[0].next_id;
  const activationCode = generateActivationCode();

  // Make the activation code live for 15 mins
  const insertResult = await db.query<DeviceRow>(
    `INSERT INTO devices (device_id, activation_code, status, store_id, expires_at, created_at, updated_at)
     VALUES ($1, $2, 'Activation Pending', $3, now() + INTERVAL '15 minutes', now(), now())
     RETURNING ${COLUMNS}`,
    [nextDeviceId, activationCode, store.id],
  );

  const row = insertResult.rows[0];
  return {
    id: row.id,
    deviceId: row.device_id,
    activationCode: row.activation_code || activationCode,
    expiresAt: row.expires_at
      ? row.expires_at.toISOString()
      : new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    status: 'Activation Pending',
    storeId: row.store_id || store.id,
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * Activate a device when the device hardware sends { DeviceId, ActivationCode }.
 * Checks code and changes status to 'Activated'.
 * Returns { deviceId, ShortLivedToken (3 days), RefreshToken (1 month) }.
 */
export async function activateDeviceByCode(
  db: Executor,
  { deviceId, activationCode }: { deviceId: string; activationCode: string },
): Promise<
  | { ok: true; data: DeviceActivationSuccessResult }
  | { ok: false; error: string; status: number }
> {
  const trimmedId = String(deviceId || '').trim();
  const trimmedCode = String(activationCode || '').trim().toUpperCase();

  if (!trimmedId || !trimmedCode) {
    return { ok: false, error: 'DeviceId and ActivationCode are required', status: 400 };
  }

  // 1. Clean up expired unactivated codes first
  await cleanupExpiredPendingDevices(db);

  const findResult = await db.query<DeviceRow>(
    `SELECT ${COLUMNS} FROM devices WHERE device_id = $1 LIMIT 1`,
    [trimmedId],
  );

  if (findResult.rows.length === 0) {
    return { ok: false, error: 'Device not found or activation code expired', status: 404 };
  }

  const current = findResult.rows[0];

  // 2. If already activated, return valid tokens
  if (current.status === 'Activated' || current.status === 'ACTIVATED') {
    let slToken = current.access_token;
    let rfToken = current.refresh_token;

    if (!slToken || !rfToken) {
      const sl = generateDeviceAccessToken(
        current.device_id,
        current.store_id,
        SHORT_LIVED_TOKEN_TTL_SECONDS,
      );
      const rf = generateDeviceRefreshToken(
        current.device_id,
        current.store_id,
        REFRESH_TOKEN_TTL_SECONDS,
      );
      slToken = sl.token;
      rfToken = rf.token;
      await db.query(
        `UPDATE devices SET access_token = $1, refresh_token = $2, updated_at = now() WHERE id = $3`,
        [slToken, rfToken, current.id],
      );
    }

    return {
      ok: true,
      data: {
        deviceID: current.device_id,
        deviceId: current.device_id,
        status: 'Activated',
        shortlived: slToken,
        longlived: rfToken,
        ShortLivedToken: slToken,
        shortLivedToken: slToken,
        RefreshToken: rfToken,
        refreshToken: rfToken,
        storeId: current.store_id,
      },
    };
  }

  // 3. Double-check expiration if pending
  const isExpired =
    (current.expires_at && new Date(current.expires_at).getTime() < Date.now()) ||
    (!current.expires_at &&
      new Date(current.created_at).getTime() + 15 * 60 * 1000 < Date.now());

  if (isExpired) {
    // "If unactivated , dont show activation as pending, delete it"
    await db.query(`DELETE FROM devices WHERE id = $1`, [current.id]);
    return {
      ok: false,
      error: 'Activation code has expired (valid for 15 minutes). Unactivated code deleted.',
      status: 410,
    };
  }

  // 4. Verify store is active: device can only be activated if store is active
  if (current.store_id) {
    const store = await findStoreByIdOrSlug(db, current.store_id);
    if (store && store.status !== 'ACTIVE') {
      return {
        ok: false,
        error: 'Store is not active. Device activation is only permitted for active stores.',
        status: 400,
      };
    }
  }

  // 5. Validate activation code
  const existingCode = (current.activation_code || '').trim().toUpperCase();
  if (!existingCode || existingCode !== trimmedCode) {
    return { ok: false, error: 'Invalid activation code', status: 400 };
  }


  // 5. Generate ShortLivedToken (3 days) and RefreshToken (1 month)
  const shortLivedTokenResult = generateDeviceAccessToken(
    current.device_id,
    current.store_id,
    SHORT_LIVED_TOKEN_TTL_SECONDS,
  );
  const refreshTokenResult = generateDeviceRefreshToken(
    current.device_id,
    current.store_id,
    REFRESH_TOKEN_TTL_SECONDS,
  );

  // 6. Mark as activated and save tokens
  const updateResult = await db.query<DeviceRow>(
    `UPDATE devices
     SET status = 'Activated',
         activated_at = now(),
         access_token = $1,
         refresh_token = $2,
         expires_at = $3,
         last_seen_at = now(),
         updated_at = now()
     WHERE id = $4
     RETURNING ${COLUMNS}`,
    [shortLivedTokenResult.token, refreshTokenResult.token, refreshTokenResult.expiresAt, current.id],
  );

  const updated = updateResult.rows[0];
  return {
    ok: true,
    data: {
      deviceID: updated.device_id,
      deviceId: updated.device_id,
      status: 'Activated',
      shortlived: shortLivedTokenResult.token,
      longlived: refreshTokenResult.token,
      ShortLivedToken: shortLivedTokenResult.token,
      shortLivedToken: shortLivedTokenResult.token,
      RefreshToken: refreshTokenResult.token,
      refreshToken: refreshTokenResult.token,
      storeId: updated.store_id,
    },
  };
}

/**
 * Delete a device completely from the database, erasing its row.
 */
export async function deleteDevice(
  db: Executor,
  deviceId: string,
): Promise<{ ok: boolean; status: string }> {
  const trimmedId = String(deviceId || '').trim();
  if (!trimmedId) {
    return { ok: false, status: 'Invalid deviceId' };
  }

  const findResult = await db.query<DeviceRow>(
    `SELECT ${COLUMNS} FROM devices WHERE device_id = $1 LIMIT 1`,
    [trimmedId],
  );

  if (findResult.rows.length === 0) {
    return { ok: false, status: 'Not found' };
  }

  const current = findResult.rows[0];

  // Completely delete and erase row from database
  await db.query(`DELETE FROM devices WHERE id = $1`, [current.id]);

  return { ok: true, status: 'Deleted' };
}

/**
 * Backward compatibility alias: deactivateDevice now deletes the device completely from the database.
 */
export const deactivateDevice = deleteDevice;

/**
 * Deletes any running (pending) activations for a given store.
 * If a store is deactivated or deleted by admin, running activations are deleted first.
 */
export async function deleteRunningActivationsForStore(
  db: Executor,
  storeId: string,
): Promise<number> {
  const store = await findStoreByIdOrSlug(db, storeId);
  const resolvedId = store ? store.id : storeId;

  const result = await db.query(
    `DELETE FROM devices
     WHERE store_id = $1 AND (status = 'Activation Pending' OR status = 'PENDING')`,
    [resolvedId],
  );
  return result.rowCount ?? 0;
}


/**
 * List all devices for a given store.
 * Automatically purges any expired unactivated codes so they never show as pending.
 */
export async function listDevicesForStore(db: Executor, storeId: string): Promise<Device[]> {
  await cleanupExpiredPendingDevices(db);
  const store = await findStoreByIdOrSlug(db, storeId);
  const resolvedId = store ? store.id : storeId;

  const result = await db.query<DeviceRow>(
    `SELECT ${COLUMNS} FROM devices WHERE store_id = $1 ORDER BY created_at DESC`,
    [resolvedId],
  );
  return result.rows.map(toDevice);
}

/**
 * List all devices across the network with their store name and slug.
 * Automatically purges any expired unactivated codes so they never show as pending.
 */
export async function listAllDevices(
  db: Executor,
): Promise<(Device & { storeName?: string; storeSlug?: string })[]> {
  await cleanupExpiredPendingDevices(db);
  const result = await db.query<DeviceRow & { store_name: string | null; store_slug: string | null }>(
    `SELECT d.*, s.name as store_name, s.slug as store_slug
     FROM devices d
     LEFT JOIN stores s ON s.id = d.store_id
     ORDER BY d.created_at DESC`,
  );
  return result.rows.map((row) => ({
    ...toDevice(row),
    storeName: row.store_name ?? undefined,
    storeSlug: row.store_slug ?? undefined,
  }));
}


