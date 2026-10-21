import { NextResponse } from 'next/server';
import { handleDeviceAuthentication } from '@/device_backend';

export const dynamic = 'force-dynamic';

/**
 * POST /api/devices/authenticate
 *
 * Device authentication and token renewal endpoint with Sliding Window Rotation.
 *
 * 1. Sliding Window Token Rotation on Success:
 *    Takes the RefreshToken, validates it, and generates BOTH:
 *    - A new 3-day ShortLived access token (`accessToken` / `shortlived`)
 *    - A new 1-month LongLived refresh token (`refreshToken` / `longlived`), extending TTL.
 *
 * 2. Expired Refresh Token Recovery:
 *    If the refresh token itself is expired, checks for the device ID in the database.
 *    If the device is actively registered (not revoked, store active), generates a brand-new
 *    pair of short-lived access and long-lived refresh tokens.
 *
 * Request Body (JSON):
 *   - refreshToken (or RefreshToken / refresh_token): The long-lived refresh token
 *   - deviceId (or DeviceId / device_id): Hardware player ID (validated against database/claims)
 *   Alternatively accepts Authorization: Bearer <refreshToken> or x-device-id header.
 *
 * Returns (HTTP 200):
 *   {
 *     "success": true,
 *     "message": "...",
 *     "accessToken": "<shortLivedToken>",
 *     "refreshToken": "<longLivedToken>",
 *     "tokenType": "Bearer",
 *     "expiresIn": 259200,
 *     "expiresAt": "<isoTimestamp>",
 *     "refreshExpiresIn": 2592000,
 *     "refreshExpiresAt": "<isoTimestamp>",
 *     "deviceId": "<deviceId>",
 *     "status": "<deviceStatus>"
 *   }
 */
export async function POST(request: Request) {
  return handleDeviceAuthentication(request);
}

export async function GET() {
  return NextResponse.json(
    {
      message: 'String Theory Device Authentication & Token Refresh Endpoint',
      usage:
        'POST /api/devices/authenticate with { "refreshToken": "<token>" } or Authorization: Bearer <refreshToken>',
      status: 'Ready',
    },
    { status: 200 },
  );
}
