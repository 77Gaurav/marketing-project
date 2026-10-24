import {
  configure,
  span,
  info,
  warning,
  error as logfireError,
  reportError,
  forceFlush,
  shutdown,
} from '@pydantic/logfire-node';

/**
 * Pydantic Logfire Observability module for String Theory /admin.
 *
 * Provides OpenTelemetry-native distributed tracing and spans, request lifecycle logging
 * (processing, success, failure), error fingerprinting, and automatic credential scrubbing.
 */

let initialized = false;

/**
 * Initialize Logfire with service metadata and OTLP exporter settings.
 * Safe to call multiple times (idempotent).
 */
export function initLogfire(): void {
  if (initialized) return;

  const token = process.env.LOGFIRE_TOKEN;
  const serviceName = process.env.LOGFIRE_SERVICE_NAME || 'string-theory-marketing';
  const serviceVersion = process.env.LOGFIRE_SERVICE_VERSION || '0.1.0';
  const environment = process.env.LOGFIRE_ENVIRONMENT || process.env.NODE_ENV || 'development';

  // Bridge LOGFIRE_TOKEN to OpenTelemetry OTLP standard environment variables if not already set
  if (token) {
    if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'https://logfire-api.pydantic.dev';
    }
    if (!process.env.OTEL_EXPORTER_OTLP_HEADERS) {
      process.env.OTEL_EXPORTER_OTLP_HEADERS = `Authorization=Bearer ${token}`;
    }
  }

  try {
    configure({
      serviceName,
      serviceVersion,
      environment,
      token,
      sendToLogfire: 'if-token-present',
      console: {
        enabled: true,
        minLevel: (process.env.LOGFIRE_MIN_LEVEL as any) || 'info',
      },
    });
    initialized = true;
  } catch (err) {
    console.warn('[logfire] Configuration warning:', err);
  }
}

/**
 * Ensure Logfire is initialized before creating spans or logs.
 */
function ensureInitialized(): void {
  if (!initialized) {
    initLogfire();
  }
}

export interface TraceAdminOptions {
  name?: string;
  method?: string;
  path?: string;
  request?: Request;
  admin?: {
    id?: string;
    email?: string;
    role?: string;
    fullName?: string;
  };
  attributes?: Record<string, unknown>;
}

/**
 * Wrap an admin operation (API route or page render) in a Logfire span and trace.
 * Automatically logs request processing, success, and failures.
 */
export async function traceAdminRequest<T>(
  options: TraceAdminOptions,
  callback: (activeSpan: any) => Promise<T>,
): Promise<T> {
  ensureInitialized();

  let method = options.method || (options.request ? options.request.method : 'GET');
  let path = options.path;

  if (!path && options.request) {
    try {
      path = new URL(options.request.url).pathname;
    } catch {
      path = '/admin';
    }
  }

  if (!path) {
    try {
      // Dynamic import to avoid issues in non-request contexts
      const { headers } = require('next/headers');
      const h = headers();
      path = h.get('x-url') || h.get('x-invoke-path') || h.get('next-url') || '/admin';
    } catch {
      path = '/admin';
    }
  }

  const spanName = options.name || `admin: ${method} ${path}`;

  const baseAttributes: Record<string, unknown> = {
    'http.method': method,
    'http.route': path,
    'admin.action': options.name || `${method} ${path}`,
    'admin.authenticated': !!options.admin,
    ...(options.admin?.id ? { 'admin.user_id': options.admin.id } : {}),
    ...(options.admin?.email ? { 'admin.email': options.admin.email } : {}),
    ...(options.admin?.role ? { 'admin.role': options.admin.role } : {}),
    ...(options.attributes || {}),
  };

  return await span(spanName, {
    attributes: baseAttributes,
    callback: async (activeSpan) => {
      const startTime = Date.now();

      // 1. LIFECYCLE: PROCESSING
      info(`Admin request processing: ${method} ${path}`, {
        method,
        path,
        admin: options.admin
          ? { id: options.admin.id, email: options.admin.email, role: options.admin.role }
          : undefined,
        ...options.attributes,
      });

      try {
        const result = await callback(activeSpan);
        const durationMs = Date.now() - startTime;

        if (result instanceof Response) {
          const status = result.status;
          if (status >= 400) {
            // 2. LIFECYCLE: FAILURE (HTTP error response)
            warning(`Admin request failed: ${method} ${path} (${status})`, {
              method,
              path,
              status,
              duration_ms: durationMs,
              ...options.attributes,
            });
          } else {
            // 3. LIFECYCLE: SUCCESS (HTTP 2xx/3xx)
            info(`Admin request succeeded: ${method} ${path} (${status})`, {
              method,
              path,
              status,
              duration_ms: durationMs,
              ...options.attributes,
            });
          }
        } else {
          // 3. LIFECYCLE: SUCCESS (non-Response e.g. Server Component)
          info(`Admin request succeeded: ${method} ${path}`, {
            method,
            path,
            duration_ms: durationMs,
            ...options.attributes,
          });
        }

        return result;
      } catch (error: any) {
        const durationMs = Date.now() - startTime;
        // 2. LIFECYCLE: FAILURE (unhandled exception)
        reportError(`Admin request exception: ${method} ${path}`, error, {
          method,
          path,
          duration_ms: durationMs,
          ...options.attributes,
        });
        throw error;
      }
    },
  });
}

/**
 * Start a child span within the current active admin trace.
 */
export async function traceAdminChildSpan<T>(
  name: string,
  attributes: Record<string, unknown> = {},
  callback: (activeSpan: any) => Promise<T>,
): Promise<T> {
  ensureInitialized();
  return await span(name, {
    attributes,
    callback,
  });
}

/**
 * Log informational event to Logfire.
 */
export function logAdminInfo(message: string, attributes?: Record<string, unknown>): void {
  ensureInitialized();
  info(message, attributes);
}

/**
 * Log warning event to Logfire.
 */
export function logAdminWarn(message: string, attributes?: Record<string, unknown>): void {
  ensureInitialized();
  warning(message, attributes);
}

/**
 * Log error event or exception to Logfire.
 */
export function logAdminError(
  message: string,
  err?: unknown,
  attributes?: Record<string, unknown>,
): void {
  ensureInitialized();
  if (err) {
    reportError(message, err, attributes);
  } else {
    logfireError(message, attributes);
  }
}

export { forceFlush, shutdown };
