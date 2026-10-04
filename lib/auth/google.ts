import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { googleAuthConfigured, getServerEnv } from '@/lib/env';

/**
 * Google OAuth, authorization-code flow with PKCE.
 *
 * Hand-rolled rather than pulled from a provider library, because `lib/auth/session.ts` is already a
 * hand-rolled signed cookie: a provider library would mint its own session format and every route
 * above it would have to learn a second way of asking who the caller is. This module stops at the
 * point where it holds a verified identity — turning that into a session is the existing
 * `createSessionToken`, and replacing this file with Auth.js later is a change to this file alone.
 *
 * What it will not do:
 *   * accept an unverified address (see {@link readProfile})
 *   * accept a `state` it did not mint, or reuse one twice (see {@link completeAuthorization})
 *   * accept a code without the verifier it was challenged with (PKCE, below)
 *   * take a client secret from anywhere but the environment
 *
 * It also never keeps a Google token. The callback reads the profile once and discards the access
 * token immediately; the session cookie is what authenticates every later request. A long-lived
 * Google credential for a marketing site is a liability with no upside.
 */

const AUTHORIZE_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';

/**
 * `openid` for a real ID token, `email` and `profile` for the address and picture. No
 * `https://www.googleapis.com/auth/...` scopes: nothing here calls a Google API on the user's behalf,
 * and requesting Drive or Calendar access would be asking for a permission this product never uses.
 */
const SCOPE = 'openid email profile';

/** Long enough for a slow round trip to Google, short enough that an abandoned attempt expires. */
const STATE_MAX_AGE_SECONDS = 600;

const TOKEN_EXCHANGE_TIMEOUT_MS = 10_000;
const PROFILE_TIMEOUT_MS = 10_000;

/**
 * Everything that can go wrong, as a closed set.
 *
 * The routes map these to a message a person can read and a status a machine can branch on, which is
 * why the reasons are enumerated here instead of being string-matched at the call site. These
 * messages are safe to show; the underlying provider response never is.
 */
export type GoogleAuthFailure =
  /** The environment is missing half a credential pair. */
  | 'not_configured'
  /** `state` was absent, stale, or is not the value this server minted. */
  | 'state_mismatch'
  /** Google refused the code, or the exchange returned nothing usable. */
  | 'code_exchange_failed'
  /** The profile response was malformed, or lacked a usable identity. */
  | 'profile_failed'
  /**
   * Google says the address is not verified. Refused rather than trusted, because the account link
   * is made by email address and an unproven address is exactly what someone supplies to claim an
   * account they do not own.
   */
  | 'email_unverified'
  /**
   * The callback address this server built is one Google will refuse outright — a raw IP, a
   * non-loopback `http` origin, or `0.0.0.0`.
   *
   * Caught here because Google's own response is a validation page that reads like the app is broken
   * and names no cause. Refusing here turns it into a message that names the variable to fix.
   */
  | 'redirect_uri_invalid';

/**
 * A sign-in that cannot proceed, carrying the machine-readable reason the callback turns into a
 * redirect.
 *
 * `reason` is a separate declared field rather than a TypeScript constructor parameter property,
 * because this module is also loaded by the repo's plain-`node` scripts (`db:check` and friends run
 * with `--experimental-strip-types`), and type stripping cannot erase a parameter property — it would
 * make this file unloadable outside the bundler for no gain.
 */
export class GoogleAuthError extends Error {
  readonly reason: GoogleAuthFailure;

  constructor(reason: GoogleAuthFailure, message: string) {
    super(message);
    this.name = 'GoogleAuthError';
    this.reason = reason;
  }
}

/** The identity this module vouches for. Nothing downstream re-derives it. */
export interface GoogleProfile {
  /** The `sub` claim: opaque, stable, and the only true key of a Google account. */
  subject: string;
  /** Lowercased, and only ever populated from a verified address. */
  email: string;
  /** Display name, degrading rather than rendering an empty heading. */
  name: string;
  /** Presentation only: Google may serve a 404 for this at any time. */
  avatarUrl: string | null;
}

/**
 * What one authorization attempt consists of, and what has to survive the round trip to Google.
 *
 * `state` defends the response against being delivered to the wrong browser, and `codeVerifier`
 * defends the code against being replayed by whoever intercepted it. They travel together in one
 * cookie because they are minted together and consumed together.
 */
