import { handleDeviceAuthentication } from '@/device_backend';

/**
 * POST /api/devices/authenticate
 *
 * Automatic player re-authentication endpoint for Raspberry Pi video players.
 *
 * Request Body (camelCase only):
 *   - deviceId: Hardware serial / device ID (required)
 *   - deviceCredential: Secure persistent credential string (required)
 *
 * Request Header:
 *   - storeId (or x-store-id): Store / venue identifier. Required if the device
 *     is not yet associated with a store in the database.
 *
 * Returns (HTTP 200):
 *   - accessToken: Short-lived access token valid for 900 seconds (15 minutes)
 *   - tokenType: 'Bearer'
 *   - expiresIn: 900
 */
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return handleDeviceAuthentication(request);
}
