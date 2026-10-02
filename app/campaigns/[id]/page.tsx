import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, FileVideo, Mail, Phone, Globe } from 'lucide-react';
import CampaignShell from '@/components/campaigns/CampaignShell';
import { Eyebrow } from '@/components/ui/Section';
import { getPool } from '@/lib/db/pool';
import { findCampaignDetail } from '@/lib/db/repositories/campaigns';
import type { CampaignDetail } from '@/lib/db/types';

/**
 * Campaign detail — the destination after a campaign is created, and the page a shared link opens.
 *
 * Server Component reading directly from the database. There is no reason for this view to exist as
 * client-side JSON fetched over HTTP from the API route that returns the same three rows; that route
 * exists for programmatic callers.
 */

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  try {
    const detail = await findCampaignDetail(getPool(), params.id);
    if (!detail) return { title: 'Campaign not found' };
    return {
      title: detail.campaign.name,
      description: `${detail.campaign.name} for ${detail.brand.name} on String Theory.`,
    };
  } catch (error) {
    // Metadata must never throw: a database blip should not turn into a 500 for the whole route.
    console.error('[campaigns/:id] metadata lookup failed', error);
    return { title: 'Campaign' };
  }
}

/** Coloured state pill. Colour is paired with a text label so it is never the only signal. */
const STATUS_TONE: Record<string, string> = {
  DRAFT: 'bg-paper-sunk text-ink-muted',
  IN_REVIEW: 'bg-accent-wash text-accent',
  SCHEDULED: 'bg-accent-wash text-accent',
  LIVE: 'bg-accent-wash text-state-ok',
  PAUSED: 'bg-paper-sunk text-state-wait',
  COMPLETED: 'bg-paper-sunk text-ink-muted',
  CANCELLED: 'bg-paper-sunk text-state-error',
};

const VIDEO_TONE: Record<string, string> = {
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
  return value.replace(/_/g, ' ').toLowerCase();
}

function rows(pairs: { label: string; value: string }[]) {
  return pairs.map((row) => (
    <div
      key={row.label}
      className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line px-4 py-3 last:border-b-0"
    >
      <dt className="shrink-0 text-[length:var(--type-small)] text-ink-muted">{row.label}</dt>
      <dd className="text-[length:var(--type-small)] font-medium text-ink">{row.value}</dd>
    </div>
  ));
}

