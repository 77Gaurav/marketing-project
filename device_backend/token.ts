import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getPool, type Executor } from '@/lib/db/pool';
import { getDeviceTokenSecret, getDeviceTokenTtlSeconds } from './config';
import type { Device, DeviceTokenPayload, DeviceTokenVerification } from './types';
import { findDeviceByAccessToken, updateDeviceLastSeen } from './repository';

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function signHmac(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

export interface GeneratedTokenResult {
  token: string;
  expiresIn: number;
  expiresAt: Date;
}

/**
 * Mint a cryptographically secure, short-lived Bearer access token for a device.
 * Encodes standard JWT claims: sub, deviceId, storeId, tokenType, iat, exp, and jti nonce.
 */
export function generateDeviceAccessToken(
  deviceId: string,
  storeId: string | null = null,
  customTtlSeconds?: number,
): GeneratedTokenResult {
  const secret = getDeviceTokenSecret();
  const ttlSeconds = customTtlSeconds ?? getDeviceTokenTtlSeconds();
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expSeconds = nowSeconds + ttlSeconds;

  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));

  const payload: DeviceTokenPayload = {
    sub: deviceId,
    deviceId,
    storeId,
    tokenType: 'device_access',
    iat: nowSeconds,
    exp: expSeconds,
    jti: randomBytes(16).toString('hex'),
  };

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signHmac(`${header}.${encodedPayload}`, secret);

  const token = `${header}.${encodedPayload}.${signature}`;

  return {
    token,
    expiresIn: ttlSeconds,
    expiresAt: new Date(expSeconds * 1000),
  };
}

/**
 * Verify signature and expiration of a device access token.
 */
export function verifyDeviceAccessToken(
  token: string | null | undefined,
  customSecret?: string,
): DeviceTokenVerification {
  if (!token || typeof token !== 'string') {
    return { valid: false, reason: 'MALFORMED' };
  }

  const parts = token.trim().split('.');
  if (parts.length !== 3) {
    return { valid: false, reason: 'MALFORMED' };
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  if (!encodedHeader || !encodedPayload || !signature) {
    return { valid: false, reason: 'MALFORMED' };
  }

  const secret = customSecret ?? getDeviceTokenSecret();
  const expectedSignature = signHmac(`${encodedHeader}.${encodedPayload}`, secret);

  const providedBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);

  if (providedBuf.length !== expectedBuf.length || !timingSafeEqual(providedBuf, expectedBuf)) {
    return { valid: false, reason: 'INVALID_SIGNATURE' };
  }

  let payload: DeviceTokenPayload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    return { valid: false, reason: 'MALFORMED' };
  }

  if (
    !payload ||
    typeof payload.deviceId !== 'string' ||
    typeof payload.exp !== 'number' ||
    (payload.storeId !== null && typeof payload.storeId !== 'string' && typeof payload.storeId !== 'undefined')
  ) {
    return { valid: false, reason: 'INVALID_CLAIMS' };
  }

  const currentSeconds = Math.floor(Date.now() / 1000);
  if (currentSeconds >= payload.exp) {
    return { valid: false, reason: 'EXPIRED' };
  }

  return { valid: true, payload };
}

/**
 * Extract token from standard authorization header or x-device-token header.
 */
export function extractDeviceBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }

  const customHeader =
    request.headers.get('x-device-token') ||
    request.headers.get('device-token') ||
    request.headers.get('x-access-token');

  return customHeader ? customHeader.trim() : null;
}

/**
 * Authenticate a device from incoming request headers.
 * Validates token signature, short-lived expiration, and verifies active DB registration.
 */
export async function getAuthenticatedDevice(
  request: Request,
  db: Executor = getPool(),
): Promise<Device | null> {
  const token = extractDeviceBearerToken(request);
  if (!token) return null;

  // 1. Check cryptographic signature and short-lived expiry
  const verification = verifyDeviceAccessToken(token);
  if (!verification.valid) {
    return null;
  }

  // 2. Look up the device in PostgreSQL to ensure it is actively registered and not revoked
  const device = await findDeviceByAccessToken(db, token);
  if (!device || device.status !== 'ACTIVATED') {
    return null;
  }

  // 3. Update last seen timestamp asynchronously
  updateDeviceLastSeen(db, device.deviceId).catch(() => {});

  return device;
}
