import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, FileVideo, LogOut, Plus, Radio } from 'lucide-react';
import CampaignShell from '@/components/campaigns/CampaignShell';
import GoogleSignInButton from '@/components/dashboard/GoogleSignInButton';
import SignOutButton from '@/components/dashboard/SignOutButton';
import { Eyebrow } from '@/components/ui/Section';
import { getSessionUser } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { getPool } from '@/lib/db/pool';
import { listBrandsForUser } from '@/lib/db/repositories/brands';
import { listCampaignsForUser } from '@/lib/db/repositories/campaigns';
import { googleAuthConfigured } from '@/lib/env';
import type { CampaignSummary, CampaignStatus, User, VideoStatus } from '@/lib/db/types';

/**
 * The brand dashboard.
 *
 * A server component, and that is the whole design rather than a default. The two questions this page
 * answers — who is signed in, and which campaigns do they own — both need the database: the role and
 * every campaign come from `users` and `campaigns`, and the campaign list is scoped by an owner id
 * that only exists server-side. Deciding either in the browser would ship the whole page to anyone who
 * asked for it and leave the rows to arrive or not depending on what each API call separately allowed.
 *
 * So the browser receives one of exactly two things: a sign-in prompt, or the dashboard. There is no
 * third state where the shell renders and the list is still loading, and no state where the list is
 * present but the header says someone else is signed in.
 */

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Your campaigns, your brands, and your account.',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * Status pills.
 *
 * Every one pairs a colour with a text label, so the state is never carried by colour alone — the
 * campaign page's `STATUS_TONE`/`VIDEO_TONE` do the same, and a dashboard that used a third scale
 * would make the same fact look different in two places.
 */
const CAMPAIGN_TONE: Record<CampaignStatus, string> = {
  DRAFT: 'bg-paper-sunk text-ink-muted',
  IN_REVIEW: 'bg-accent-wash text-accent',
  SCHEDULED: 'bg-accent-wash text-accent',
  LIVE: 'bg-accent-wash text-state-ok',
  PAUSED: 'bg-paper-sunk text-state-wait',
  COMPLETED: 'bg-paper-sunk text-ink-muted',
  CANCELLED: 'bg-paper-sunk text-state-error',
};

const VIDEO_TONE: Record<VideoStatus, string> = {
  AWAITING_UPLOAD: 'bg-paper-sunk text-state-wait',
  UPLOADING: 'bg-accent-wash text-accent',
  UPLOADED: 'bg-accent-wash text-accent',
  PROCESSING: 'bg-accent-wash text-accent',
  ENCODING: 'bg-accent-wash text-accent',
  RETRYING: 'bg-paper-sunk text-state-wait',
  READY: 'bg-accent-wash text-state-ok',
  FAILED: 'bg-paper-sunk text-state-error',
};

function readable(value: string): string {
  return value.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
}

