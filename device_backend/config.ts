/**
 * Configuration defaults for the device backend.
 */

/**
 * Default time-to-live for a device access token: 1 hour (3600 seconds).
 * Configurable via `DEVICE_TOKEN_TTL_SECONDS` environment variable.
 */
export function getDeviceTokenTtlSeconds(): number {
  const envVal = process.env.DEVICE_TOKEN_TTL_SECONDS;
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 3600; // 1 hour (short-lived)
}

/**
 * Secret key used to sign and verify device access tokens.
 * Falls back to SESSION_SECRET if DEVICE_TOKEN_SECRET is not explicitly provided.
 */
export function getDeviceTokenSecret(): string {
  const secret = process.env.DEVICE_TOKEN_SECRET || process.env.SESSION_SECRET;
  if (secret && secret.trim().length > 0) {
    return secret.trim();
  }
  return 'st_dev_default_secret_fallback_for_local_development';
}
