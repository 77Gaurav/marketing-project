import { randomBytes } from 'node:crypto';
import { getPool, type Executor } from '@/lib/db/pool';
import {
  generateDeviceAccessToken,
  generateDeviceRefreshToken,
  verifyDeviceRefreshToken,
  decodeDeviceTokenPayload,
  SHORT_LIVED_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from './token';
import {
  activateDevice,
  findStoreByIdOrSlug,
  findDeviceByHardwareId,
  findDeviceByRefreshToken,
  updateDeviceSession,
  updateDeviceAccessToken,
  updateDeviceTokens,
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
 * Accepts: { refreshToken, deviceId? } or { deviceId } or { deviceId, deviceCredential }
 * Header: storeId (optional/checked if device has no assigned store)
 *
 * 1. Refresh Mode (Standard):
 *    - Validates signature and claims of the long-lived refresh token.
 *    - Sliding Window token rotation: upon authentication success, generates a brand-new
 *      3-day access token AND a new 1-month refresh token (extending the TTL).
 *    - If the refresh token itself is expired: looks up deviceId from token claims, payload,
 *      or request body, checks the database for a valid active device; if valid, re-issues
 *      a fresh short-lived and long-lived token pair.
 *
 * 2. Device ID Mode (Re-sync / Expired token recovery):
 *    - Accepts { deviceId }.
 *    - Verifies device is activated and active in the database; generates new token pair.
 *
 * 3. Credential Mode (Legacy):
 *    - Accepts { deviceId, deviceCredential }.
 *    - Verifies device credentials and status.
 *    - Generates new short-lived and rotated long-lived refresh tokens.
 */
export async function authenticateDeviceService(
  input: DeviceAuthInput,
  options?: {
    db?: Executor;
    headerStoreId?: string | null;
  },
): Promise<AuthServiceResult> {
  const db = options?.db ?? getPool();

  // Mode 1: Refresh Token Flow (with Sliding Window token rotation & expired token recovery)
  if (input.mode === 'refresh') {
    // 1. Cryptographically verify signature, claims, and expiry of the long-lived refresh token
    const verification = verifyDeviceRefreshToken(input.refreshToken);
    const isJwtExpired = !verification.valid && verification.reason === 'EXPIRED';

    // If verification failed due to something OTHER than expiration (e.g. malformed or invalid signature)
    if (!verification.valid && !isJwtExpired) {
      const dbDevice = await findDeviceByRefreshToken(db, input.refreshToken);
      if (!dbDevice && !input.deviceId) {
        return {
          ok: false,
          error: 'Invalid or malformed refresh token.',
          reason: verification.reason,
          status: 401,
        };
      }
    }

    // 2. Resolve target deviceId
    let targetDeviceId = input.deviceId;
    if (!targetDeviceId && verification.payload?.deviceId) {
      targetDeviceId = verification.payload.deviceId;
    }
    if (!targetDeviceId) {
      const decoded = decodeDeviceTokenPayload(input.refreshToken);
      if (decoded?.deviceId) {
        targetDeviceId = decoded.deviceId;
      }
    }
    if (!targetDeviceId) {
      const dbDevice = await findDeviceByRefreshToken(db, input.refreshToken);
      if (dbDevice?.deviceId) {
        targetDeviceId = dbDevice.deviceId;
      }
    }

    if (!targetDeviceId) {
      return {
        ok: false,
        error: 'Unable to identify device from refresh token. Please provide deviceId or re-activate device.',
        reason: 'EXPIRED',
        status: 401,
      };
    }

    // If both input.deviceId and token claims are present, ensure they match
    const tokenClaimDeviceId =
      verification.payload?.deviceId || decodeDeviceTokenPayload(input.refreshToken)?.deviceId;
    if (input.deviceId && tokenClaimDeviceId && input.deviceId !== tokenClaimDeviceId) {
      return {
        ok: false,
        error: 'Provided deviceId does not match the refresh token.',
        status: 401,
      };
    }

    // 3. Look up device in PostgreSQL
    const device = await findDeviceByHardwareId(db, targetDeviceId);
    if (!device) {
      return {
        ok: false,
        error: 'Device not found in database.',
        status: 404,
      };
    }

    // 4. Verify device status: must be Activated, not Revoked
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

    // 5. Check if token was expired (either JWT exp or DB expires_at)
    const isDbExpired = Boolean(device.expiresAt && new Date(device.expiresAt).getTime() < Date.now());
    const isExpired = isJwtExpired || isDbExpired;

    // For an unexpired token, enforce anti-replay check
    if (!isExpired && device.refreshToken && device.refreshToken !== input.refreshToken) {
      return {
        ok: false,
        error: 'Refresh token is no longer valid or has been rotated.',
        status: 401,
      };
    }

    // 6. Verify associated store is active
    const tokenStoreId =
      verification.payload?.storeId || decodeDeviceTokenPayload(input.refreshToken)?.storeId;
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

    // 7. Sliding Window Token Rotation / Re-issuance
    // Generate new short-lived access token: 3 days (259,200 seconds)
    const {
      token: newAccessToken,
      expiresIn: shortLivedExpiresIn,
      expiresAt: shortLivedExpiresAt,
    } = generateDeviceAccessToken(
      device.deviceId,
      resolvedStoreId,
      SHORT_LIVED_TOKEN_TTL_SECONDS,
    );

    // Generate new long-lived refresh token: 1 month (2,592,000 seconds) - Sliding window extension
    const {
      token: newRefreshToken,
      expiresIn: refreshExpiresIn,
      expiresAt: refreshExpiresAt,
    } = generateDeviceRefreshToken(
      device.deviceId,
      resolvedStoreId,
      REFRESH_TOKEN_TTL_SECONDS,
    );

    // 8. Update PostgreSQL with both new tokens and fresh expiration
    await updateDeviceTokens(db, {
      deviceId: device.deviceId,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresAt: refreshExpiresAt,
    });

    return {
      ok: true,
      data: {
        success: true,
        message: isExpired
          ? 'Refresh token was expired; verified device in database and generated new token pair.'
          : 'Device authentication and sliding window token rotation successful.',
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        tokenType: 'Bearer',
        expiresIn: shortLivedExpiresIn,
        expiresAt: shortLivedExpiresAt.toISOString(),
        refreshExpiresIn,
        refreshExpiresAt: refreshExpiresAt.toISOString(),
        deviceId: device.deviceId,
        status: device.status,
      },
    };
  }

  // Mode 2: Device ID Only Flow (when refresh token expired or lost, check DB for device_id)
  if (input.mode === 'device') {
    const device = await findDeviceByHardwareId(db, input.deviceId);
    if (!device) {
      return {
        ok: false,
        error: 'Device not found in database.',
        status: 404,
      };
    }

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

    // Resolve storeId
    let resolvedStoreId = device.storeId;
    const headerStoreId = options?.headerStoreId?.trim();
    if (headerStoreId) {
      const store = await findStoreByIdOrSlug(db, headerStoreId);
      if (!store) {
        return {
          ok: false,
          error: 'Invalid Store id',
          status: 400,
        };
      }
      resolvedStoreId = store.id;
    }

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

    // Generate new token pair
    const {
      token: newAccessToken,
      expiresIn: shortLivedExpiresIn,
      expiresAt: shortLivedExpiresAt,
    } = generateDeviceAccessToken(
      device.deviceId,
      resolvedStoreId,
      SHORT_LIVED_TOKEN_TTL_SECONDS,
    );

    const {
      token: newRefreshToken,
      expiresIn: refreshExpiresIn,
      expiresAt: refreshExpiresAt,
    } = generateDeviceRefreshToken(
      device.deviceId,
      resolvedStoreId,
      REFRESH_TOKEN_TTL_SECONDS,
    );

    await updateDeviceTokens(db, {
      deviceId: device.deviceId,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresAt: refreshExpiresAt,
    });

    return {
      ok: true,
      data: {
        success: true,
        message: 'Verified device in database and generated new token pair.',
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        tokenType: 'Bearer',
        expiresIn: shortLivedExpiresIn,
        expiresAt: shortLivedExpiresAt.toISOString(),
        refreshExpiresIn,
        refreshExpiresAt: refreshExpiresAt.toISOString(),
        deviceId: device.deviceId,
        status: device.status,
      },
    };
  }

  // Mode 3: Legacy Credential Flow
  const device = await findDeviceByHardwareId(db, input.deviceId);
  if (!device) {
    return {
      ok: false,
      error: 'Invalid device credentials',
      status: 401,
    };
  }

  if (device.status === 'REVOKED') {
    return {
      ok: false,
      error: 'Device access revoked',
      status: 403,
    };
  }

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

  // Resolve storeId
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

  // Generate both short-lived access token and rotated refresh token (Sliding Window)
  const {
    token: newAccessToken,
    expiresIn: shortLivedExpiresIn,
    expiresAt: shortLivedExpiresAt,
  } = generateDeviceAccessToken(
    input.deviceId,
    resolvedStoreId,
    SHORT_LIVED_TOKEN_TTL_SECONDS,
  );

  const {
    token: newRefreshToken,
    expiresIn: refreshExpiresIn,
    expiresAt: refreshExpiresAt,
  } = generateDeviceRefreshToken(
    input.deviceId,
    resolvedStoreId,
    REFRESH_TOKEN_TTL_SECONDS,
  );

  await updateDeviceTokens(db, {
    deviceId: device.deviceId,
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    expiresAt: refreshExpiresAt,
  });

  return {
    ok: true,
    data: {
      success: true,
      message: 'Device credential authentication and token rotation successful.',
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      tokenType: 'Bearer',
      expiresIn: shortLivedExpiresIn,
      expiresAt: shortLivedExpiresAt.toISOString(),
      refreshExpiresIn,
      refreshExpiresAt: refreshExpiresAt.toISOString(),
      deviceId: device.deviceId,
      status: device.status,
    },
  };
}
