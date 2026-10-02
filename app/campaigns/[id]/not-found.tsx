import Link from 'next/link';
import CampaignShell from '@/components/campaigns/CampaignShell';
import { Eyebrow } from '@/components/ui/Section';

/** 404 for a campaign id that resolved to nothing. Distinct from error.tsx, which covers failure. */
export default function CampaignNotFound() {
  return (
    <CampaignShell>
      <div className="mx-auto w-full max-w-shell px-5 py-28 sm:px-8 sm:py-36">
        <div className="max-w-measure">
          <Eyebrow>Not found</Eyebrow>
          <h1 className="type-display mt-6 text-[length:var(--type-h2)] text-ink">
            We could not find that campaign.
          </h1>
          <p className="type-lead mt-6">
            The link may be mistyped, or the campaign may belong to a brand account that cannot see
            it. Check the reference with us and we will find it.
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link href="/campaigns/new" className="btn-primary">
              <span>Start a campaign</span>
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