import type { QueryResultRow } from 'pg';
import type { Device, DeviceStatus } from '@/lib/db/types';

export type { Device, DeviceStatus };

/**
 * Raw database row from `devices` table.
 */
export interface DeviceRow extends QueryResultRow {
  id: string;
  device_id: string;
  activation_code: string | null;
  device_credential: string | null;
  status: DeviceStatus;
  store_id: string | null;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: Date | null;
  last_seen_at: Date | null;
  activated_at: Date | null;
  created_at: Date;
  updated_at: Date;
}


/**
 * Expected input fields for device activation (strict camelCase).
 */
export interface DeviceActivationInput {
  deviceId: string;
  activationCode: string;
  storeId: string;
}

/**
 * Expected input fields for device authentication.
 * Supports:
 * - Refresh mode: { refreshToken, deviceId? } or Authorization Bearer header
 * - Legacy credential mode: { deviceId, deviceCredential }
 */
export type DeviceAuthInput =
  | {
      mode: 'refresh';
      refreshToken: string;
      deviceId?: string;
    }
  | {
      mode: 'credential';
      deviceId: string;
      deviceCredential: string;
    }
  | {
      mode: 'device';
      deviceId: string;
    };

/**
 * Decoded claims stored inside the short-lived device access token.
 */
export interface DeviceTokenPayload {
  sub: string;
  deviceId: string;
  storeId: string | null;
  tokenType: 'device_access' | 'device_refresh';
  iat: number;
  exp: number;
  jti: string;
}

/**
 * Result of device token signature and expiration verification.
 */
export type DeviceTokenVerification =
  | { valid: true; payload: DeviceTokenPayload }
  | {
      valid: false;
      reason: 'EXPIRED' | 'INVALID_SIGNATURE' | 'MALFORMED' | 'INVALID_CLAIMS';
      payload?: DeviceTokenPayload;
    };

/**
 * JSON response payload returned by POST /api/devices/activate.
 * Satisfies all attributes of the `devices` table in camelCase,
 * and eliminates duplicate snake_case keys.
 */
export interface DeviceActivationResponse {
  success: true;
  message: string;
  id: string;
  deviceId: string;
  activationCode: string | null;
  deviceCredential?: string | null;
  status: DeviceStatus;
  storeId: string | null;
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  expiresAt: string;
  lastSeenAt: string | null;
  activatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  device: Device;
}

/**
 * JSON response payload returned by POST /api/devices/authenticate.
 */
export interface DeviceAuthResponse {
  success: boolean;
  message: string;
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  expiresAt: string;
  refreshExpiresIn: number;
  refreshExpiresAt: string;
  deviceId: string;
  status: string;
}

/**
 * Return type on successful activation at /admin/store/activate.
 * Returns: { deviceID, status, shortlived, longlived }
 */
export interface DeviceActivationSuccessResult {
  deviceID: string;
  deviceId: string;
  status: 'Activated';
  shortlived: string;
  longlived: string;
  ShortLivedToken?: string;
  shortLivedToken?: string;
  RefreshToken?: string;
  refreshToken?: string;
  storeId?: string | null;
}

/**
 * Task Action types for screen player synchronization.
 */
export type TaskAction = 'UPSERT' | 'DEACTIVATE' | 'DELETE';

export interface TaskChangeUpsert {
  taskId: string;
  version: number;
  action: 'UPSERT';
  status: 'ACTIVE' | string;
  creativeId: string;
  downloadUrl: string;
  expiresAt: string;
  playsPerHour: number;
  storeId?: string;
  metadata?: Record<string, unknown>;
}

export interface TaskChangeDeactivate {
  taskId: string;
  version: number;
  action: 'DEACTIVATE';
}

export interface TaskChangeDelete {
  taskId: string;
  version: number;
  action: 'DELETE';
}

export type TaskChange = TaskChangeUpsert | TaskChangeDeactivate | TaskChangeDelete;

export interface DeviceTasksResponse {
  revision: number;
  changes: TaskChange[];
}

export interface StoreTaskEventRow {
  id: string;
  revision: string | number;
  store_id: string;
  task_id: string;
  version: number;
  action: TaskAction;
  status: string | null;
  creative_id: string | null;
  s3_bucket: string | null;
  s3_key: string | null;
  plays_per_hour: number | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

