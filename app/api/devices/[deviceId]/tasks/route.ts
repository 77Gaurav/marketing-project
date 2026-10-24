import { NextResponse } from 'next/server';
import {
  getDeviceTasksService,
  extractDeviceBearerToken,
  verifyDeviceAccessToken,
} from '@/device_backend';

export const dynamic = 'force-dynamic';

/**
 * GET /api/devices/:deviceId/tasks?sinceRevision=42
 *
 * Hardware screen player hourly delta polling endpoint.
 *
 * Query Parameters:
 *   - sinceRevision: The last revision integer known to the device.
 *     If omitted or 0, returns the latest active snapshot of tasks.
 *     If > 0, returns all changes (UPSERT, DEACTIVATE, DELETE) recorded since that revision.
 *
 * Request Headers:
 *   - Authorization: Bearer <accessToken> (optional/validated if provided)
 *   - Or x-device-token: <accessToken>
 *
 * Returns (HTTP 200):
 *   {
 *     "revision": 43,
 *     "changes": [
 *       {
 *         "taskId": "task_123",
 *         "version": 2,
 *         "action": "UPSERT",
 *         "status": "ACTIVE",
 *         "creativeId": "creative_456",
 *         "downloadUrl": "https://example.com/signed-url",
 *         "expiresAt": "2026-10-25T12:00:00Z",
 *         "playsPerHour": 10
 *       },
 *       {
 *         "taskId": "task_789",
 *         "version": 3,
 *         "action": "DEACTIVATE"
 *       },
 *       {
 *         "taskId": "task_012",
 *         "version": 4,
 *         "action": "DELETE"
 *       }
 *     ]
 *   }
 */
export async function GET(
  request: Request,
  { params }: { params: { deviceId: string } },
) {
  try {
    const rawDeviceId = params.deviceId;
    if (!rawDeviceId) {
      return NextResponse.json(
        { error: 'Missing deviceId parameter in URL path.' },
        { status: 400 },
      );
    }
    const deviceId = decodeURIComponent(rawDeviceId).trim();

    // 1. Optional Bearer token validation if authorization header is provided
    const bearerToken = extractDeviceBearerToken(request);
    if (bearerToken) {
      const verification = verifyDeviceAccessToken(bearerToken);
      if (!verification.valid) {
        return NextResponse.json(
          {
            error:
              verification.reason === 'EXPIRED'
                ? 'Device access token has expired. Please refresh tokens at /api/devices/authenticate.'
                : 'Invalid device access token.',
            reason: verification.reason,
          },
          { status: 401 },
        );
      }

      if (verification.payload.deviceId !== deviceId) {
        return NextResponse.json(
          {
            error: `Access token deviceId (${verification.payload.deviceId}) does not match URL path deviceId (${deviceId}).`,
          },
          { status: 403 },
        );
      }
    }

    // 2. Parse sinceRevision query parameter
    const url = new URL(request.url);
    const sinceRevStr = url.searchParams.get('sinceRevision');
    let sinceRevision = 0;
    if (sinceRevStr !== null) {
      const parsed = parseInt(sinceRevStr, 10);
      if (Number.isFinite(parsed) && parsed >= 0) {
        sinceRevision = parsed;
      }
    }

    // 3. Fetch device tasks using task stream service
    const result = await getDeviceTasksService({
      deviceId,
      sinceRevision,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    console.error('[devices/tasks] Failed to fetch device tasks:', error);
    return NextResponse.json(
      { error: 'An unexpected internal error occurred while fetching device tasks.' },
      { status: 500 },
    );
  }
}
