import {
  generateDeviceAccessToken,
  getAuthenticatedDevice,
  extractDeviceBearerToken,
  verifyDeviceAccessToken,
} from '@/device_backend';
import type { Device } from '@/lib/db/types';

export { getAuthenticatedDevice, extractDeviceBearerToken, verifyDeviceAccessToken };

/**
 * Legacy generator wrapper for backwards-compatibility.
 * Returns the short-lived signed access token string.
 */
export function generateDeviceToken(deviceId: string = 'legacy-device', storeId: string = 'unassigned'): string {
  const result = generateDeviceAccessToken(deviceId, storeId);
  return result.token;
}

export type { Device };
