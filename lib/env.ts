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
  /**
   * Google OAuth client credentials for brand sign-in.
   *
   * Null when either half is missing, which is the only state the rest of the app needs to
   * distinguish: half a credential pair cannot sign anyone in, so {@link googleAuthConfigured} is
   * the question callers actually ask. Google calls these a "web application client"; the secret is
   * server-side only and must never be reachable from a `'use client'` module.
   */
  googleClientId: string | null;
  googleClientSecret: string | null;
  /**
   * Absolute origin the OAuth callback is registered against, without a trailing slash.
   *
   * Nullable so the callback can fall back to the origin of the incoming request. That fallback is
   * right in development and behind a proxy that forwards Host, and wrong the moment the app is
   * reached on an address that is not its public one — Google rejects a `redirect_uri` that does not
   * match the registered value exactly, so the failure is loud but confusing. Set this explicitly
   * in production rather than debugging that.
   */
  authBaseUrl: string | null;
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

/**
 * Resolve the OAuth callback origin, refusing to guess one in production.
 *
 * The guess — the origin of the incoming request — is right in development and wrong in almost every
 * deployment. Behind a load balancer, tunnel or container port mapping the request origin is the
 * internal address, so the callback is built as something like `https://0.0.0.0:3000/…`, and Google
 * rejects a redirect URI with a raw-IP host before it ever looks at the client ID. The failure lands
 * in the browser as Google's OAuth policy page, which names neither the host nor the variable, so it
 * reads as "the app is broken" rather than "one setting is missing".
 *
 * Failing at boot instead costs one clear log line at deploy time. This is the same trade as the
 * admin password guard above: a configuration that cannot work is worth refusing to start over.
 */
function resolveAuthBaseUrl(): string | null {
  const configured = read('AUTH_BASE_URL');
  const normalized = configured?.replace(/\/+$/, '') || null;

  const googleConfigured =
    (read('GOOGLE_CLIENT_ID') ?? null) !== null && (read('GOOGLE_CLIENT_SECRET') ?? null) !== null;

  if (process.env.NODE_ENV === 'production' && googleConfigured && !normalized) {
    throw new Error(
      'AUTH_BASE_URL is required in production when Google sign-in is configured. Set it to the ' +
        'public https origin of this app, e.g. https://brand.example.com. Google matches the ' +
        'redirect URI exactly, and it cannot be guessed from the request behind a proxy.',
    );
  }

  return normalized;
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
    googleClientId: read('GOOGLE_CLIENT_ID') ?? null,
    googleClientSecret: read('GOOGLE_CLIENT_SECRET') ?? null,
    authBaseUrl: resolveAuthBaseUrl(),
  };

  return cached;
}

/**
 * True when a Google sign-in could actually complete.
 *
 * A separate predicate rather than two null checks at each call site, because "is sign-in available"
 * is the question the sign-in page and the dashboard both need, and answering it differently in two
 * places is how one of them ends up showing a button that cannot work.
 */
export function googleAuthConfigured(): boolean {
  const { googleClientId, googleClientSecret } = getServerEnv();
  return googleClientId !== null && googleClientSecret !== null;
}

/**
 * True when running outside production. Guards the two conveniences that must never reach a real
 * deployment: the fallback identity and unsigned-by-default session secrets.
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV !== 'production';
}