import pg, { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { getServerEnv } from '@/lib/env';

/**
 * PostgreSQL access.
 *
 * One `Pool` per server process, cached on `globalThis` rather than in module scope. Next's dev
 * server re-evaluates modules on every hot reload; without the cache each reload would open a fresh
 * set of sockets and PostgreSQL would refuse new connections once `max_connections` was reached.
 * In production the module is evaluated once and the global lookup costs a property read.
 */

// node-postgres returns int8 (bigint) and numeric as strings to avoid precision loss. Neither
// column in this schema can approach 2^53, and both are only ever read back for display, so the
// conversions happen once here instead of at every call site.
pg.types.setTypeParser(20, (value: string) => Number.parseInt(value, 10));
pg.types.setTypeParser(1700, (value: string) => Number.parseFloat(value));

const POOL_KEY = Symbol.for('string-theory.pg.pool');

type GlobalWithPool = typeof globalThis & { [POOL_KEY]?: Pool };

function createPool(): Pool {
  const env = getServerEnv();
  return new Pool({
    connectionString: env.databaseUrl,
    max: env.databasePoolMax,
    // Reconnects are Postgres' job, not the request's. Without this a query that lands during an
    // EBS-backed instance restart rejects, and the user sees an error for a blip they did not cause.
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: env.databaseSsl === 'require' ? { rejectUnauthorized: false } : undefined,
  });
}

export function getPool(): Pool {
  const scope = globalThis as GlobalWithPool;
  scope[POOL_KEY] ??= createPool();
  return scope[POOL_KEY];
}

/**
 * Anything that can run a statement. Both `Pool` (auto-checkout) and `PoolClient` (inside a
 * transaction) satisfy it.
 *
 * Repository functions take one of these as their first argument instead of reaching for the pool
 * themselves. That is what lets campaign creation run the user, brand, campaign and creative writes
 * on a single transaction: passing the client through is the only way to do it, and passing the
 * wrong one is visible at the call site rather than producing a subtly half-atomic write.
 */
export type Executor = Pick<Pool, 'query'>;

/** Run a single statement. Pass params positionally — never interpolate values into SQL. */
export function query<T extends QueryResultRow>(text: string, params: readonly unknown[] = []) {
  return getPool().query<T>(text, params as unknown[]);
}

/**
 * Run `fn` inside a transaction, committing on return and rolling back on throw.
 *
 * Campaign creation spans three tables (brand, campaign, creative row) and a half-written campaign
 * with no brand behind it is exactly the state nobody wants to find in the database by hand.
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** PostgreSQL error code for a unique violation — callers translate this into a readable 409. */
export const UNIQUE_VIOLATION = '23505';

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === UNIQUE_VIOLATION
  );
}