import Link from 'next/link';
import { ArrowLeft, Radio } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Page frame for everything outside the marketing site.
 *
 * The landing page's navbar cannot be reused here: it is a scroll-driven device whose links resolve
 * to section anchors that only exist on `/`. This is a deliberately quieter equivalent — same wordmark,
 * same type scale, same header height so `scroll-padding-top` and the skip link still work — so
 * leaving the marketing site for the campaign flow feels like moving within one product rather than
 * onto a different website.
 */
export default function CampaignShell({ children }: { children: ReactNode }) {
  const year = new Date().getFullYear();

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header
        className="sticky top-0 z-50 border-b border-line bg-paper/90 backdrop-blur-xl"
        style={{ height: 'var(--header-height)' }}
      >
        <div className="mx-auto flex h-full w-full max-w-shell items-center justify-between gap-4 px-5 sm:px-8">
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
            className="inline-flex min-h-tap items-center gap-2 rounded-pill px-4 text-[length:var(--type-small)] font-medium text-ink-muted transition-colors duration-fast ease-out hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            Back to site
          </Link>
        </div>
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>

      {/* Not the marketing footer: every one of its links is a section anchor on a page we are not
          on, so a slimmer footer is more honest than six dead links. */}
      <footer className="border-t border-line px-5 py-10 sm:px-8">
        <div className="mx-auto flex w-full max-w-shell flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[length:var(--type-small)] text-ink-muted">
            © {year} String Theory Inc. All rights reserved.
          </p>
          <p className="type-eyebrow text-ink-muted">Brand → Audience → Venues → Advertise</p>
        </div>
      </footer>
    </div>
  );
}