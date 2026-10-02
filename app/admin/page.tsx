import type { Metadata } from 'next';
import Link from 'next/link';
import { Radio } from 'lucide-react';
import AdminConsole from './AdminConsole';
import AdminLogin from './AdminLogin';
import { adminPasswordIsWeak } from '@/lib/auth/admin';
import { can } from '@/lib/auth/permissions';
import { getSessionUser } from '@/lib/auth/session';
import { getPool } from '@/lib/db/pool';
import { listBrands } from '@/lib/db/repositories/brands';
import { listStores } from '@/lib/db/repositories/stores';
import { Eyebrow } from '@/components/ui/Section';

/**
 * The admin console at /admin.
 *
 * A server component, because the only question this page has to answer — is the caller an admin? —
 * cannot be answered in the browser. The role comes from a signed cookie plus a row in `users`, and
 * deciding it client-side would mean the console's markup shipped to anyone who asked for it, with the
 * data left to arrive or not depending on what each API call decided separately. Instead the gate runs
 * here, and the browser only ever receives the sign-in form or the console.
 *
 * The data is read here too, for the same reason: the console's first paint needs no loading state and
 * no client waterfall.
 */

export const metadata: Metadata = {
  title: 'Admin',
  description: 'Manage brands and stores across the String Theory network.',
  // Belt and braces with the server-side gate below: a crawler or a shared link should not index a
  // console, and robots.txt is not something an admin should have to remember to update.
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  // A database fault is reported rather than thrown. This is an operations page: someone signing in
  // to fix something is the worst possible moment to be shown a stack trace, and a 500 would be
  // indistinguishable from a broken login.
  let session: { kind: 'admin'; fullName: string; email: string } | { kind: 'member' | 'anonymous' };

  try {
    const actor = await getSessionUser();
    session =
      actor && can(actor.role, 'user:manage')
        ? { kind: 'admin', fullName: actor.fullName, email: actor.email }
        : { kind: actor ? 'member' : 'anonymous' };
  } catch (error) {
    console.error('[admin] session lookup failed', error);
    return <Shell>
      <div className="max-w-measure">
        <Eyebrow>Admin</Eyebrow>
        <h1 className="type-display mt-6 text-[length:var(--type-h2)] text-ink">
          The console cannot reach the database.
        </h1>
        <p className="type-lead mt-6">
          Signing in needs the users table, so there is nothing to show until the connection is back.
          This is usually a stopped container or an unreachable instance — try again in a moment.
        </p>
      </div>
    </Shell>;
  }

  if (session.kind !== 'admin') {
    return (
      <Shell>
        <div className="max-w-measure">
          <Eyebrow>Admin</Eyebrow>
          <h1 className="type-display mt-6 text-[length:var(--type-h2)] text-ink">Network admin</h1>
          <p className="type-lead mt-6">
            Sign in to see every brand and store across the network, add new ones, and remove the ones
            that are no longer trading.
          </p>

          {session.kind === 'member' && (
            <p
              role="status"
              className="mt-8 rounded-md border border-state-run bg-paper px-5 py-4 text-[length:var(--type-small)] text-state-run"
            >
              You are already signed in, but not as an administrator. Sign in below with an admin
              account to replace that session.
            </p>
          )}

          <AdminLogin />
        </div>
      </Shell>
    );
  }

  // Read here rather than in the client: the console's first paint needs no loading state, and a
  // server-rendered list cannot briefly show a stale or partial set of rows.
  const [brands, stores] = await Promise.all([listBrands(getPool()), listStores(getPool())]);

  return (
    <Shell>
      <AdminConsole
        admin={{ fullName: session.fullName, email: session.email }}
        initialBrands={brands}
        initialStores={stores}
        weakPasswordWarning={adminPasswordIsWeak()}
      />
    </Shell>
  );
}

/**
 * The frame.
 *
 * Its own copy rather than `CampaignShell`, because that one names itself after the campaign flow and
 * is shared with `/campaigns/new`. The header is otherwise the same deliberately quiet treatment —
 * same wordmark, same height — so leaving the marketing site for an internal tool still feels like
 * moving within one product.
 */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="border-b border-line">
        <div
          className="mx-auto flex w-full max-w-shell items-center justify-between gap-4 px-5 sm:px-8"
          style={{ height: 'var(--header-height)' }}
        >
          <Link
            href="/"
            className="flex min-h-tap items-center gap-2.5 rounded-md text-ink"
            aria-label="String Theory — home"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-ink text-paper-raised">
              <Radio className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <span className="text-[1.1875rem] font-semibold tracking-tight">
              String<span className="text-ink-muted">Theory</span>
            </span>
          </Link>

          <Link
            href="/"
            className="inline-flex min-h-tap items-center rounded-pill px-4 text-[length:var(--type-small)] font-medium text-ink-muted transition-colors duration-fast ease-out hover:text-ink"
          >
            Back to site
          </Link>
        </div>
      </header>

      <main id="main" className="flex-1">
        <div className="mx-auto w-full max-w-shell px-5 pb-24 pt-14 sm:px-8 sm:pb-32 sm:pt-20">
          {children}
        </div>
      </main>
    </div>
  );
}
