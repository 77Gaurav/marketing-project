import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Radio } from 'lucide-react';
import StoreDetailConsole from './StoreDetailConsole';
import AdminLogin from '../../AdminLogin';
import { can } from '@/lib/auth/permissions';
import { getSessionUser } from '@/lib/auth/session';
import { getPool } from '@/lib/db/pool';
import { findStoreByIdOrSlug, listDevicesForStore } from '@/device_backend';
import { Eyebrow } from '@/components/ui/Section';

interface StorePageProps {
  params: {
    storeId: string;
  };
}

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: StorePageProps): Promise<Metadata> {
  const pool = getPool();
  const store = await findStoreByIdOrSlug(pool, params.storeId).catch(() => null);
  return {
    title: store ? `${store.name} — Store Admin` : 'Store Details — Admin Console',
    description: `Manage screen devices and activations for ${store?.name || 'store'}.`,
    robots: { index: false, follow: false },
  };
}

export default async function AdminStoreDetailPage({ params }: StorePageProps) {
  let session: { kind: 'admin'; fullName: string; email: string } | { kind: 'member' | 'anonymous' };

  try {
    const actor = await getSessionUser();
    session =
      actor && can(actor.role, 'user:manage')
        ? { kind: 'admin', fullName: actor.fullName, email: actor.email }
        : { kind: actor ? 'member' : 'anonymous' };
  } catch (error) {
    console.error('[admin/store/:storeId] session lookup failed', error);
    return (
      <Shell>
        <div className="max-w-measure">
          <Eyebrow>Admin</Eyebrow>
          <h1 className="type-display mt-6 text-[length:var(--type-h2)] text-ink">
            Database connection failed.
          </h1>
          <p className="type-lead mt-6">
            The console cannot reach PostgreSQL. Please try again shortly.
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
          <h1 className="type-display mt-6 text-[length:var(--type-h2)] text-ink">Store Activation</h1>
          <p className="type-lead mt-6">
            Sign in with an administrative account to manage store activations and player devices.
          </p>
          <AdminLogin />
        </div>
      </Shell>
    );
  }

  const pool = getPool();
  const store = await findStoreByIdOrSlug(pool, params.storeId);

  if (!store) {
    return (
      <Shell>
        <div className="max-w-measure space-y-6">
          <Link
            href="/admin/store"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Stores
          </Link>
          <Eyebrow>Admin</Eyebrow>
          <h1 className="type-display mt-2 text-3xl font-extrabold text-ink">Store Not Found</h1>
          <p className="type-lead text-ink-muted">
            No store found matching identifier &ldquo;{params.storeId}&rdquo;. It may have been removed or the ID is incorrect.
          </p>
          <div>
            <Link
              href="/admin/store"
              className="inline-flex min-h-[46px] items-center gap-2 rounded-pill bg-ink px-6 py-2.5 text-sm font-bold text-paper-raised hover:bg-ink/85 transition-colors"
            >
              Browse All Stores
            </Link>
          </div>
        </div>
      </Shell>
    );
  }

  // Load devices for this store (automatically purges expired unactivated codes)
  const devices = await listDevicesForStore(pool, store.id);

  return (
    <Shell>
      <StoreDetailConsole
        admin={{ fullName: session.fullName, email: session.email }}
        store={store}
        initialDevices={devices}
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
              href="/admin/store"
              className="inline-flex min-h-tap items-center rounded-pill px-3 py-1.5 text-[length:var(--type-small)] font-medium text-ink-muted hover:text-ink transition-colors"
            >
              All Stores
            </Link>
            <Link
              href="/admin"
              className="inline-flex min-h-tap items-center rounded-pill px-3 py-1.5 text-[length:var(--type-small)] font-medium text-ink-muted hover:text-ink transition-colors"
            >
              Admin Console
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
