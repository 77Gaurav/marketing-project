import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db/pool';
import { listStores } from '@/lib/db/repositories/stores';
import { createPendingDevice, listAllDevices, listDevicesForStore } from '@/device_backend';
import {
  traceAdminRequest,
  traceAdminChildSpan,
  logAdminInfo,
  logAdminWarn,
  logAdminError,
} from '@/lib/observability/logfire';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/store/devices
 * Also handles GET /admin/store when Accept: application/json.
 */
export async function GET(request: Request) {
  return await traceAdminRequest(
    {
      name: 'admin.api: GET /api/admin/store/devices',
      method: 'GET',
      path: '/api/admin/store/devices',
      request,
    },
    async () => {
      const url = new URL(request.url);
      const storeId = url.searchParams.get('storeId') || url.searchParams.get('store_id');
      const pool = getPool();

      try {
        const { stores, devices } = await traceAdminChildSpan(
          'admin.db.listStoresAndDevices',
          { storeId: storeId || 'all' },
          async () => {
            const stores = await listStores(pool);
            const devices = storeId
              ? await listDevicesForStore(pool, storeId)
              : await listAllDevices(pool);
            return { stores, devices };
          },
        );

        logAdminInfo('[admin/store/devices] Stores and devices retrieved', {
          totalStores: stores.length,
          totalDevices: devices.length,
        });

        return NextResponse.json(
          {
            stores,
            devices,
            totalStores: stores.length,
            totalDevices: devices.length,
          },
          { status: 200 },
        );
      } catch (error: any) {
        logAdminError('[api/admin/store/devices] GET error', error);
        return NextResponse.json(
          { error: 'Could not load stores or devices: ' + (error?.message || '') },
          { status: 500 },
        );
      }
    },
  );
}

/**
 * POST /api/admin/store/devices
 * Also handles POST /admin/store.
 *
 * Adds a new device:
 *   1. Generates auto-incremented deviceId from sequence.
 *   2. Links it with storeId.
 *   3. Generates one-time activation code.
 *   4. Returns { status: "Activation Pending", deviceId, activationCode, storeId }.
 */
export async function POST(request: Request) {
  return await traceAdminRequest(
    {
      name: 'admin.api: POST /api/admin/store/devices',
      method: 'POST',
      path: '/api/admin/store/devices',
      request,
    },
    async () => {
      try {
        let body: any = {};
        try {
          body = await request.json();
        } catch {
          // Body may not be valid JSON
        }

        const storeId = body?.storeId ?? body?.store_id ?? body?.store;

        if (!storeId) {
          logAdminWarn('[admin/store/devices] POST missing storeId');
          return NextResponse.json(
            {
              error: 'storeId is required to add a new device.',
              required: ['storeId'],
            },
            { status: 400 },
          );
        }

        const device = await traceAdminChildSpan(
          'admin.device.createPending',
          { storeId: String(storeId).trim() },
          async () => {
            return await createPendingDevice(getPool(), {
              storeId: String(storeId).trim(),
            });
          },
        );

        logAdminInfo('[admin/store/devices] Device created with pending activation', {
          deviceId: device.deviceId,
          storeId: device.storeId,
        });

        return NextResponse.json(
          {
            status: 'Activation Pending',
            deviceId: device.deviceId,
            activationCode: device.activationCode,
            expiresAt: device.expiresAt,
            storeId: device.storeId,
            id: device.id,
            createdAt: device.createdAt,
          },
          { status: 201 },
        );
      } catch (error: any) {
        logAdminError('[api/admin/store/devices] POST error', error);
        if (error?.message === 'Invalid Store id') {
          return NextResponse.json(
            { error: 'Invalid Store id. Store could not be found.' },
            { status: 400 },
          );
        }
        if (
          error?.message?.includes('not activated') ||
          error?.message?.includes('not active')
        ) {
          return NextResponse.json(
            { error: error.message },
            { status: 400 },
          );
        }
        return NextResponse.json(
          { error: 'Failed to create device: ' + (error?.message || '') },
          { status: 500 },
        );
      }
    },
  );
}

/**
 * DELETE /api/admin/store/devices
 * Deletes a device completely from the database or removes a pending activation code.
 */
export async function DELETE(request: Request) {
  return await traceAdminRequest(
    {
      name: 'admin.api: DELETE /api/admin/store/devices',
      method: 'DELETE',
      path: '/api/admin/store/devices',
      request,
    },
    async () => {
      try {
        const url = new URL(request.url);
        let deviceId = url.searchParams.get('deviceId') || url.searchParams.get('device_id');

        if (!deviceId) {
          try {
            const body = await request.json();
            deviceId = body?.deviceId ?? body?.device_id;
          } catch {
            // body might be empty
          }
        }

        if (!deviceId) {
          logAdminWarn('[admin/store/devices] DELETE missing deviceId');
          return NextResponse.json(
            { error: 'deviceId is required to delete a device.' },
            { status: 400 },
          );
        }

        const { deleteDevice, deactivateDevice } = await import('@/device_backend');
        const deleteFn = deleteDevice || deactivateDevice;
        const result = await traceAdminChildSpan(
          'admin.device.delete',
          { deviceId: String(deviceId).trim() },
          async () => {
            return await deleteFn(getPool(), String(deviceId).trim());
          },
        );

        if (!result.ok) {
          logAdminWarn('[admin/store/devices] Device deletion failed', {
            deviceId,
            status: result.status,
          });
          return NextResponse.json({ error: result.status }, { status: 404 });
        }

        logAdminInfo('[admin/store/devices] Device deleted successfully', {
          deviceId: String(deviceId).trim(),
        });

        return NextResponse.json(
          {
            success: true,
            status: result.status,
            deviceId: String(deviceId).trim(),
          },
          { status: 200 },
        );
      } catch (error: any) {
        logAdminError('[api/admin/store/devices] DELETE error', error);
        return NextResponse.json(
          { error: 'Failed to delete device: ' + (error?.message || '') },
          { status: 500 },
        );
      }
    },
  );
}
