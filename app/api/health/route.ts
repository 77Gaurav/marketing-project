import { NextResponse } from 'next/server';

import { query } from '@/lib/db/pool';
import { getServerEnv } from '@/lib/env';

/**
 * Liveness/readiness for the container, the load balancer and `depends_on: service_healthy`.
 *
 * Answers "can this instance actually serve a request", not "is the process up". The process
 * answering at all proves Node booted, which is the less interesting half: every route in this app
 * reads PostgreSQL, so an instance that cannot reach the database is down for all of them and
 * should be taken out of rotation rather than left to fail each request.
 *
 * Deliberately unauthenticated and deliberately dull. An ALB health check cannot hold a session
 * cookie, and anything that needs one would be reporting healthy exactly when nothing else works.
 * The response body is therefore a status string and nothing else — no version, no host, no user
 * counts, nothing to fingerprint the deployment from.
 */

export const dynamic = 'force-dynamic';

interface HealthBody {
  status: 'ok';
  database: 'reachable';
}

/** 503 is what a load balancer and Docker both read as "not ready". The body stays equally dull. */
function unavailable() {
  return NextResponse.json({ status: 'unavailable' }, { status: 503, headers: { 'cache-control': 'no-store' } });
}

export async function GET() {
  try {
    // If configuration is missing or invalid this throws, which is itself a valid answer: an
    // instance that cannot resolve DATABASE_URL cannot serve anything and should not be sent traffic.
    getServerEnv();
    await query('SELECT 1');
  } catch (error) {
    // Logged locally, returned as nothing. The thrown error can contain the connection string, and
    // this route is unauthenticated — the reason belongs in the container log, not the response.
    console.error('[health] check failed', error);
    return unavailable();
  }

  return NextResponse.json<HealthBody>(
    { status: 'ok', database: 'reachable' },
    {
      // Never cached. A cached 200 is worse than no endpoint, because it survives the database
      // going away and reports an instance healthy for as long as the cache entry lasts.
      headers: { 'cache-control': 'no-store' },
    },
  );
}