/** A short, absolute date. `en-GB` because the server may not carry the same locale as the browser. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function pill(label: string, tone: string) {
  return (
    <span
      className={`inline-flex items-center rounded-pill px-2.5 py-1 text-[length:var(--type-small)] font-medium ${tone}`}
    >
      {label}
    </span>
  );
}

export default async function DashboardPage() {
  // Reported rather than thrown, for the reason `/admin` does the same: someone opening the dashboard
  // to check on a campaign is the worst possible moment to be shown a stack trace.
  let user: User | null;
  try {
    user = await getSessionUser();
  } catch (error) {
    console.error('[dashboard] session lookup failed', error);
    return (
      <CampaignShell>
        <div className="mx-auto w-full max-w-shell px-5 py-28 sm:px-8 sm:py-36">
          <div className="max-w-measure">
            <Eyebrow>Dashboard</Eyebrow>
            <h1 className="type-display mt-6 text-[length:var(--type-h2)] text-ink">
              We cannot reach the database.
            </h1>
            <p className="type-lead mt-6">
              Your dashboard needs your brands and campaigns, so there is nothing to show until the
              connection is back. This is usually a stopped container or an unreachable instance — try
              again in a moment.
            </p>
          </div>
        </div>
      </CampaignShell>
    );
  }

  if (!user) {
    return (
      <CampaignShell>
        <div className="mx-auto w-full max-w-shell px-5 pb-24 pt-14 sm:px-8 sm:pb-32 sm:pt-20">
          <div className="max-w-measure">
            <Eyebrow>Dashboard</Eyebrow>
            <h1 className="type-display mt-6 text-[length:var(--type-h2)] text-ink">
              Sign in to see your campaigns.
            </h1>
            <p className="type-lead mt-6">
              Your brands, your campaigns and their video processing all live behind your account.
            </p>

            {googleAuthConfigured() ? (
              <div className="mt-10">
                <GoogleSignInButton next="/dashboard" />
              </div>
            ) : (
              <p
                role="status"
                className="mt-10 rounded-md border border-line bg-paper-sunk px-5 py-5 text-[length:var(--type-body)] text-ink-muted"
              >
                Google sign-in is not configured on this server, so there is no way to sign in yet.
              </p>
            )}

            <p className="mt-8 text-[length:var(--type-body)] text-ink-muted">
              Not ready to sign in?{' '}
              <Link href="/campaigns/new" className="underline underline-offset-2 hover:text-ink">
                Start a campaign
              </Link>{' '}
              and we will keep it against your email address.
            </p>
          </div>
        </div>
      </CampaignShell>
    );
  }

  // Both reads at once: the dashboard's first paint should not wait for the second query.
  const [campaigns, brands] = await Promise.all([
    listCampaignsForUser(getPool(), user.id),
    listBrandsForUser(getPool(), user.id),
  ]);

  return (
    <CampaignShell user={{ fullName: user.fullName, email: user.email }}>
      <div className="mx-auto w-full max-w-shell px-5 pb-24 pt-14 sm:px-8 sm:pb-32 sm:pt-20">
        <ProfileCard user={user} />

        <div className="mt-14 grid gap-10 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-12">
          <section aria-labelledby="campaigns-heading">
            <div className="flex flex-wrap items-baseline justify-between gap-4">
              <h2
                id="campaigns-heading"
                className="type-display text-[length:var(--type-h3)] text-ink"
              >
                Your campaigns
              </h2>
              <p className="text-[length:var(--type-small)] text-ink-muted">
                {campaigns.length === 0
                  ? 'None yet'
                  : `${campaigns.length} ${campaigns.length === 1 ? 'campaign' : 'campaigns'}`}
              </p>
            </div>

            <div className="mt-6">
              {campaigns.length === 0 ? (
                <div className="card p-7 sm:p-8">
                  <Radio
                    className="h-7 w-7 text-ink-muted"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                  <h3 className="type-display mt-5 text-[length:var(--type-h4,1.25rem)] text-ink">
                    Nothing here yet.
                  </h3>
                  <p className="mt-3 max-w-measure text-[length:var(--type-body)] leading-relaxed text-ink-muted">
                    Start a campaign and it will appear here with its video, its state and everything
                    that has happened to it.
                  </p>
                  <Link href="/campaigns/new" className="btn-primary mt-7">
                    <span>Start a campaign</span>
                    <ArrowRight
                      className="h-4 w-4 transition-transform duration-fast ease-out"
                      aria-hidden="true"
                    />
                  </Link>
                </div>
              ) : (
                <ul className="flex flex-col gap-4">
                  {campaigns.map((campaign) => (
                    <CampaignRow key={campaign.id} campaign={campaign} />
                  ))}
                </ul>
              )}
            </div>
          </section>

          <aside className="flex flex-col gap-4 lg:sticky lg:top-[calc(var(--header-height)+var(--space-6))]">
            <Link href="/campaigns/new" className="btn-primary">
              <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              <span>Start a campaign</span>
            </Link>

            <div className="card p-6">
              <p className="type-eyebrow text-accent">Your brands</p>
              {brands.length === 0 ? (
                <p className="mt-4 text-[length:var(--type-small)] leading-relaxed text-ink-muted">
                  A brand is created for you the first time you submit a campaign.
                </p>
              ) : (
                <ul className="mt-4 flex flex-col gap-3">
                  {brands.map((brand) => (
                    <li key={brand.id}>
                      <p className="text-[length:var(--type-body)] font-medium text-ink">
                        {brand.name}
                      </p>
                      <p className="mt-0.5 text-[length:var(--type-small)] text-ink-muted">
                        {brand.website ? (
                          <a
                            href={brand.website}
                            rel="noopener noreferrer nofollow"
                            target="_blank"
                            className="underline underline-offset-2 hover:text-ink"
                          >
                            {brand.website.replace(/^https?:\/\//, '')}
                          </a>
                        ) : (
                          readable(brand.status)
                        )}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* A STORE account signed in on a brand surface is a real state — the seeded cafe login
                is exactly it — so it is explained rather than left as a dashboard that cannot fill. */}
            {!can(user.role, 'campaign:create') && (
              <div
                role="status"
                className="rounded-md border border-state-run bg-paper px-5 py-4 text-[length:var(--type-small)] leading-relaxed text-state-run"
              >
                This account manages screens rather than campaigns, so it cannot start one. Ask an
                administrator for a brand account.
              </div>
            )}
          </aside>
        </div>
      </div>
    </CampaignShell>
  );
}

