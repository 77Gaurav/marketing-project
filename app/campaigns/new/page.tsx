import type { Metadata } from 'next';
import Link from 'next/link';
import { BarChart3, MapPin, ShieldCheck, Sparkles } from 'lucide-react';
import CampaignShell from '@/components/campaigns/CampaignShell';
import CampaignForm from '@/components/campaigns/CampaignForm';
import GoogleSignInButton from '@/components/dashboard/GoogleSignInButton';
import { Eyebrow } from '@/components/ui/Section';
import { getSessionUser } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { getServerEnv, googleAuthConfigured } from '@/lib/env';
import type { User } from '@/lib/db/types';

export const metadata: Metadata = {
  title: 'Start a campaign',
  description:
    'Tell String Theory about your brand and campaign, and we will match it to the screens your audience already visits.',
};

/**
 * The campaign creation flow, in place of the old three-step modal.
 *
 * A full page rather than a dialog, for two reasons that are about the product and not the
 * implementation: the form is long enough that a scroll-locked box is hostile on a phone, and the
 * URL is now bookmarkable, shareable and linkable from every "Start a campaign" CTA on the site.
 *
 * The session is resolved here rather than in the client because the answer changes what this page is:
 * a signed-in visitor gets the form, an anonymous one gets a sign-in prompt, and a STORE account gets
 * an explanation. Deciding that in the browser would mean shipping the form to everyone and letting
 * the API refuse afterwards — which is exactly the dead end this page now avoids.
 */

const NEXT_STEPS = [
  {
    icon: Sparkles,
    title: 'We read the brief',
    body: 'Audience, tone and offer. A person reviews every campaign before it goes near the network.',
  },
  {
    icon: MapPin,
    title: 'We shortlist venues',
    body: 'Cafés, gyms and stores whose footfall profile matches the audience you described.',
  },
  {
    icon: ShieldCheck,
    title: 'You choose the screens',
    body: 'Nothing is published anywhere until you approve the exact locations and schedule.',
  },
  {
    icon: BarChart3,
    title: 'You see every play',
    body: 'Per-screen and per-venue numbers, reported daily for the life of the campaign.',
  },
];

export const dynamic = 'force-dynamic';

