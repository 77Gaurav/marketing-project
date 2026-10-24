import type { Metadata } from 'next';
import Link from 'next/link';
import { Database, Radio } from 'lucide-react';
import DbmsConsole from './DbmsConsole';
import { isDbmsAuthenticated } from '@/lib/auth/dbms';
import { getPool } from '@/lib/db/pool';
import { getDatabaseRelationalSchema, type DatabaseRelationalSchema } from '@/lib/db/repositories/database-explorer';
import { Eyebrow } from '@/components/ui/Section';

export const metadata: Metadata = {
  title: 'Database Management System (DBMS) — Admin',
  description: 'Inspect relational schema and records across the database.',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function DbmsPage() {
  const authStatus = await isDbmsAuthenticated();
  let initialSchema: DatabaseRelationalSchema | null = null;

  if (authStatus.authenticated) {
    try {
      initialSchema = await getDatabaseRelationalSchema(getPool());
    } catch (e) {
      console.error('[dbms/page] Failed to prefetch schema:', e);
    }
  }

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
              className="inline-flex min-h-tap items-center rounded-pill px-4 text-[length:var(--type-small)] font-medium text-ink-muted transition-colors duration-fast ease-out hover:text-ink"
            >
              Back to Admin Console
            </Link>
          </div>
        </div>
      </header>

      <main id="main" className="flex-1">
        <div className="mx-auto w-full max-w-shell px-5 pb-24 pt-10 sm:px-8 sm:pb-32 sm:pt-14">
          <DbmsConsole
            initialAuthenticated={authStatus.authenticated}
            initialUser={authStatus.user}
            initialSchema={initialSchema}
          />
        </div>
      </main>
    </div>
  );
}
