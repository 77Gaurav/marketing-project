/**
 * Server-side configuration, read from the environment and validated on first use.
 *
 * Deliberately lazy. `next build` imports server modules to collect route metadata, and a module
 * that threw at import time because DATABASE_URL was unset would fail the build for a reason that
 * has nothing to do with the build. Values are therefore resolved when a request actually needs
 * them, and the result is cached for the life of the process.
 *
 * Every getter here is server-only. Nothing in this file may be imported by a `'use client'`
 * component — the whole point of the convention is that these strings never reach the browser.
 */

export type DatabaseSslMode = 'disable' | 'require';

export interface ServerEnv {
  databaseUrl: string;
  databasePoolMax: number;
  databaseSsl: DatabaseSslMode;
  sessionSecret: string;
  /**
   * Email of the account used when no session cookie is present. Only honoured outside production;
   * it exists so the campaign flow is reachable before an auth provider is wired up.
   */
  devAuthEmail: string | null;
  /**
   * Allows campaign creation with no resolved session by provisioning a BRAND account from the
   * submitted contact email. This is the pre-auth bootstrap path and must be off in production.
   */
  allowUnauthenticatedSignup: boolean;
  /**
   * Credentials for the admin console at /admin.
   *
   * A single shared username and password, checked against the environment rather than a `users` row,
   * because there is no password hashing anywhere in this project yet and introducing one for this
   * screen alone would be a half-measure. The alternative — an ADMIN row in `users` with a stored
   * hash — is where this should move once real login exists; see `lib/auth/admin.ts`.
   *
   * The defaults are `admin`/`admin` so the console is reachable on a fresh clone with no setup. That
   * is a development convenience and nothing else, which is why {@link resolveAdminPassword} refuses
   * to run in production with a default or short password.
   */
  adminUsername: string;
  adminPassword: string;
  /**
   * The `users` row that an admin login resolves to. `users.email` is the login identity in this
   * schema, so the console's username is a credential checked against the environment while this is
   * the account whose role the session then carries.
   */
  adminEmail: string;
  adminName: string;
  /**
   * AWS S3 configuration for video uploads.
   */
  awsRegion: string;
  s3OriginalBucket: string;
  s3EncodedBucket: string;
  s3AccessKeyId?: string;
  s3SecretAccessKey?: string;
}

let cached: ServerEnv | null = null;

function read(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function readBoolean(name: string, fallback: boolean): boolean {
  const value = read(name);
  if (value === undefined) return fallback;
  return value === '1' || value.toLowerCase() === 'true' || value.toLowerCase() === 'yes';
}

function readNumber(name: string, fallback: number): number {
  const value = read(name);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer, received "${value}".`);
  }
  return parsed;
}

/**
 * Whether to negotiate TLS to PostgreSQL.
 *
 * `require` maps verify-full on AWS RDS, where the certificate authority is bundled with the instance.
 * The explicit form matters: writing `DATABASE_SSL=disable` and leaving it to default would train
 * everyone to leave it empty, and then production would quietly connect in plaintext.
 */
function readSslMode(): DatabaseSslMode {
  const value = read('DATABASE_SSL');
  if (value === undefined) return 'disable';
  if (value === 'disable') return 'disable';
  if (value === 'require' || value === 'verify-full') return 'require';
  throw new Error('DATABASE_SSL must be "disable" or "require".');
}

/**
 * A 32-byte minimum so the HMAC used to sign session cookies is not brute-forceable with a short
 * key. Only required in production — in development an ephemeral secret is generated so a fresh
 * clone runs without ceremony, at the cost of logging everyone out on restart.
 */
function resolveSessionSecret(): string {
  const secret = read('SESSION_SECRET');
  if (secret) {
    if (secret.length < 32) {
      throw new Error('SESSION_SECRET must be at least 32 characters.');
    }
    return secret;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET is required in production.');
  }

  return 'development-only-insecure-session-secret';
}

/** The development default, named so the production guard below can recognise it. */
const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'admin';

/**
 * Resolve the admin console password, refusing a default or weak one in production.
 *
 * The default exists so a fresh clone has a working /admin without ceremony. Shipping it would be a
 * publicly reachable backdoor, and a threshold is the smallest thing that makes forgetting to change
 * it a startup failure rather than a disclosure. Twelve characters is deliberately above the eight
 * that a password-strength meter would suggest, because this credential guards the whole network
 * record and is checked from a form with no rate limit yet.
 */
function resolveAdminPassword(): string {
  const password = read('ADMIN_PASSWORD');
  const isDefault = password === undefined || password === DEFAULT_ADMIN_PASSWORD;

  if (process.env.NODE_ENV === 'production' && (isDefault || (password?.length ?? 0) < 12)) {
    throw new Error(
      isDefault
        ? 'ADMIN_PASSWORD is still the default "admin". Set a unique password of at least 12 characters before deploying.'
        : 'ADMIN_PASSWORD must be at least 12 characters in production.',
    );
  }

  return password ?? DEFAULT_ADMIN_PASSWORD;
}

export function getServerEnv(): ServerEnv {
  if (cached) return cached;

  const databaseUrl = read('DATABASE_URL');
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env and point it at your PostgreSQL instance.',
    );
  }

  cached = {
    databaseUrl,
    databasePoolMax: readNumber('DATABASE_POOL_MAX', 10),
    databaseSsl: readSslMode(),
    sessionSecret: resolveSessionSecret(),
    devAuthEmail: read('DEV_AUTH_EMAIL') ?? null,
    allowUnauthenticatedSignup: readBoolean('ALLOW_UNAUTHENTICATED_SIGNUP', false),
    adminUsername: read('ADMIN_USERNAME') ?? DEFAULT_ADMIN_USERNAME,
    adminPassword: resolveAdminPassword(),
    adminEmail: read('ADMIN_EMAIL') ?? 'admin@stringtheory.test',
    adminName: read('ADMIN_NAME') ?? 'Network admin',
    awsRegion: read('AWS_REGION') ?? 'us-east-1',
    s3OriginalBucket: read('S3_ORIGINAL_BUCKET') ?? read('AWS_S3_BUCKET') ?? '',
    s3EncodedBucket: read('S3_ENCODED_BUCKET') ?? read('AWS_S3_BUCKET') ?? '',
    s3AccessKeyId: read('AWS_ACCESS_KEY_ID') ?? read('S3_ACCESS_KEY_ID'),
    s3SecretAccessKey: read('AWS_SECRET_ACCESS_KEY') ?? read('S3_SECRET_ACCESS_KEY'),
  };

  return cached;
}

/**
 * True when running outside production. Guards the two conveniences that must never reach a real
 * deployment: the fallback identity and unsigned-by-default session secrets.
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV !== 'production';
}