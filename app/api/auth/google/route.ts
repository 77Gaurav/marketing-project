import { NextResponse } from 'next/server';
import {
  GoogleAuthError,
  OAUTH_ATTEMPT_COOKIE,
  OAUTH_ATTEMPT_MAX_AGE_SECONDS,
  OAUTH_NEXT_COOKIE,
  beginAuthorization,
  callbackPath,
  oauthCookieOptions,
  resolveAuthBase,
  safeNextPath,
} from '@/lib/auth/google';

/**
 * GET /api/auth/google — start a Google sign-in.
 *
 * A redirect, not a form POST, because this is the top half of the OAuth authorization-code flow and
 * Google expects to be the thing answering the browser. Everything the callback will need is decided
 * here: the `state` that binds the response to this browser, the PKCE verifier behind the challenge,
 * and the redirect URI, which must match the registered value byte for byte or the exchange fails.
 *
 * Unauthenticated by necessity. This is where a session is *earned*.
 */

export const dynamic = 'force-dynamic';

/** Where the browser goes when sign-in cannot even start. A fixed internal path, never a parameter. */
const FAILURE_PATH = '/signin';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);

  let authorizeUrl: string;
  let cookieValue: string;

  try {
    const attempt = beginAuthorization({
      redirectUri: `${resolveAuthBase(requestUrl.origin)}${callbackPath()}`,
    });
    authorizeUrl = attempt.authorizeUrl;
    cookieValue = attempt.cookieValue;
  } catch (error) {
    const reason = error instanceof GoogleAuthError ? error.reason : 'not_configured';
    if (!(error instanceof GoogleAuthError)) {
      console.error('[auth/google] could not begin sign-in', error);
    }

    const target = new URL(FAILURE_PATH, requestUrl.origin);
    target.searchParams.set('error', reason);
    return NextResponse.redirect(target);
  }

  const response = NextResponse.redirect(authorizeUrl);
  const options = oauthCookieOptions();

  response.cookies.set(OAUTH_ATTEMPT_COOKIE, cookieValue, options);

  // Carried through the round trip so the callback knows where to land, and re-validated there — a
  // cookie the browser can rewrite is not a trustworthy input, so the allowlist is applied twice.
  response.cookies.set(
    OAUTH_NEXT_COOKIE,
    safeNextPath(requestUrl.searchParams.get('next')),
    options,
  );

  // Keeps the page the person came from out of the Referer header on the hop to Google.
  response.headers.set('referrer-policy', 'no-referrer');

  return response;
}