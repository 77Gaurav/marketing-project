import { handleDeviceActivation } from '@/device_backend';

/**
 * POST /api/devices/activate
 *
 * Hardware player activation endpoint for Raspberry Pi video players.
 *
 * Accepts strictly camelCase JSON body:
 *   - deviceId: Hardware identifier of the display device (required)
 *   - activationCode: Activation code / pre-shared venue key (required)
 *   - storeId: Store / venue ID, slug, or reference ID e.g. 'ST-001' (required)
 *
 * Returns strictly camelCase JSON response satisfying all attributes of the devices table:
 *   - id: Primary key UUID of the device
 *   - deviceId: Unique hardware serial
 *   - activationCode: Activation code used
 *   - status: Device operational status ('ACTIVATED')
 *   - storeId: Associated store UUID
 *   - accessToken: Short-lived cryptographically signed Bearer JWT
 *   - tokenType: 'Bearer'
 *   - expiresIn: Token validity in seconds (default 3600)
 *   - expiresAt: Token expiration ISO 8601 timestamp
 *   - lastSeenAt: Last heartbeat timestamp
 *   - activatedAt: Activation timestamp
 *   - createdAt: Creation timestamp
 *   - updatedAt: Update timestamp
 *   - device: Full device record with all attributes
 */
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return handleDeviceActivation(request);
}
