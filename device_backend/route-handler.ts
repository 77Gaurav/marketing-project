import { NextResponse } from 'next/server';
import {
  extractAndValidateActivationInput,
  extractAndValidateAuthInput,
} from './validation';
import {
  activateDeviceService,
  authenticateDeviceService,
} from './service';

/**
 * HTTP handler for POST /api/devices/activate.
 *
 * Validates request parameters { deviceId, activationCode, storeId },
 * mints a short-lived access token, activates the device associated with the store,
 * and returns the activation response.
 */
export async function handleDeviceActivation(request: Request): Promise<NextResponse> {
  try {
    // 1. Extract and validate required parameters: { deviceId, activationCode, storeId }
    const validation = await extractAndValidateActivationInput(request);
    if (!validation.ok) {
      return NextResponse.json(
        {
          success: false,
          error: validation.error,
          field: validation.field,
          required: ['deviceId', 'activationCode', 'storeId'],
        },
        { status: validation.status },
      );
    }

    // 2. Execute activation service logic
    const result = await activateDeviceService(validation.data);
    if (!result.ok) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
        },
        { status: result.status },
      );
    }

    // 3. Return 200 with activation details and short-lived secret access token
    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    console.error('[device_backend] device activation failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'An unexpected internal error occurred during device activation.',
      },
      { status: 500 },
    );
  }
}

/**
 * HTTP handler for POST /api/devices/authenticate.
 *
 * Automatic device login using stored { deviceId, deviceCredential }.
 * Checks for optional/conditional storeId in request headers:
 *   'storeId', 'x-store-id', or 'store-id'.
 * Returns 200 with { accessToken, tokenType: 'Bearer', expiresIn: 900 }.
 */
export async function handleDeviceAuthentication(request: Request): Promise<NextResponse> {
  try {
    // 1. Extract and validate required camelCase body: { deviceId, deviceCredential }
    const validation = await extractAndValidateAuthInput(request);
    if (!validation.ok) {
      return NextResponse.json(
        {
          success: false,
          error: validation.error,
          ...(validation.field ? { field: validation.field } : {}),
        },
        { status: validation.status },
      );
    }

    // 2. Extract optional/conditional storeId from request header
    const headerStoreId =
      request.headers.get('storeid') ||
      request.headers.get('storeId') ||
      request.headers.get('x-store-id') ||
      request.headers.get('store-id');

    // 3. Authenticate device and mint token
    const result = await authenticateDeviceService(validation.data, {
      headerStoreId,
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          ...(result.reason ? { reason: result.reason } : {}),
        },
        { status: result.status },
      );
    }

    // 4. Return 200 with new ShortLivedToken and session info
    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    console.error('[device_backend] device authentication failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'An unexpected internal error occurred during device authentication.',
      },
      { status: 500 },
    );
  }
}