export default async function CampaignPage({ params }: { params: { id: string } }) {
  let detail: CampaignDetail | null;
  try {
    detail = await findCampaignDetail(getPool(), params.id);
  } catch (error) {
    // Rendered by app/campaigns/[id]/error.tsx, which offers a retry. Swallowing here keeps the
    // message out of the page and the stack out of the user's hands.
    console.error('[campaigns/:id] lookup failed', error);
    detail = null;
    throw error;
  }

  if (!detail) notFound();

  const { campaign, brand, video } = detail;
  const createdAt = new Date(campaign.createdAt);

  return (
    <CampaignShell>
      <div className="mx-auto w-full max-w-shell px-5 pb-24 pt-14 sm:px-8 sm:pb-32 sm:pt-20">
        <Link
          href="/campaigns/new"
          className="inline-flex min-h-tap items-center gap-2 text-[length:var(--type-small)] font-medium text-ink-muted transition-colors duration-fast ease-out hover:text-ink"
        >
          Start another campaign
          <ArrowRight className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
        </Link>

        <div className="mt-6 max-w-measure">
          <Eyebrow>{brand.name}</Eyebrow>
          <h1 className="type-display mt-6 text-[length:var(--type-h2)] text-ink">{campaign.name}</h1>
          <p className="type-lead mt-6">
            {campaign.description ??
              'No description was provided. Add one so our team can match the right venues.'}
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:mt-16 lg:grid-cols-2">
          <section className="card p-6 sm:p-8">
            <h2 className="type-display text-[length:var(--type-h3)] text-ink">Campaign</h2>
            <dl className="mt-6 overflow-hidden rounded-md border border-line">
              {rows([
                { label: 'Status', value: readable(campaign.status) },
                {
                  label: 'Created',
                  value: createdAt.toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  }),
                },
                { label: 'Reference', value: campaign.id },
              ])}
            </dl>
          </section>

          <section className="card p-6 sm:p-8">
            <h2 className="type-display text-[length:var(--type-h3)] text-ink">Brand</h2>
            <dl className="mt-6 overflow-hidden rounded-md border border-line">
              {rows([
                { label: 'Name', value: brand.name },
                { label: 'Contact', value: brand.contactName },
                { label: 'Account status', value: readable(brand.status) },
              ])}
            </dl>

            <ul className="mt-5 flex flex-col gap-2.5">
              <li>
                <a
                  href={`mailto:${brand.contactEmail}`}
                  className="inline-flex min-h-tap items-center gap-2.5 text-[length:var(--type-small)] text-ink-muted transition-colors duration-fast ease-out hover:text-ink"
                >
                  <Mail className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                  {brand.contactEmail}
                </a>
              </li>
              <li>
                <a
                  href={`tel:${brand.contactPhone.replace(/[^+\d]/g, '')}`}
                  className="inline-flex min-h-tap items-center gap-2.5 text-[length:var(--type-small)] text-ink-muted transition-colors duration-fast ease-out hover:text-ink"
                >
                  <Phone className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                  {brand.contactPhone}
                </a>
              </li>
              {brand.website && (
                <li>
                  <a
                    href={brand.website}
                    rel="noopener noreferrer nofollow"
                    target="_blank"
                    className="inline-flex min-h-tap items-center gap-2.5 text-[length:var(--type-small)] text-ink-muted transition-colors duration-fast ease-out hover:text-ink"
                  >
                    <Globe className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                    {brand.website.replace(/^https?:\/\//, '')}
                  </a>
                </li>
              )}
            </ul>
          </section>
        </div>

        {/* Creative. Nothing has been uploaded: the row records the file the browser offered and its
            state, and that is all it does until the upload pipeline exists. */}
        <section className="card mt-6 p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="type-display text-[length:var(--type-h3)] text-ink">Video</h2>
            <span
              className={`rounded-pill px-3 py-1 text-[length:var(--type-small)] font-semibold ${
                VIDEO_TONE[video?.status ?? 'AWAITING_UPLOAD']
              }`}
            >
              {readable(video?.status ?? 'AWAITING_UPLOAD')}
            </span>
          </div>

          {video ? (
            <>
              <div className="mt-6 flex items-center gap-4 rounded-md border border-dashed border-line-strong bg-paper px-5 py-6">
                <FileVideo className="h-6 w-6 shrink-0 text-ink-muted" strokeWidth={1.5} aria-hidden="true" />
                <div className="min-w-0">
                  <p className="truncate text-[length:var(--type-body)] font-medium text-ink">
                    {video.sourceFilename}
                  </p>
                  <p className="text-[length:var(--type-small)] text-ink-muted">
                    {video.sourceBytes !== null ? `${(video.sourceBytes / 1024 / 1024).toFixed(1)} MB` : 'Size unknown'}
                    {video.sourceMimeType ? ` · ${video.sourceMimeType}` : ''}
                  </p>
                </div>
              </div>

              <p className="mt-5 max-w-measure text-[length:var(--type-small)] leading-relaxed text-ink-muted">
                The file reference above is recorded against this campaign. Delivery, encoding and
                screen delivery are connected in a later step — nothing has been uploaded yet.
              </p>
            </>
          ) : (
            <p className="mt-5 max-w-measure text-[length:var(--type-small)] leading-relaxed text-ink-muted">
              No video attached yet.
            </p>
          )}
        </section>

        <section className="mt-6 rounded-lg border border-line bg-paper-raised px-6 py-6 sm:px-8">
          <p className="type-eyebrow text-accent">Status</p>
          <p className="mt-3 max-w-measure text-[length:var(--type-body)] leading-relaxed text-ink-muted">
            This campaign is{' '}
            <span
              className={`rounded-pill px-2.5 py-0.5 font-semibold ${STATUS_TONE[campaign.status]}`}
            >
              {readable(campaign.status)}
            </span>
            . Our team reviews every brief before venues are shortlisted, and you approve every
            location before anything plays.
          </p>
        </section>
      </div>
    </CampaignShell>
  );
}