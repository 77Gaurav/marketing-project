import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import CampaignShell from '@/components/campaigns/CampaignShell';
import GoogleSignInButton from '@/components/dashboard/GoogleSignInButton';
import { Eyebrow } from '@/components/ui/Section';
import { getSessionUser } from '@/lib/auth/session';
import { googleAuthConfigured, isDevelopment } from '@/lib/env';
import { messageForReason, safeNextPath, type GoogleAuthFailure } from '@/lib/auth/google';

/**
 * Sign in or register, with Google.
 *
 * One page and one button for both, because that is what OAuth actually is: there is no separate
 * registration step to write, and inventing one would only create a form whose output the callback
 * throws away. An address Google has not verified never becomes an account, so the only question this
 * page asks Google is "may I use this address for this person".
 *
 * A server component, for the same reason `/admin` is: whether anyone is signed in cannot be answered
 * in the browser, and a client-side flag would be a second source of truth for a question only the
 * session can settle. It also lets the page say something useful when sign-in is not configured at
 * all, which is otherwise a button that silently does nothing.
 */

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to String Theory with your Google account.',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * Failure reasons the callback can send back, mapped to something readable.
 *
 * A closed set rather than rendering whatever arrives in the query string: `error` is attacker-
 * controlled input, and passing it straight into the page would make this a place to put arbitrary
 * text in our own chrome.
 */
const FAILURE_MESSAGES: Record<string, string> = {
  not_configured: messageForReason('not_configured'),
  state_mismatch: messageForReason('state_mismatch'),
  email_unverified: messageForReason('email_unverified'),
  identity_conflict:
    'That email address is already connected to a different Google account. Contact us and we will sort it out.',
  access_denied: 'Sign-in was cancelled. Nothing has changed.',
  provider_error: 'Google could not complete the sign-in. Please try again.',
  code_exchange_failed: messageForReason('code_exchange_failed'),
  profile_failed: messageForReason('profile_failed'),
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: { error?: string; next?: string };
}) {
  // Already signed in? The dashboard is more useful than a second sign-in form.
  const user = await getSessionUser();
  if (user) {
    redirect(safeNextPath(searchParams.next));
  }

  const configured = googleAuthConfigured();
  // Constrained by `safeNextPath` before it reaches the href, so a crafted `next` cannot turn this
  // link into a redirect off-site after the round trip.
  const next = safeNextPath(searchParams.next);
  const failure = searchParams.error ? FAILURE_MESSAGES[searchParams.error] : undefined;

  return (
    <CampaignShell>
      <div className="mx-auto w-full max-w-shell px-5 pb-24 pt-14 sm:px-8 sm:pb-32 sm:pt-20">
        <div className="max-w-measure">
          <Eyebrow>Brand account</Eyebrow>
          <h1 className="type-display mt-6 text-[length:var(--type-h2)] text-ink">
            Sign in to String Theory.
          </h1>
          <p className="type-lead mt-6">
            One button. If this is your first time here we will create a brand account for you, and any
            campaigns already started with this email will be waiting when you arrive.
          </p>

          {failure && (
            <div
              role="alert"
              className="mt-8 rounded-md border border-state-error bg-paper px-5 py-4 text-[length:var(--type-body)] text-state-error"
            >
              {failure}
            </div>
          )}

          {configured ? (
            <div className="mt-10">
              <GoogleSignInButton next={next} />
            </div>
          ) : (
            <div
              role="status"
              className="mt-10 rounded-md border border-line bg-paper-sunk px-5 py-5 text-[length:var(--type-body)] text-ink-muted"
            >
              <p className="font-medium text-ink">Google sign-in is not set up on this server yet.</p>
              <p className="mt-2 leading-relaxed">
                An administrator needs to add <code className="font-mono text-[0.9em]">GOOGLE_CLIENT_ID</code>{' '}
                and <code className="font-mono text-[0.9em]">GOOGLE_CLIENT_SECRET</code> and restart
                the app. Until then there is no way to create a brand account here.
              </p>
            </div>
          )}

          <div className="mt-12 flex gap-3.5 border-t border-line pt-8">
            <ShieldCheck
              className="h-5 w-5 shrink-0 text-ink-muted"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <div>
              <p className="text-[length:var(--type-body)] font-medium text-ink">
                What we ask Google for, and what we do not
              </p>
              <ul className="mt-2 flex flex-col gap-1.5 text-[length:var(--type-small)] leading-relaxed text-ink-muted">
                <li>Your email address, your name and your profile picture — to create your account.</li>
                <li>
                  Nothing else. No Drive, no Calendar, no Gmail. We ask for no access to anything you
                  have not explicitly connected.
                </li>
                <li>
                  We keep no Google token. The sign-in button is used once, and your session with us is
                  our own signed cookie.
                </li>
              </ul>
            </div>
          </div>

          {!isDevelopment() && (
            <p className="mt-8 text-[length:var(--type-small)] text-ink-muted">
              Administrator?{' '}
              <a href="/admin" className="underline underline-offset-2 hover:text-ink">
                Sign in to the console
              </a>
              .
            </p>
          )}
        </div>
      </div>
    </CampaignShell>
  );
}