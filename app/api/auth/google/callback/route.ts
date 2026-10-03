import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  GoogleAuthError,
  OAUTH_ATTEMPT_COOKIE,
  OAUTH_NEXT_COOKIE,
  callbackPath,
  completeAuthorization,
  oauthCookieOptions,
  resolveAuthBase,
  safeNextPath,
  type GoogleAuthFailure,
} from '@/lib/auth/google';
import { GoogleIdentityConflictError, upsertGoogleUser } from '@/lib/db/repositories/users';
import { getPool } from '@/lib/db/pool';
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from '@/lib/auth/session';
import { getServerEnv } from '@/lib/env';

/**
 * GET /api/auth/google/callback — finish a Google sign-in.
 *
 * The only route in the application that creates a session for a brand, and the only one that turns a
 * third party's word for who someone is into a local account. Four things happen here, in this order,
 * and the order is the security property:
 *
 *   1. `state` is checked against the cookie this server minted, and for freshness. A callback that
 *      did not start here is refused *before* the code is spent, so a forged callback cannot make
 *      this server call Google's token endpoint at all.
 *   2. The code is redeemed with the PKCE verifier it was challenged with.
 *   3. Google's `email_verified` is required, and the database enforces that a Google identity can
 *      never be attached to an unproven address.
 *   4. Only then is a session minted, and it carries nothing but the user id — the role is read from
 *      the database on every request, so a role change takes effect immediately rather than when the
 *      cookie happens to expire.
 *
 * Every failure redirects to `/signin` with a coarse reason. Nothing about Google's response, the
 * client secret, or the local account is echoed into the URL.
 */

export const dynamic = 'force-dynamic';

const SIGN_IN_PATH = '/signin';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);

  // Read every input once, at the top, so no branch can act on a parameter it has not looked at.
  const returnedState = requestUrl.searchParams.get('state');
  const code = requestUrl.searchParams.get('code');
  const oauthError = requestUrl.searchParams.get('error');
  const jar = cookies();
  const attemptCookie = jar.get(OAUTH_ATTEMPT_COOKIE)?.value;
  const nextCookie = jar.get(OAUTH_NEXT_COOKIE)?.value;

  // The attempt cookies are cleared on every path out of here, success or failure. Leaving them
  // behind after a failed sign-in would leave a live `state` in the browser for someone to find.
  const clearAttempt = (response: NextResponse) => {
    for (const name of [OAUTH_ATTEMPT_COOKIE, OAUTH_NEXT_COOKIE]) {
      response.cookies.set(name, '', { ...oauthCookieOptions(), maxAge: 0 });
    }
    return response;
  };

  const fail = (reason: GoogleAuthFailure) => {
    const target = new URL(SIGN_IN_PATH, requestUrl.origin);
    target.searchParams.set('error', reason);
    return clearAttempt(NextResponse.redirect(target));
  };

  // The person declined, or Google refused before asking us anything. `access_denied` is a choice,
  // not a fault, and saying so is friendlier than "something went wrong".
  if (oauthError) {
    console.warn(`[auth/google] provider returned an error: ${oauthError}`);
    const target = new URL(SIGN_IN_PATH, requestUrl.origin);
    target.searchParams.set(
      'error',
      oauthError === 'access_denied' ? 'access_denied' : 'provider_error',
    );
    return clearAttempt(NextResponse.redirect(target));
  }

  if (!code) {
    return fail('code_exchange_failed');
  }

  let profile;
  try {
    profile = await completeAuthorization({
      cookieValue: attemptCookie,
      returnedState,
      code,
      redirectUri: `${resolveAuthBase(requestUrl.origin)}${callbackPath()}`,
    });
  } catch (error) {
    if (error instanceof GoogleAuthError) {
      console.warn(`[auth/google] sign-in refused (${error.reason})`);
      return fail(error.reason);
    }
    console.error('[auth/google] unexpected failure during code exchange', error);
    return fail('code_exchange_failed');
  }

  // Past this point the address is verified by Google. Everything below trusts it.
  let account;
  try {
    account = await upsertGoogleUser(getPool(), {
      subject: profile.subject,
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
    });
  } catch (error) {
    if (error instanceof GoogleIdentityConflictError) {
      // Logged without the address: this is a real security event and the address is already known
      // to whoever holds the account, but the log is not the place to enumerate them.
      console.error('[auth/google] two Google accounts are claiming one local address');
      const target = new URL(SIGN_IN_PATH, requestUrl.origin);
      target.searchParams.set('error', 'identity_conflict');
      return clearAttempt(NextResponse.redirect(target));
    }
    console.error('[auth/google] could not resolve a local account', error);
    return fail('profile_failed');
  }

  const { sessionSecret } = getServerEnv();
  const target = new URL(safeNextPath(nextCookie), requestUrl.origin);

  const response = clearAttempt(NextResponse.redirect(target));

  response.cookies.set(SESSION_COOKIE, createSessionToken(account.user.id, sessionSecret), {
    ...sessionCookieOptions(),
  });

  if (account.created) {
    console.log('[auth/google] registered a new brand account', { userId: account.user.id });
  } else if (account.linked) {
    console.log('[auth/google] linked a Google identity to an existing account', {
      userId: account.user.id,
    });
  }

  return response;
}