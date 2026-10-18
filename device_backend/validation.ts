import { z } from 'zod';
import type { DeviceActivationInput } from './types';

export const deviceActivationSchema = z.object({
  deviceId: z
    .string()
    .trim()
    .min(1, 'deviceId is required')
    .max(255, 'deviceId exceeds maximum permitted length (255 characters)'),
  activationCode: z
    .string()
    .trim()
    .min(1, 'activationCode is required')
    .max(128, 'activationCode exceeds maximum permitted length (128 characters)'),
  storeId: z
    .string()
    .trim()
    .min(1, 'Invalid Store id')
    .max(128, 'Invalid Store id'),
});

export type ValidationSuccess = {
  ok: true;
  data: DeviceActivationInput;
};

export type ValidationFailure = {
  ok: false;
  error: string;
  field?: 'deviceId' | 'activationCode' | 'storeId';
  status: 400;
};

export type ValidationResult = ValidationSuccess | ValidationFailure;

/**
 * Extracts and strictly validates { deviceId, activationCode, storeId } from request JSON body.
 * Strictly accepts camelCase parameters only. Rejects snake_case, lowercase, and header formats.
 */
export async function extractAndValidateActivationInput(
  request: Request,
): Promise<ValidationResult> {
  // 1. Read JSON body
  let bodyData: Record<string, unknown> = {};
  try {
    const cloned = request.clone();
    const parsed = await cloned.json();
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      bodyData = parsed as Record<string, unknown>;
    } else {
      return {
        ok: false,
        error: 'Invalid JSON request body. Expected a JSON object.',
        status: 400,
      };
    }
  } catch {
    return {
      ok: false,
      error: 'Malformed or missing JSON body. Request must include a valid JSON body with camelCase fields { deviceId, activationCode, storeId }.',
      status: 400,
    };
  }

  // 2. Reject non-camelCase / deprecated keys
  const disallowedKeys = [
    'device_id',
    'deviceid',
    'device-id',
    'activation_code',
    'activationcode',
    'activation-code',
    'activation_key',
    'activationkey',
    'activation-key',
    'store_id',
    'storeid',
    'store-id',
  ];

  const presentDisallowed = disallowedKeys.filter((k) => k in bodyData);
  if (presentDisallowed.length > 0) {
    return {
      ok: false,
      error: `Invalid parameter format: only camelCase parameters are accepted. Disallowed format(s) found: ${presentDisallowed.map((k) => `'${k}'`).join(', ')}. Please use camelCase parameters: 'deviceId', 'activationCode', and 'storeId'.`,
      status: 400,
    };
  }

  const snakeOrKebabKeys = Object.keys(bodyData).filter((k) => k.includes('_') || k.includes('-'));
  if (snakeOrKebabKeys.length > 0) {
    return {
      ok: false,
      error: `Invalid parameter format: only camelCase parameters are accepted. Found: ${snakeOrKebabKeys.map((k) => `'${k}'`).join(', ')}. Please use camelCase: 'deviceId', 'activationCode', and 'storeId'.`,
      status: 400,
    };
  }

  // 3. Extract strictly camelCase fields
  const rawDeviceId = bodyData.deviceId;
  const rawActivationCode = bodyData.activationCode ?? bodyData.activationKey;
  const rawStoreId = bodyData.storeId;

  const deviceId = typeof rawDeviceId === 'string' ? rawDeviceId.trim() : '';
  const activationCode = typeof rawActivationCode === 'string' ? rawActivationCode.trim() : '';
  const storeId = typeof rawStoreId === 'string' ? rawStoreId.trim() : '';

  // Check required fields
  const missing: ('deviceId' | 'activationCode' | 'storeId')[] = [];
  if (!deviceId) missing.push('deviceId');
  if (!activationCode) missing.push('activationCode');
  if (!storeId) missing.push('storeId');

  if (missing.length > 0) {
    if (missing.includes('storeId') && missing.length === 1) {
      return {
        ok: false,
        error: 'Invalid Store id',
        field: 'storeId',
        status: 400,
      };
    }

    const errorMsg =
      missing.length === 1
        ? `Missing required parameter: '${missing[0]}'. Request must include camelCase parameter '${missing[0]}'.`
        : `Missing required parameters: ${missing.map((m) => `'${m}'`).join(', ')}. Request must include camelCase parameters { deviceId, activationCode, storeId }.`;

    return {
      ok: false,
      error: errorMsg,
      field: missing[0],
      status: 400,
    };
  }

  const parseResult = deviceActivationSchema.safeParse({
    deviceId,
    activationCode,
    storeId,
  });

  if (!parseResult.success) {
    const firstIssue = parseResult.error.issues[0];
    return {
      ok: false,
      error: firstIssue ? firstIssue.message : 'Invalid activation input parameters.',
      status: 400,
    };
  }

  return {
    ok: true,
    data: parseResult.data,
  };
}