export default async function NewCampaignPage() {
  // Reported rather than thrown: a database blip here would otherwise be a 500 with a stack trace
  // where a person was trying to buy something.
  let user: User | null = null;
  try {
    user = await getSessionUser();
  } catch (error) {
    console.error('[campaigns/new] session lookup failed', error);
  }

  const env = getServerEnv();
  // `user && can(user.role, …)` rather than precomputing a boolean: TypeScript narrows through the
  // `user` check itself, so every use of `user` below is known non-null without an assertion. A
  // `const allowed = signedIn && can(user.role, …)` flag would hide `user` behind a boolean the
  // compiler cannot follow, and the only way to satisfy it afterwards would be `!`.
  const allowed = user !== null && can(user.role, 'campaign:create');
  const needsSignIn = user === null && !env.allowUnauthenticatedSignup;
  // The shell header, for every branch that renders once an account is known.
  const shellUser = user ? { fullName: user.fullName, email: user.email } : undefined;

  const frame = (
    <>
      <div className="max-w-measure">
        <Eyebrow>Start a campaign</Eyebrow>
        <h1 className="type-display mt-6 text-[length:var(--type-h2)] text-ink">
          Tell us about the brand.
        </h1>
        <p className="type-lead mt-6">
          Six details and we can start matching you to real screens. Nothing is charged, and nothing
          goes live without your approval.
        </p>
      </div>

      {user && allowed && (
        <p
          role="status"
          className="mt-8 inline-flex flex-wrap items-baseline gap-2 rounded-pill bg-paper-sunk px-4 py-2 text-[length:var(--type-small)] text-ink-muted"
        >
          <span>Signed in as</span>
          <span className="font-medium text-ink">{user.fullName}</span>
          <span aria-hidden="true">·</span>
          <Link href="/dashboard" className="underline underline-offset-2 hover:text-ink">
            View your campaigns
          </Link>
        </p>
      )}
    </>
  );

  const aside = (
    <aside className="card p-6 lg:sticky lg:top-[calc(var(--header-height)+var(--space-6))] lg:p-7">
      <p className="type-eyebrow text-accent">What happens next</p>
      <ol className="mt-6 flex flex-col gap-6">
        {NEXT_STEPS.map((step) => (
          <li key={step.title} className="flex gap-3.5">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-paper-sunk text-ink-muted"
              aria-hidden="true"
            >
              <step.icon className="h-4 w-4" strokeWidth={1.5} />
            </span>
            <div>
              <p className="text-[length:var(--type-small)] font-semibold text-ink">{step.title}</p>
              <p className="mt-1 text-[length:var(--type-small)] leading-relaxed text-ink-muted">
                {step.body}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </aside>
  );

  // An account that exists but may not create campaigns gets told why, rather than shown a form that
  // would be refused at the last step.
  if (user && !allowed) {
    return (
      <CampaignShell user={{ fullName: user.fullName, email: user.email }}>
        <div className="mx-auto w-full max-w-shell px-5 pb-24 pt-14 sm:px-8 sm:pb-32 sm:pt-20">
          <div className="max-w-measure">
            <Eyebrow>Start a campaign</Eyebrow>
            <h1 className="type-display mt-6 text-[length:var(--type-h2)] text-ink">
              This account runs screens, not campaigns.
            </h1>
            <p className="type-lead mt-6">
              You are signed in as {user.fullName}, and that account manages venues and their displays.
              Campaigns are bought by brand accounts. Ask an administrator to switch yours over and
              this page will become the form.
            </p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <Link href="/dashboard" className="btn-primary">
                <span>Go to your dashboard</span>
              </Link>
              <Link href="/" className="btn-secondary">
                Back to site
              </Link>
            </div>
          </div>
        </div>
      </CampaignShell>
    );
  }

  // Production, with unauthenticated signup off: a campaign must belong to an account, so this is
  // where a visitor is sent to sign in. Reachable as a dead end otherwise, which is what prompted
  // the original "Sign in to create a campaign" failure.
  if (needsSignIn) {
    return (
      <CampaignShell user={shellUser}>
        <div className="mx-auto w-full max-w-shell px-5 pb-24 pt-14 sm:px-8 sm:pb-32 sm:pt-20">
          <div className="max-w-measure">
            <Eyebrow>Start a campaign</Eyebrow>
            <h1 className="type-display mt-6 text-[length:var(--type-h2)] text-ink">
              Sign in to start a campaign.
            </h1>
            <p className="type-lead mt-6">
              A campaign belongs to an account, so that it can be picked up by a colleague, reported
              against, and found again next week. It takes one button.
            </p>

            {googleAuthConfigured() ? (
              <div className="mt-10">
                <GoogleSignInButton next="/campaigns/new" />
              </div>
            ) : (
              <p
                role="status"
                className="mt-10 rounded-md border border-line bg-paper-sunk px-5 py-5 text-[length:var(--type-body)] text-ink-muted"
              >
                Google sign-in is not configured on this server, so campaigns cannot be started yet.
              </p>
            )}

            <p className="mt-8 text-[length:var(--type-body)] text-ink-muted">
              Already started one?{' '}
              <Link href="/dashboard" className="underline underline-offset-2 hover:text-ink">
                Sign in to see your campaigns
              </Link>
              .
            </p>
          </div>
        </div>
      </CampaignShell>
    );
  }

  return (
    <CampaignShell user={shellUser}>
      <div className="mx-auto w-full max-w-shell px-5 pb-24 pt-14 sm:px-8 sm:pb-32 sm:pt-20">
        {frame}

        <div className="mt-12 grid gap-10 lg:mt-16 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-12">
          <CampaignForm />
          {aside}
        </div>
      </div>
    </CampaignShell>
  );
}