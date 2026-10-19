import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db/pool';
import { activateDeviceByCode } from '@/device_backend';

export const dynamic = 'force-dynamic';

/**
 * POST /admin/store/activate
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
 *     "status": "Activated",
 *     "deviceId": "<deviceId>",
 *     "storeId": "<storeId>"
 *   }
 */
export async function POST(request: Request) {
  try {
    let body: any;
    try {
      body = await request.json();
    } catch {
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

    if (deviceIdRaw === undefined || deviceIdRaw === null || activationCodeRaw === undefined || activationCodeRaw === null) {
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

    const result = await activateDeviceByCode(getPool(), {
      deviceId,
      activationCode,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, status: 'Error' },
        { status: result.status },
      );
    }

    return NextResponse.json(
      {
        deviceId: result.data.deviceId,
        ShortLivedToken: result.data.ShortLivedToken,
        RefreshToken: result.data.RefreshToken,
        status: 'Activated',
        shortLivedToken: result.data.shortLivedToken,
        refreshToken: result.data.refreshToken,
        storeId: result.data.storeId,
      },
      { status: 200 },
    );

  } catch (error) {
    console.error('[admin/store/activate] device activation error:', error);
    return NextResponse.json(
      { error: 'Internal server error during device activation.' },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json(
    {
      message: 'String Theory Device Activation Endpoint',
      usage: 'POST /admin/store/activate with JSON { "DeviceId": "...", "ActivationCode": "..." }',
      expectedResponse: { status: 'Activated' },
    },
    { status: 200 },
  );
}