export interface AuthorizationAttempt {
  /** The value sent to Google and expected back unchanged. */
  state: string;
  /** The cookie value holding `state`, its timestamp and the verifier. */
  cookieValue: string;
  authorizeUrl: string;
}

function base64url(bytes: Buffer): string {
  return bytes.toString('base64url');
}

/**
 * Hosts Google accepts in a redirect URI, per Google's own client validation rules.
 *
 * The rules that matter here, quoted from Google's OAuth client guidance:
 *
 *   * "Redirect URIs must use the HTTPS scheme, not plain HTTP. Localhost URIs (domain localhost) are exempt from this rule."
 *   * "Hosts cannot be raw IP addresses (including 127.0.0.1 for Web applications)."
 *
 * So a public deployment needs a real hostname and TLS, and `http://localhost:3000` is fine for
 * development. Anything else — a bare IP, `127.0.0.1`, `0.0.0.0`, plain `http` on a public host — is refused by
 * Google before it looks at the client ID, which is why these are checked before the redirect.
 */
const LOOPBACK_HOSTS = new Set(['localhost']);

/** True for `1.2.3.4` and `::1`, false for a name. Strips the IPv6 brackets a URL host carries. */
function isIpAddress(host: string): boolean {
  const bare = host.replace(/^\[|\]$/g, '');
  if (bare.includes(':')) return true; // An IPv6 literal is the only host form containing a colon.
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(bare);
}

/**
 * Explain why Google would refuse this redirect URI, or null if it looks acceptable.
 *
 * Returns prose rather than throwing, so the caller decides whether this is fatal — the same check is
 * worth running in a startup assertion and in the sign-in route, and only the route should send
 * someone to a page about it.
 */
export function describeRedirectUriProblem(uri: string): string | null {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return `"${uri}" is not a valid URL.`;
  }

  const host = url.hostname.toLowerCase();
  const isLocalhost = host === 'localhost';

  // 0.0.0.0 is the bind address, not a destination: it is not a raw IP Google will host-match, and no
  // certificate can be issued for it. Naming it explicitly, because "put your public address here"
  // reads as though an IP address is acceptable, and the next step is otherwise a puzzle.
  if (host === '0.0.0.0' || host === '::') {
    return (
      `The callback address resolved to "${url.origin}", and 0.0.0.0 is the address a server binds ` +
      'to, not one a browser can reach. Set AUTH_BASE_URL to the address people actually open.'
    );
  }

  if (isIpAddress(host)) {
    return (
      `The callback address "${url.origin}" uses a raw IP address (${host}), and Google OAuth 2.0 ` +
      'policies reject raw IP addresses in redirect URIs for web applications. ' +
      'Use http://localhost:3000 or set AUTH_BASE_URL=http://localhost:3000.'
    );
  }

  if (url.protocol !== 'https:' && !isLocalhost) {
    return (
      `The callback address "${url.origin}" is not HTTPS, and Google requires HTTPS for anything ` +
      'other than localhost. Put TLS in front of this app, then set AUTH_BASE_URL to the https address.'
    );
  }

  return null;
}

/**
 * Start an attempt: mint `state` and a PKCE verifier, then build the URL to send the browser to.
 *
 * PKCE is included even though this is a confidential client that authenticates the exchange with a
 * client secret, because the two defend against different things: the secret stops a code being
 * redeemed by someone who does not have it, and PKCE stops a code intercepted in transit being
 * redeemed by anyone who does not. Sending `code_challenge_method` without a matching `code_challenge`
 * would be rejected by Google, so the two are always produced together here.
 */
