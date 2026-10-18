import type { Executor } from '@/lib/db/pool';
import type { Device } from '@/lib/db/types';
import {
  findDeviceByHardwareId,
  findDeviceByAccessToken,
  activateDevice as activateDeviceBackend,
  updateDeviceLastSeen,
} from '@/device_backend';

export { findDeviceByHardwareId, findDeviceByAccessToken, updateDeviceLastSeen };

export interface ActivateDeviceInput {
  deviceId: string;
  activationCode?: string;
  activationKey?: string;
  storeId?: string | null;
  accessToken: string;
}

/**
 * Activate a device, delegating to device_backend.
 */
export async function activateDevice(
  db: Executor,
  input: ActivateDeviceInput,
): Promise<Device> {
  const activationCode = input.activationCode || input.activationKey || '';
  const storeId = input.storeId || null;
  return activateDeviceBackend(db, {
    deviceId: input.deviceId,
    activationCode,
    storeId,
    accessToken: input.accessToken,
  });
}
