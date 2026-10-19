import { randomBytes } from 'node:crypto';
import { getPool, type Executor } from '@/lib/db/pool';
import {
  generateDeviceAccessToken,
  verifyDeviceRefreshToken,
  SHORT_LIVED_TOKEN_TTL_SECONDS,
} from './token';
import {
  activateDevice,
  findStoreByIdOrSlug,
  findDeviceByHardwareId,
  findDeviceByRefreshToken,
  updateDeviceSession,
  updateDeviceAccessToken,
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
      reason?: string;
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
 * 1. Refresh Mode (Standard):
 *    - Validates signature and 1-month expiry of the long-lived refresh token.
 *    - If expired or invalid: returns HTTP 401.
 *    - Verifies device is activated and bound to an active store.
 *    - Mints a new 3-day short-lived secret access token.
 *    - Updates device access_token and last_seen_at in PostgreSQL.
 *    - Returns { accessToken, ShortLivedToken, tokenType: 'Bearer', expiresIn: 259200, ... }.
 *
 * 2. Credential Mode (Legacy):
 *    - Accepts { deviceId, deviceCredential }.
 *    - Verifies device credentials and status.
 *    - Mints 3-day access token and updates device session.
 */
export async function authenticateDeviceService(
  input: DeviceAuthInput,
  options?: {
    db?: Executor;
    headerStoreId?: string | null;
  },
): Promise<AuthServiceResult> {
  const db = options?.db ?? getPool();

  // Mode 1: Refresh Token Flow
  // 1. ShortLived access token expiry : take refresh token, validate, generate new access token.
  // 2. If Longlived token expired : return 401
  if (input.mode === 'refresh') {
    // 1. Cryptographically verify signature, claims, and expiry of the long-lived refresh token
    const verification = verifyDeviceRefreshToken(input.refreshToken);
    if (!verification.valid) {
      if (verification.reason === 'EXPIRED') {
        return {
          ok: false,
          error: 'Refresh token has expired (1-month validity). Please re-activate device.',
          reason: 'EXPIRED',
          status: 401,
        };
      }
      return {
        ok: false,
        error: 'Invalid or malformed refresh token.',
        reason: verification.reason,
        status: 401,
      };
    }

    const { deviceId: tokenDeviceId, storeId: tokenStoreId } = verification.payload;

    // 2. If deviceId was supplied, verify it matches the token claims
    if (input.deviceId && input.deviceId !== tokenDeviceId) {
      return {
        ok: false,
        error: 'Provided deviceId does not match the refresh token.',
        status: 401,
      };
    }

    // 3. Look up device in PostgreSQL
    const device = await findDeviceByHardwareId(db, tokenDeviceId);
    if (!device) {
      return {
        ok: false,
        error: 'Device not found.',
        status: 401,
      };
    }

    // 4. Verify device status
    if (device.status === 'REVOKED') {
      return {
        ok: false,
        error: 'Device access revoked.',
        status: 401,
      };
    }

    if (device.status !== 'Activated' && device.status !== 'ACTIVATED') {
      return {
        ok: false,
        error: 'Device is not activated.',
        status: 401,
      };
    }

    // 5. Verify refresh token matches stored token (anti-replay / revocation check)
    if (device.refreshToken && device.refreshToken !== input.refreshToken) {
      return {
        ok: false,
        error: 'Refresh token is no longer valid or has been rotated.',
        status: 401,
      };
    }

    // 6. Check database expires_at if set
    if (device.expiresAt && new Date(device.expiresAt).getTime() < Date.now()) {
      return {
        ok: false,
        error: 'Refresh token has expired (1-month validity). Please re-activate device.',
        reason: 'EXPIRED',
        status: 401,
      };
    }

    // 7. Verify associated store is active
    const resolvedStoreId = device.storeId || tokenStoreId;
    if (resolvedStoreId) {
      const store = await findStoreByIdOrSlug(db, resolvedStoreId);
      if (store && store.status !== 'ACTIVE') {
        return {
          ok: false,
          error: 'Associated store is not active. Device authentication is only permitted for active stores.',
          status: 401,
        };
      }
    }

    // 8. Generate new short-lived access token: 3 days (259,200 seconds)
    const { token: newAccessToken, expiresIn, expiresAt } = generateDeviceAccessToken(
      device.deviceId,
      resolvedStoreId,
      SHORT_LIVED_TOKEN_TTL_SECONDS,
    );

    // 9. Update access_token and last_seen_at in PostgreSQL
    await updateDeviceAccessToken(db, device.deviceId, newAccessToken);

    return {
      ok: true,
      data: {
        success: true,
        accessToken: newAccessToken,
        ShortLivedToken: newAccessToken,
        shortLivedToken: newAccessToken,
        tokenType: 'Bearer',
        expiresIn,
        expiresAt: expiresAt.toISOString(),
        deviceId: device.deviceId,
        storeId: resolvedStoreId,
        refreshToken: input.refreshToken,
        RefreshToken: input.refreshToken,
      },
    };
  }

  // Mode 2: Legacy Credential Flow
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
    return {
      ok: false,
      error: "storeId header is required: this device is not associated with any store in the database. Please provide a valid storeId in the request header (e.g. 'storeId: ST-001').",
      status: 400,
    };
  }

  // 5. Generate short-lived access token: 3 days (SHORT_LIVED_TOKEN_TTL_SECONDS)
  const { token, expiresIn, expiresAt } = generateDeviceAccessToken(
    input.deviceId,
    resolvedStoreId,
    SHORT_LIVED_TOKEN_TTL_SECONDS,
  );

  // 6. Update session in DB
  await updateDeviceSession(db, {
    deviceId: input.deviceId,
    accessToken: token,
    storeId: resolvedStoreId,
  });

  return {
    ok: true,
    data: {
      success: true,
      accessToken: token,
      ShortLivedToken: token,
      shortLivedToken: token,
      tokenType: 'Bearer',
      expiresIn,
      expiresAt: expiresAt.toISOString(),
      deviceId: device.deviceId,
      storeId: resolvedStoreId,
    },
  };
}
