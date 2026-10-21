import type { Executor } from '@/lib/db/pool';
import type { Device } from '@/lib/db/types';
import {
  findDeviceByHardwareId,
  findDeviceByAccessToken,
  createPendingDevice as createPendingDeviceBackend,
  activateDeviceByCode as activateDeviceByCodeBackend,
  listDevicesForStore as listDevicesForStoreBackend,
  listAllDevices as listAllDevicesBackend,
  activateDevice as activateDeviceBackend,
  deleteDevice as deleteDeviceBackend,
  deactivateDevice as deactivateDeviceBackend,
  deleteRunningActivationsForStore as deleteRunningActivationsForStoreBackend,
  cleanupExpiredPendingDevices as cleanupExpiredPendingDevicesBackend,
  updateDeviceLastSeen,
  updateDeviceAccessToken,
  updateDeviceTokens,
} from '@/device_backend';

export {
  findDeviceByHardwareId,
  findDeviceByAccessToken,
  updateDeviceLastSeen,
  updateDeviceAccessToken,
  updateDeviceTokens,
};

export const createPendingDevice = createPendingDeviceBackend;
export const activateDeviceByCode = activateDeviceByCodeBackend;
export const deleteDevice = deleteDeviceBackend;
export const deactivateDevice = deactivateDeviceBackend;
export const deleteRunningActivationsForStore = deleteRunningActivationsForStoreBackend;
export const cleanupExpiredPendingDevices = cleanupExpiredPendingDevicesBackend;

export const listDevicesForStore = listDevicesForStoreBackend;
export const listAllDevices = listAllDevicesBackend;


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