export function beginAuthorization(input: { redirectUri: string }): AuthorizationAttempt {
  if (!googleAuthConfigured()) {
    throw new GoogleAuthError('not_configured', 'Google sign-in is not configured on this server.');
  }

  // Checked before the client ID, because this failure is independent of which project is
  // configured: no redirect URI of this shape would work, so reporting a client-ID problem would send
  // the reader to the wrong page.
  const problem = describeRedirectUriProblem(input.redirectUri);
  if (problem) {
    console.error(`[auth/google] refusing to start sign-in: ${problem}`);
    throw new GoogleAuthError('redirect_uri_invalid', problem);
  }

  const { googleClientId } = getServerEnv();
  if (!googleClientId) {
    throw new GoogleAuthError('not_configured', 'GOOGLE_CLIENT_ID is not set.');
  }

  // 32 random bytes for `state`, so guessing the value of an in-flight attempt is not a strategy.
  const state = base64url(randomBytes(32));
  // 64 bytes, base64url, which is within RFC 7636's 43–128 character requirement.
  const codeVerifier = base64url(randomBytes(64));
  const codeChallenge = base64url(createHash('sha256').update(codeVerifier).digest());

  const url = new URL(AUTHORIZE_ENDPOINT);
  url.searchParams.set('client_id', googleClientId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SCOPE);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  // An online-only grant: no refresh token, because nothing here acts as the user later.
  url.searchParams.set('access_type', 'online');
  // Not forcing `prompt=select_account`. A returning user re-picking an account on every visit is
  // the most common way to make a working sign-in feel broken.

  return {
    state,
    cookieValue: `${Date.now()}.${state}.${codeVerifier}`,
    authorizeUrl: url.toString(),
  };
}

/** A parsed state cookie. Null when it is malformed, which is treated as no attempt at all. */
interface StoredAttempt {
  at: number;
  state: string;
  codeVerifier: string;
}

function parseAttempt(cookieValue: string | undefined): StoredAttempt | null {
  if (!cookieValue) return null;

  const firstDot = cookieValue.indexOf('.');
  const secondDot = cookieValue.lastIndexOf('.');
  if (firstDot <= 0 || secondDot <= firstDot) return null;

  const at = Number(cookieValue.slice(0, firstDot));
  const state = cookieValue.slice(firstDot + 1, secondDot);
  const codeVerifier = cookieValue.slice(secondDot + 1);

  if (!Number.isFinite(at) || state === '' || codeVerifier === '') return null;

  return { at, state, codeVerifier };
}

/**
 * Constant-time comparison of the returned `state` against the stored one.
 *
 * `timingSafeEqual` throws on a length mismatch, so lengths are compared first and a mismatch is a
 * rejection rather than a crash. Both operands are attacker-controlled strings of arbitrary length,
 * which is why this cannot be `===` on a value that gates an account link.
 */
function statesMatch(expected: string, received: string | null): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(received ?? '');
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

/**
 * Finish an attempt: validate what came back, redeem the code, return the verified identity.
 *
 * The order is the security property and is not rearrangeable by a caller that only wants the
 * profile: state and freshness are checked before the code is spent, so a forged callback cannot
 * make this server call Google's token endpoint, and the address is verified before it is returned,
 * so no caller can act on an unproven one.
 */
export async function completeAuthorization(input: {
  cookieValue: string | undefined;
  returnedState: string | null;
  code: string;
  redirectUri: string;
  now?: number;
}): Promise<GoogleProfile> {
  const attempt = parseAttempt(input.cookieValue);

  if (!attempt) {
    throw new GoogleAuthError('state_mismatch', 'This sign-in attempt did not start here.');
  }

  const ageSeconds = ((input.now ?? Date.now()) - attempt.at) / 1000;
  if (ageSeconds > STATE_MAX_AGE_SECONDS || ageSeconds < -STATE_MAX_AGE_SECONDS) {
    // Also rejects a cookie dated in the future, which is what a clock-skewed or tampered cookie
    // looks like. Without this a value that never expires could be replayed indefinitely.
    throw new GoogleAuthError('state_mismatch', 'This sign-in attempt has expired. Try again.');
  }

  if (!statesMatch(attempt.state, input.returnedState)) {
    throw new GoogleAuthError('state_mismatch', 'This sign-in attempt did not start here.');
  }

  if (!googleAuthConfigured()) {
    throw new GoogleAuthError('not_configured', 'Google sign-in is not configured on this server.');
  }

  const { accessToken } = await redeemCode({
    code: input.code,
    codeVerifier: attempt.codeVerifier,
    redirectUri: input.redirectUri,
  });

  return readProfile(accessToken);
}

