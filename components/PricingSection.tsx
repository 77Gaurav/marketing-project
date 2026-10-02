'use client';

import { Check } from 'lucide-react';
import CtaLink from '@/components/ui/CtaLink';
import Reveal from '@/components/ui/Reveal';

const PLANS = [
  {
    name: 'Single venue',
    price: 'From $180',
    cadence: 'per location / month',
    summary: 'For one brand testing a single type of venue.',
    features: [
      'Up to 5 locations',
      'Creative prepared for every screen',
      'Daypart scheduling',
      'Reporting by location',
    ],
    cta: 'Start with one venue',
    highlighted: false,
  },
  {
    name: 'Network',
    price: 'From $640',
    cadence: 'per month',
    summary: 'For brands running across several venue types at once.',
    features: [
      'Up to 60 locations',
      'Audience-matched venue discovery',
      'Role-based brand and admin access',
      'Per-location reach and frequency',
      'Full deployment history',
    ],
    cta: 'Start a campaign',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    cadence: 'annual agreement',
    summary: 'For networks with their own screens and governance needs.',
    features: [
      'Unlimited locations',
      'Bring your own display hardware',
      'Custom audience segments',
      'Reserved publishing capacity',
      'SLA and priority support',
    ],
    cta: 'Talk to sales',
    highlighted: false,
  },
];

export default function PricingSection() {
  return (
    <section
      id="pricing"
      aria-labelledby="pricing-title"
      className="scroll-mt-28 px-5 py-16 sm:px-8 lg:px-10 lg:py-32"
    >
      <div className="mx-auto w-full max-w-shell">
        <div className="max-w-3xl">
          <h2
            id="pricing-title"
            className="type-display text-[length:var(--type-h2)] text-ink"
          >
            Priced by the rooms you rent.
          </h2>
          <p className="type-lead mt-6">
            You pay for verified locations and screen time. Preparing, delivering and reporting on
            your creative are included at every tier.
          </p>
        </div>

        <Reveal
          stagger="[data-plan]"
          className="mt-14 grid items-start gap-6 lg:grid-cols-3"
        >
          {PLANS.map((plan) => (
            <article
              key={plan.name}
              data-plan
              className={`card flex h-full flex-col p-7 lg:p-8 ${
                plan.highlighted ? 'border-ink shadow-lg' : 'card-hover'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[length:var(--type-h3)] font-semibold text-ink">{plan.name}</h3>
                {plan.highlighted && (
                  <span className="type-eyebrow rounded-pill bg-ink px-3 py-1.5 text-paper-raised">
                    Most chosen
                  </span>
                )}
              </div>

              <p className="mt-5 flex items-baseline gap-2">
                <span className="font-sans text-3xl font-medium tabular-nums tracking-tight text-ink">
                  {plan.price}
                </span>
                <span className="text-sm text-ink-muted">{plan.cadence}</span>
              </p>

              <p className="type-small mt-3 leading-relaxed text-ink-muted">{plan.summary}</p>

              <ul className="mt-7 flex flex-col gap-3.5 border-t border-line pt-7">
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2.5 text-[length:var(--type-small)] text-ink-soft"
                  >
                    <Check
                      className="mt-0.5 h-4 w-4 shrink-0 text-state-ok"
                      strokeWidth={2}
                      aria-hidden="true"
                    />
                    {feature}
                  </li>
                ))}
              </ul>

              <div className="mt-8 pt-2">
                <CtaLink
                  href="/campaigns/new"
                  variant={plan.highlighted ? 'primary' : 'secondary'}
                  className="w-full"
                >
                  {plan.cta}
                </CtaLink>
              </div>
            </article>
          ))}
        </Reveal>

        <p className="type-small mt-10 text-ink-muted">
          Indicative pricing for planning. Final quotes depend on venue mix, screen count and
          duration.
        </p>
      </div>
    </section>
  );
}