export const deviceAuthSchema = z.object({
  deviceId: z
    .string()
    .trim()
    .min(1, 'deviceId is required')
    .max(255, 'deviceId exceeds maximum permitted length (255 characters)'),
  deviceCredential: z
    .string()
    .trim()
    .min(1, 'deviceCredential is required')
    .max(512, 'deviceCredential exceeds maximum permitted length (512 characters)'),
});

export type AuthValidationSuccess = {
  ok: true;
  data: import('./types').DeviceAuthInput;
};

export type AuthValidationFailure = {
  ok: false;
  error: string;
  field?: 'deviceId' | 'deviceCredential';
  status: 400;
};

export type AuthValidationResult = AuthValidationSuccess | AuthValidationFailure;

/**
 * Extracts and strictly validates { deviceId, deviceCredential } from request JSON body.
 * Strictly accepts camelCase parameters only. Rejects snake_case, lowercase, and header formats.
 */
export async function extractAndValidateAuthInput(
  request: Request,
): Promise<AuthValidationResult> {
  // 1. Read JSON body
  let bodyData: Record<string, unknown> = {};
  try {
    const cloned = request.clone();
    const parsed = await cloned.json();
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      bodyData = parsed as Record<string, unknown>;
    } else {
      return {
        ok: false,
        error: 'Invalid JSON request body. Expected a JSON object.',
        status: 400,
      };
    }
  } catch {
    return {
      ok: false,
      error: 'Malformed or missing JSON body. Request must include a valid JSON body with camelCase fields { deviceId, deviceCredential }.',
      status: 400,
    };
  }

  // 2. Reject non-camelCase / deprecated keys
  const disallowedKeys = [
    'device_id',
    'deviceid',
    'device-id',
    'device_credential',
    'devicecredential',
    'device-credential',
  ];

  const presentDisallowed = disallowedKeys.filter((k) => k in bodyData);
  if (presentDisallowed.length > 0) {
    return {
      ok: false,
      error: `Invalid parameter format: only camelCase parameters are accepted. Disallowed format(s) found: ${presentDisallowed.map((k) => `'${k}'`).join(', ')}. Please use camelCase parameters: 'deviceId' and 'deviceCredential'.`,
      status: 400,
    };
  }

  const snakeOrKebabKeys = Object.keys(bodyData).filter((k) => k.includes('_') || k.includes('-'));
  if (snakeOrKebabKeys.length > 0) {
    return {
      ok: false,
      error: `Invalid parameter format: only camelCase parameters are accepted. Found: ${snakeOrKebabKeys.map((k) => `'${k}'`).join(', ')}. Please use camelCase: 'deviceId' and 'deviceCredential'.`,
      status: 400,
    };
  }

  // 3. Extract strictly camelCase fields
  const rawDeviceId = bodyData.deviceId;
  const rawDeviceCredential = bodyData.deviceCredential;

  const deviceId = typeof rawDeviceId === 'string' ? rawDeviceId.trim() : '';
  const deviceCredential = typeof rawDeviceCredential === 'string' ? rawDeviceCredential.trim() : '';

  const missing: ('deviceId' | 'deviceCredential')[] = [];
  if (!deviceId) missing.push('deviceId');
  if (!deviceCredential) missing.push('deviceCredential');

  if (missing.length > 0) {
    const errorMsg =
      missing.length === 1
        ? `Missing required parameter: '${missing[0]}'. Request must include camelCase parameter '${missing[0]}'.`
        : `Missing required parameters: ${missing.map((m) => `'${m}'`).join(', ')}. Request must include camelCase parameters { deviceId, deviceCredential }.`;

    return {
      ok: false,
      error: errorMsg,
      field: missing[0],
      status: 400,
    };
  }

  const parseResult = deviceAuthSchema.safeParse({
    deviceId,
    deviceCredential,
  });

  if (!parseResult.success) {
    const firstIssue = parseResult.error.issues[0];
    return {
      ok: false,
      error: firstIssue ? firstIssue.message : 'Invalid authentication input parameters.',
      status: 400,
    };
  }

  return {
    ok: true,
    data: parseResult.data,
  };
}
