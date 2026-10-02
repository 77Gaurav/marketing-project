import type { Metadata } from 'next';
import { BarChart3, MapPin, ShieldCheck, Sparkles } from 'lucide-react';
import CampaignShell from '@/components/campaigns/CampaignShell';
import CampaignForm from '@/components/campaigns/CampaignForm';
import { Eyebrow } from '@/components/ui/Section';

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

export default function NewCampaignPage() {
  return (
    <CampaignShell>
      <div className="mx-auto w-full max-w-shell px-5 pb-24 pt-14 sm:px-8 sm:pb-32 sm:pt-20">
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

        <div className="mt-12 grid gap-10 lg:mt-16 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-12">
          <CampaignForm />

          {/* Below the form on small screens, beside it from lg up — the form is the reason to be
              here and the aside is context, so it never takes the reading order. */}
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
                    <p className="text-[length:var(--type-small)] font-semibold text-ink">
                      {step.title}
                    </p>
                    <p className="mt-1 text-[length:var(--type-small)] leading-relaxed text-ink-muted">
                      {step.body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      </div>
    </CampaignShell>
  );
}