import { NextResponse } from 'next/server';
import { handleDeviceAuthentication } from '@/device_backend';

export const dynamic = 'force-dynamic';

/**
 * POST /api/devices/authenticate
 *
 * Device authentication and short-lived access token renewal endpoint.
 *
 * 1. ShortLived access token expiry:
 *    Takes the 1-month RefreshToken, validates it, and generates a new
 *    3-day ShortLived access token.
 *
 * 2. If LongLived token expired:
 *    Returns HTTP 401 Unauthorized.
 *
 * Request Body (JSON):
 *   - refreshToken (or RefreshToken / refresh_token): The long-lived refresh token (required)
 *   - deviceId (optional): Hardware player ID (validated against token claims)
 *
 * Alternatively accepts Authorization: Bearer <refreshToken>
 *
 * Returns (HTTP 200):
 *   - accessToken: Newly minted 3-day access token
 *   - ShortLivedToken: Alias for accessToken
 *   - tokenType: 'Bearer'
 *   - expiresIn: 259200 (3 days in seconds)
 *   - expiresAt: ISO expiration timestamp
 *   - deviceId: Hardware device ID
 *   - storeId: Associated store ID
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
