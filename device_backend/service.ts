import { randomBytes } from 'node:crypto';
import { getPool, type Executor } from '@/lib/db/pool';
import { generateDeviceAccessToken } from './token';
import {
  activateDevice,
  findStoreByIdOrSlug,
  findDeviceByHardwareId,
  updateDeviceSession,
} from './repository';
import type {
  DeviceActivationInput,
  DeviceActivationResponse,
  DeviceAuthInput,
  DeviceAuthResponse,
} from './types';

export type ServiceResult =
  | {
      ok: true;
      data: DeviceActivationResponse;
    }
  | {
      ok: false;
      error: string;
      status: number;
    };

export type AuthServiceResult =
  | {
      ok: true;
      data: DeviceAuthResponse;
    }
  | {
      ok: false;
      error: string;
      status: number;
    };

/**
 * Core business service for activating a device.
 *
 * 1. Resolves store by ID or slug from PostgreSQL.
 * 2. Mints a cryptographically signed, short-lived secret access token.
 * 3. Generates and records persistent unique deviceCredential for automatic login.
 * 4. Persists device record, association to store, and token into PostgreSQL.
 * 5. Returns formatted activation details satisfying all attributes of the `devices` table in camelCase.
 */
export async function activateDeviceService(
  input: DeviceActivationInput,
  options?: {
    db?: Executor;
    ttlSeconds?: number;
  },
): Promise<ServiceResult> {
  const db = options?.db ?? getPool();

  // 1. Check if storeId is valid in database
  const store = await findStoreByIdOrSlug(db, input.storeId);
  if (!store) {
    return {
      ok: false,
      error: 'Invalid Store id',
      status: 400,
    };
  }
  const resolvedStoreId = store.id;

  // 2. Generate short-lived secret access token
  const { token, expiresIn, expiresAt } = generateDeviceAccessToken(
    input.deviceId,
    resolvedStoreId,
    options?.ttlSeconds,
  );

  // 3. Generate unique device credential for subsequent automatic logins
  const generatedCredential = `dev_sec_${randomBytes(24).toString('hex')}`;

  // 4. Persist device activation record bound to this store
  const device = await activateDevice(db, {
    deviceId: input.deviceId,
    activationCode: input.activationCode,
    storeId: resolvedStoreId,
    accessToken: token,
    deviceCredential: generatedCredential,
  });

  // 5. Return activation payload with all devices table attributes satisfied in camelCase
  const expiresAtIso = expiresAt.toISOString();

  return {
    ok: true,
    data: {
      success: true,
      message: 'Device successfully activated.',
      id: device.id,
      deviceId: device.deviceId,
      activationCode: device.activationCode,
      deviceCredential: device.deviceCredential ?? generatedCredential,
      status: device.status,
      storeId: device.storeId,
      accessToken: token,
      tokenType: 'Bearer',
      expiresIn,
      expiresAt: expiresAtIso,
      lastSeenAt: device.lastSeenAt,
      activatedAt: device.activatedAt,
      createdAt: device.createdAt,
      updatedAt: device.updatedAt,
      device,
    },
  };
}

/**
 * Authentication service for automatic device login.
 *
 * Request: POST /api/devices/authenticate
 * Accepts: { deviceId, deviceCredential }
 * Header: storeId (optional/checked if device has no assigned store)
 *
 * 1. Resolves device by hardware deviceId.
 * 2. Verifies deviceCredential (or activationCode fallback).
 * 3. Verifies device is ACTIVATED (not REVOKED).
 * 4. Resolves storeId:
 *    - Validates header storeId if provided. If invalid, responds with "Invalid Store id".
 *    - Falls back to device.storeId in database.
 *    - If device has no store associated and no header provided, asks for storeId in header.
 * 5. Mints short-lived access token with expiresIn: 900 (15 minutes).
 * 6. Updates session token in PostgreSQL.
 * 7. Returns { accessToken, tokenType: 'Bearer', expiresIn: 900 }.
 */
export async function authenticateDeviceService(
  input: DeviceAuthInput,
  options?: {
    db?: Executor;
    headerStoreId?: string | null;
  },
): Promise<AuthServiceResult> {
  const db = options?.db ?? getPool();

  // 1. Look up device
  const device = await findDeviceByHardwareId(db, input.deviceId);
  if (!device) {
    return {
      ok: false,
      error: 'Invalid device credentials',
      status: 401,
    };
  }

  // 2. Verify status
  if (device.status === 'REVOKED') {
    return {
      ok: false,
      error: 'Device access revoked',
      status: 403,
    };
  }

  // 3. Verify deviceCredential
  const matchesCredential =
    (device.deviceCredential && device.deviceCredential === input.deviceCredential) ||
    (device.activationCode && device.activationCode === input.deviceCredential);

  if (!matchesCredential) {
    return {
      ok: false,
      error: 'Invalid device credentials',
      status: 401,
    };
  }

  // 4. Resolve storeId
  let resolvedStoreId: string | null = null;
  const headerStoreId = options?.headerStoreId?.trim();

  if (headerStoreId && headerStoreId.length > 0) {
    const store = await findStoreByIdOrSlug(db, headerStoreId);
    if (!store) {
      return {
        ok: false,
        error: 'Invalid Store id',
        status: 400,
      };
    }
    resolvedStoreId = store.id;
  } else if (device.storeId) {
    resolvedStoreId = device.storeId;
  } else {
    // If device has no store associated in DB and no header provided, ask for storeId in header
    return {
      ok: false,
      error: "storeId header is required: this device is not associated with any store in the database. Please provide a valid storeId in the request header (e.g. 'storeId: ST-001').",
      status: 400,
    };
  }

  // 5. Generate short-lived access token: 900 seconds (15 minutes)
  const ttlSeconds = 900;
  const { token } = generateDeviceAccessToken(
    input.deviceId,
    resolvedStoreId,
    ttlSeconds,
  );

  // 6. Update session in DB
  await updateDeviceSession(db, {
    deviceId: input.deviceId,
    accessToken: token,
    storeId: resolvedStoreId,
  });

  // 7. Return 200 payload
  return {
    ok: true,
    data: {
      accessToken: token,
      tokenType: 'Bearer',
      expiresIn: ttlSeconds,
    },
  };
}