/**
 * The signed-in profile.
 *
 * Shows the account as it actually is rather than a form that could edit it: the address here is the
 * one Google proved, so presenting an editable email field would imply it can be changed here, and it
 * cannot — it changes at Google and takes effect at the next sign-in.
 */
function ProfileCard({ user }: { user: User }) {
  return (
    <section
      aria-labelledby="profile-heading"
      className="card p-7 sm:p-9"
    >
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex items-center gap-5">
          <Avatar user={user} />
          <div>
            <h1
              id="profile-heading"
              className="type-display text-[length:var(--type-h3)] text-ink"
            >
              {user.fullName}
            </h1>
            <p className="mt-1 text-[length:var(--type-body)] text-ink-muted">{user.email}</p>
            <p className="mt-2 flex flex-wrap items-center gap-2">
              {pill(readable(user.role), 'bg-accent-wash text-accent')}
              {user.googleSubject && (
                <span className="text-[length:var(--type-small)] text-ink-muted">
                  Connected with Google
                </span>
              )}
            </p>
          </div>
        </div>

        <SignOutButton />
      </div>

      <dl className="mt-8 grid gap-x-8 gap-y-4 border-t border-line pt-6 sm:grid-cols-2">
        <div>
          <dt className="text-[length:var(--type-small)] text-ink-muted">Member since</dt>
          <dd className="mt-1 text-[length:var(--type-body)] font-medium text-ink">
            {formatDate(user.createdAt)}
          </dd>
        </div>
        <div>
          <dt className="text-[length:var(--type-small)] text-ink-muted">Email verified</dt>
          <dd className="mt-1 text-[length:var(--type-body)] font-medium text-ink">
            {user.emailVerifiedAt ? `By Google, ${formatDate(user.emailVerifiedAt)}` : 'Not verified'}
          </dd>
        </div>
      </dl>
    </section>
  );
}

/**
 * The avatar, with a fallback that needs no network.
 *
 * Google's picture URLs are not covered by any guarantee we control, so this renders an initial
 * rather than an `<img>` that can break. `next/image` is deliberately not used: the host is not on
 * the allowlist and adding it would mean proxying every avatar through this app for no benefit.
 */
function Avatar({ user }: { user: User }) {
  const initial = user.fullName.trim().charAt(0).toUpperCase() || '?';

  return (
    <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-paper-sunk text-[length:var(--type-h3)] font-semibold text-ink-muted">
      {user.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- see above: an external host that is
        // not on the next/image allowlist, and an avatar that must never be able to break the header.
        <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        initial
      )}
    </span>
  );
}

/**
 * One campaign.
 *
 * The whole row is a link, because every reason to look at a campaign here — its state, its video, its
 * brand — is answered by the campaign page, and a row with three separate targets would be three times
 * as much tab stop for the same destination. The status pills inside it are not links of their own.
 */
function CampaignRow({ campaign }: { campaign: CampaignSummary }) {
  return (
    <li>
      <Link
        href={`/campaigns/${campaign.id}`}
        className="card card-hover block p-6 transition-colors duration-fast ease-out"
      >
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h3 className="type-display text-[length:var(--type-h4,1.25rem)] text-ink">
              {campaign.name}
            </h3>
            <p className="mt-1 text-[length:var(--type-small)] text-ink-muted">
              {campaign.brandName} · started {formatDate(campaign.createdAt)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {pill(readable(campaign.status), CAMPAIGN_TONE[campaign.status])}
            {campaign.videoStatus &&
              pill(
                `Video ${readable(campaign.videoStatus).toLowerCase()}`,
                VIDEO_TONE[campaign.videoStatus],
              )}
          </div>
        </div>

        {campaign.description && (
          <p className="mt-4 line-clamp-2 text-[length:var(--type-small)] leading-relaxed text-ink-muted">
            {campaign.description}
          </p>
        )}

        {campaign.videoFileName && (
          <p className="mt-4 flex items-center gap-2 text-[length:var(--type-small)] text-ink-muted">
            <FileVideo className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
            <span className="truncate">{campaign.videoFileName}</span>
          </p>
        )}
      </Link>
    </li>
  );
}