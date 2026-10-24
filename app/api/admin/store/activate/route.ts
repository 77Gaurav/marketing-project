import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db/pool';
import { activateDeviceByCode } from '@/device_backend';
import {
  traceAdminRequest,
  traceAdminChildSpan,
  logAdminInfo,
  logAdminWarn,
  logAdminError,
} from '@/lib/observability/logfire';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/store/activate (also reachable via POST /admin/store/activate)
 *
 * Device activation endpoint.
 *
 * Hardware player sends:
 *   {
 *     "DeviceId": "<deviceId>",
 *     "ActivationCode": "<activationCode>"
 *   }
 *
 * Returns:
 *   {
 *     "deviceID": "<deviceId>",
 *     "status": "Activated",
 *     "shortlived": "<shortLivedToken>",
 *     "longlived": "<longLivedRefreshToken>"
 *   }
 */
export async function POST(request: Request) {
  return await traceAdminRequest(
    {
      name: 'admin.api: POST /api/admin/store/activate',
      method: 'POST',
      path: '/api/admin/store/activate',
      request,
    },
    async () => {
      try {
        let body: any;
        try {
          body = await request.json();
        } catch {
          logAdminWarn('[admin/store/activate] Invalid JSON body received');
          return NextResponse.json(
            { error: 'Invalid JSON body. Please send { DeviceId, ActivationCode }.' },
            { status: 400 },
          );
        }

        if (!body || typeof body !== 'object') {
          return NextResponse.json(
            { error: 'Request body must be a JSON object with DeviceId and ActivationCode.' },
            { status: 400 },
          );
        }

        // Support both PascalCase and camelCase / snake_case
        const deviceIdRaw = body.DeviceId ?? body.deviceId ?? body.device_id;
        const activationCodeRaw = body.ActivationCode ?? body.activationCode ?? body.activation_code;

        if (
          deviceIdRaw === undefined ||
          deviceIdRaw === null ||
          activationCodeRaw === undefined ||
          activationCodeRaw === null
        ) {
          logAdminWarn('[admin/store/activate] Missing deviceId or activationCode');
          return NextResponse.json(
            {
              error: 'DeviceId and ActivationCode are required.',
              received: {
                hasDeviceId: deviceIdRaw !== undefined && deviceIdRaw !== null,
                hasActivationCode: activationCodeRaw !== undefined && activationCodeRaw !== null,
              },
            },
            { status: 400 },
          );
        }

        const deviceId = String(deviceIdRaw).trim();
        const activationCode = String(activationCodeRaw).trim();

        if (!deviceId || !activationCode) {
          return NextResponse.json(
            { error: 'DeviceId and ActivationCode cannot be blank.' },
            { status: 400 },
          );
        }

        const result = await traceAdminChildSpan(
          'admin.device.activateByCode',
          { deviceId },
          async () => {
            return await activateDeviceByCode(getPool(), {
              deviceId,
              activationCode,
            });
          },
        );

        if (!result.ok) {
          logAdminWarn('[admin/store/activate] Activation rejected', {
            deviceId,
            error: result.error,
            status: result.status,
          });
          return NextResponse.json(
            { error: result.error, status: 'Error' },
            { status: result.status },
          );
        }

        logAdminInfo('[admin/store/activate] Device activated successfully', {
          deviceId,
          status: 'Activated',
        });

        return NextResponse.json(
          {
            deviceID: result.data.deviceID || result.data.deviceId,
            status: 'Activated',
            shortlived: result.data.shortlived,
            longlived: result.data.longlived,
          },
          { status: 200 },
        );
      } catch (error) {
        logAdminError('[admin/store/activate] device activation error', error);
        return NextResponse.json(
          { error: 'Internal server error during device activation.' },
          { status: 500 },
        );
      }
    },
  );
}

export async function GET(request: Request) {
  return await traceAdminRequest(
    {
      name: 'admin.api: GET /api/admin/store/activate',
      method: 'GET',
      path: '/api/admin/store/activate',
      request,
    },
    async () => {
      return NextResponse.json(
        {
          message: 'String Theory Device Activation Endpoint',
          usage: 'POST /admin/store/activate with JSON { "DeviceId": "...", "ActivationCode": "..." }',
          expectedResponse: { status: 'Activated' },
        },
        { status: 200 },
      );
    },
  );
}
