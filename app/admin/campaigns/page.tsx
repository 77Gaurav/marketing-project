import type { Metadata } from 'next';
import Link from 'next/link';
import { Radio } from 'lucide-react';
import AdminCampaignsConsole from './AdminCampaignsConsole';
import AdminLogin from '../AdminLogin';
import { can } from '@/lib/auth/permissions';
import { getSessionUser } from '@/lib/auth/session';
import { getPool } from '@/lib/db/pool';
import { listStores } from '@/lib/db/repositories/stores';
import { listAdminCampaigns } from '@/device_backend';
import { Eyebrow } from '@/components/ui/Section';

export const metadata: Metadata = {
  title: 'Campaigns & Tasks — Admin Console',
  description: 'Manage active advertising campaigns, video creatives, and store screen task allocations across the String Theory DOOH network.',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminCampaignsPage() {
  let session: { kind: 'admin'; fullName: string; email: string } | { kind: 'member' | 'anonymous' };

  try {
    const actor = await getSessionUser();
    session =
      actor && can(actor.role, 'user:manage')
        ? { kind: 'admin', fullName: actor.fullName, email: actor.email }
        : { kind: actor ? 'member' : 'anonymous' };
  } catch (error) {
    console.error('[admin/campaigns] session lookup failed', error);
    return (
      <Shell>
        <div className="max-w-measure">
          <Eyebrow>Admin</Eyebrow>
          <h1 className="type-display mt-6 text-[length:var(--type-h2)] text-ink">
            The console cannot reach the database.
          </h1>
          <p className="type-lead mt-6">
            Database connection failed. Please ensure PostgreSQL is reachable.
          </p>
        </div>
      </Shell>
    );
  }

  if (session.kind !== 'admin') {
    return (
      <Shell>
        <div className="max-w-measure">
          <Eyebrow>Admin</Eyebrow>
          <h1 className="type-display mt-6 text-[length:var(--type-h2)] text-ink">Campaign Management</h1>
          <p className="type-lead mt-6">
            Sign in with an administrative account to view campaigns, assign creatives to stores, and synchronize player hardware tasks.
          </p>

          {session.kind === 'member' && (
            <p
              role="status"
              className="mt-8 rounded-md border border-state-run bg-paper px-5 py-4 text-[length:var(--type-small)] text-state-run"
            >
              You are signed in, but your account does not have administrative permissions.
            </p>
          )}

          <AdminLogin />
        </div>
      </Shell>
    );
  }

  // Load campaigns and active stores in parallel
  const pool = getPool();
  const [campaigns, stores] = await Promise.all([
    listAdminCampaigns(pool),
    listStores(pool),
  ]);

  return (
    <Shell>
      <AdminCampaignsConsole
        admin={{ fullName: session.fullName, email: session.email }}
        initialCampaigns={campaigns}
        initialStores={stores}
      />
    </Shell>
  );
}

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

          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="inline-flex min-h-tap items-center rounded-pill px-3 py-1.5 text-[length:var(--type-small)] font-medium text-ink-muted hover:text-ink transition-colors"
            >
              Admin Console
            </Link>
            <Link
              href="/admin/store"
              className="inline-flex min-h-tap items-center rounded-pill px-3 py-1.5 text-[length:var(--type-small)] font-medium text-ink-muted hover:text-ink transition-colors"
            >
              Stores & Devices
            </Link>
            <Link
              href="/"
              className="inline-flex min-h-tap items-center rounded-pill border border-line bg-paper px-3.5 py-1.5 text-[length:var(--type-small)] font-medium text-ink transition-colors hover:border-ink"
            >
              Back to site
            </Link>
          </div>
        </div>
      </header>

      <main id="main" className="flex-1">
        <div className="mx-auto w-full max-w-shell px-5 pb-24 pt-10 sm:px-8 sm:pb-32 sm:pt-14">
          {children}
        </div>
      </main>
    </div>
  );
}
