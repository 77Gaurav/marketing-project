/**
 * Next.js Instrumentation Hook
 *
 * Bootstraps Pydantic Logfire and OpenTelemetry on server startup.
 * Automatically exports spans, traces, and metrics to Logfire OTLP endpoint.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initLogfire } = await import('@/lib/observability/logfire');
    initLogfire();

    const { registerOTel } = await import('@vercel/otel');
    registerOTel({
      serviceName: process.env.LOGFIRE_SERVICE_NAME || 'string-theory-marketing',
    });
  }
}