/** Exchange the authorization code for an access token, proving possession of the verifier. */
async function redeemCode(input: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<{ accessToken: string }> {
  const { googleClientId, googleClientSecret } = getServerEnv();
  if (!googleClientId || !googleClientSecret) {
    throw new GoogleAuthError('not_configured', 'Google OAuth credentials are not configured.');
  }

  let response: Response;
  try {
    response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: input.code,
        client_id: googleClientId,
        client_secret: googleClientSecret,
        // Must be byte-identical to the value sent to the authorize endpoint, or Google rejects the
        // exchange — which is why both are derived from one redirect URI rather than written twice.
        redirect_uri: input.redirectUri,
        grant_type: 'authorization_code',
        code_verifier: input.codeVerifier,
      }),
      signal: AbortSignal.timeout(TOKEN_EXCHANGE_TIMEOUT_MS),
    });
  } catch (error) {
    // A timeout or DNS failure is infrastructure, not a bad code. Logged where the cause is still
    // visible, reported as a failed exchange because the browser cannot act on the difference.
    console.error('[auth/google] token endpoint unreachable', error);
    throw new GoogleAuthError('code_exchange_failed', 'Could not reach the Google token endpoint.');
  }

  if (!response.ok) {
    // The body can echo the submitted code, so it goes to the log and never into the message.
    const detail = await response.text().catch(() => '');
    console.error(`[auth/google] token exchange rejected (${response.status})`, detail);
    throw new GoogleAuthError('code_exchange_failed', 'Google rejected the authorization code.');
  }

  const payload = (await response.json().catch(() => null)) as { access_token?: unknown } | null;
  const accessToken = payload?.access_token;
  if (typeof accessToken !== 'string' || accessToken === '') {
    throw new GoogleAuthError('code_exchange_failed', 'Google returned no access token.');
  }

  return { accessToken };
}

/**
 * Read the identity behind an access token.
 *
 * `email_verified` is checked and a profile without it is refused. That one check is what stops this
 * flow being an account-takeover primitive: the link to a local account is made by email address, so
 * anyone able to present *any* address as theirs could attach themselves to that account. Google
 * asserts `email_verified` only for an address the person has actually proven, which is the entire
 * reason this is a Google sign-in rather than a self-declared email form.
 */
async function readProfile(accessToken: string): Promise<GoogleProfile> {
  let response: Response;
  try {
    response = await fetch(USERINFO_ENDPOINT, {
      headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
      signal: AbortSignal.timeout(PROFILE_TIMEOUT_MS),
    });
  } catch (error) {
    console.error('[auth/google] userinfo endpoint unreachable', error);
    throw new GoogleAuthError('profile_failed', 'Could not reach the Google userinfo endpoint.');
  }

  if (!response.ok) {
    console.error(`[auth/google] userinfo rejected (${response.status})`);
    throw new GoogleAuthError('profile_failed', 'Google would not identify the signed-in account.');
  }

  const body = (await response.json().catch(() => null)) as {
    sub?: unknown;
    email?: unknown;
    email_verified?: unknown;
    name?: unknown;
    given_name?: unknown;
    family_name?: unknown;
    picture?: unknown;
  } | null;

  const subject = body?.sub;
  const email = body?.email;

  if (typeof subject !== 'string' || subject === '') {
    throw new GoogleAuthError('profile_failed', 'Google returned no account identifier.');
  }
  if (typeof email !== 'string' || email === '' || !email.includes('@')) {
    throw new GoogleAuthError('profile_failed', 'Google returned no usable email address.');
  }
  if (body?.email_verified !== true) {
    // Logged without the address: an unverified address is not obviously wrong, and the log should
    // record that this happened without becoming a list of addresses people tried to claim.
    console.warn('[auth/google] refused a Google account with no verified email address');
    throw new GoogleAuthError(
      'email_unverified',
      'That Google account has no verified email address.',
    );
  }

  return {
    subject,
    email: email.toLowerCase(),
    // Empty rather than a placeholder: `upsertGoogleUser` derives a sensible heading from the address
    // local part, and a hardcoded word here would become someone's actual name on the dashboard.
    name: displayName(body),
    avatarUrl: safePictureUrl(body?.picture),
  };
}

/**
 * A name to show, degrading rather than rendering an empty heading.
 *
 * Google omits `name` for accounts with no profile name set, which is common on accounts created
 * only to hold a Sign-In identity. Returns an empty string when there is genuinely nothing, which the
 * caller treats as "derive one" rather than as a name.
 */
function displayName(body: { name?: unknown; given_name?: unknown; family_name?: unknown }): string {
  if (typeof body.name === 'string' && body.name.trim() !== '') return body.name.trim();

  const parts = [body.given_name, body.family_name]
    .filter((part): part is string => typeof part === 'string' && part.trim() !== '')
    .map((part) => part.trim());
  if (parts.length > 0) return parts.join(' ');

  return '';
}

