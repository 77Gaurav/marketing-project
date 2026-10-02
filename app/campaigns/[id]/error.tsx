'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import CampaignShell from '@/components/campaigns/CampaignShell';
import { Eyebrow } from '@/components/ui/Section';

/**
 * Error boundary for the campaign detail route.
 *
 * Reached when the page throws — in practice a database that is unreachable or an EBS volume that
 * has not been reattached. `reset` re-runs the server render without a full page reload, which is
 * the right first thing to offer: the volume coming back is the common case.
 */
export default function CampaignError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The server already logged the cause; the browser only needs to report that it happened.
    console.error('[campaigns/:id] page error', error);
  }, [error]);

  return (
    <CampaignShell>
      <div className="mx-auto w-full max-w-shell px-5 py-28 sm:px-8 sm:py-36">
        <div className="max-w-measure">
          <Eyebrow>Temporarily unavailable</Eyebrow>
          <h1 className="type-display mt-6 text-[length:var(--type-h2)] text-ink">
            We could not load this campaign.
          </h1>
          <p className="type-lead mt-6">
            This is on our side rather than yours. Try again in a moment — if it keeps happening, get
            in touch and we will look into it.
          </p>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={reset} className="btn-primary">
              <RefreshCw className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              Try again
            </button>
            <Link href="/campaigns/new" className="btn-secondary">
              Start a campaign
            </Link>
          </div>

          {error.digest && (
            <p className="mt-8 text-[length:var(--type-small)] text-ink-muted">
              Reference: <span className="font-medium text-ink">{error.digest}</span>
            </p>
          )}
        </div>
      </div>
    </CampaignShell>
  );
}