/**
 * The avatar URL, or null.
 *
 * Parsed rather than pattern-matched because this value is stored and later written into an `img src`,
 * and "starts with https" is a weaker claim than it looks: `https:` followed by anything can still be
 * an unexpected scheme to a browser. Parsing and re-serialising is what proves the whole thing is an
 * ordinary web address, and anything else becomes null — the dashboard draws an initial instead.
 */
function safePictureUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value === '') return null;

  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * The absolute origin to build the callback against.
 *
 * `AUTH_BASE_URL` when set, otherwise the origin of the request that started the flow. The fallback
 * is what lets a fresh clone work with no extra configuration; see {@link ServerEnv.authBaseUrl} for
 * why production should set it instead of relying on this.
 */
export function resolveAuthBase(requestUrl: string): string {
  const { authBaseUrl } = getServerEnv();
  if (authBaseUrl) return authBaseUrl;

  try {
    const url = new URL(requestUrl);
    // Google's OAuth 2.0 policy for web applications strictly forbids IP addresses (such as 127.0.0.1).
    // In development, map loopback IPs to localhost so Google accepts the redirect URI.
    if (url.hostname === '127.0.0.1' || url.hostname === '[::1]' || url.hostname === '::1') {
      url.hostname = 'localhost';
    }
    return url.origin;
  } catch {
    // A relative request URL is not something Next hands a route handler, so reporting it as a
    // provider misconfiguration would be a confusing way to describe a programming mistake.
    throw new GoogleAuthError('not_configured', 'Could not determine this app’s public origin.');
  }
}

/** The one path Google can be trusted to send the browser back to. */
export function callbackPath(): string {
  return '/api/auth/google/callback';
}

/**
 * Cookie holding the in-flight attempt: timestamp, `state` and PKCE verifier, minted together and
 * consumed together.
 */
export const OAUTH_ATTEMPT_COOKIE = 'st_oauth_attempt';

/** Where to land once signed in, carried through the round trip. Validated on the way back in. */
export const OAUTH_NEXT_COOKIE = 'st_oauth_next';

/** Ten minutes, matching the freshness window {@link completeAuthorization} enforces. */
export const OAUTH_ATTEMPT_MAX_AGE_SECONDS = 600;

/** Cookie attributes for both OAuth cookies. `lax` is required — see the note in the route. */
export function oauthCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: OAUTH_ATTEMPT_MAX_AGE_SECONDS,
  };
}

/**
 * Constrain a post-sign-in destination to this application.
 *
 * The rule is "a single leading slash, then no second slash of either kind". Rejecting `//` alone is
 * the version of this that looks right and is not: browsers normalise a backslash to a forward slash
 * when resolving a URL, so `/\evil.example` and `//evil.example` reach the same host. Control
 * characters are refused for the same family of reasons — a newline in a `Location` header splits it,
 * so `/%0d%0aSet-Cookie:…` would be a header injection if this value were ever written unencoded.
 *
 * Kept in one place on purpose: both the start route and the callback call this, because an
 * open-redirect allowlist that exists in two places is one place short of a vulnerability.
 */
export function safeNextPath(value: string | null | undefined): string {
  const fallback = '/dashboard';
  if (typeof value !== 'string' || value === '') return fallback;
  if (!value.startsWith('/')) return fallback;
  if (value.startsWith('//') || value.startsWith('/\\')) return fallback;
  // eslint-disable-next-line no-control-regex -- the point is to reject these, so the pattern has to
  // name them. Range written out rather than \s, which would also swallow legitimate whitespace.
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;

  return value;
}

/** Coarse, non-identifying message for a failure, safe to put in a URL the browser will render. */
export function messageForReason(reason: GoogleAuthFailure): string {
  switch (reason) {
    case 'not_configured':
      return 'Google sign-in is not configured on this server yet.';
    case 'redirect_uri_invalid':
      return (
        'This server is asking Google to return to an address Google will not accept. An ' +
        'administrator needs to set AUTH_BASE_URL to the public https address of this site.'
      );
    case 'state_mismatch':
      return 'That sign-in link expired or did not start here. Please try again.';
    case 'email_unverified':
      return 'Your Google account needs a verified email address before you can sign in.';
    case 'code_exchange_failed':
    case 'profile_failed':
    default:
      return 'Google could not complete the sign-in. Please try again.';
  }
}