'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { MapPin, Users } from 'lucide-react';
import CtaLink from '@/components/ui/CtaLink';
import { MOTION_OK } from '@/lib/motion';

/**
 * Venue categories, each with the three real Bengaluru locations that best represent it.
 *
 * `image` is the stage background on the right — the copy sits over it with its own scrim, so the
 * category is shown in the room it actually runs in rather than as a detached thumbnail. The list
 * on the left is text-only: the audience already has the picture from the stage, and the reader
 * is here to read where a campaign would actually run.
 *
 * `crowd` is an expected daily footfall band, stated as a range. No impression or revenue figures.
 */
const CATEGORIES = [
  {
    id: 'cafe',
    label: 'Cafés',
    singular: 'café',
    image: '/assets/cafe-tile.png',
    alt: 'A campaign playing on a display above the counter in a neighbourhood café',
    places: [
      { name: 'Third Wave Coffee', area: 'Indiranagar', crowd: '250–400 people a day' },
      { name: 'Blue Tokai Coffee', area: 'Indiranagar', crowd: '300–450 people a day' },
      { name: 'Arbor Bistro', area: 'Koramangala', crowd: '200–350 people a day' },
    ],
  },
  {
    id: 'gym',
    label: 'Gyms',
    singular: 'gym',
    image: '/assets/gym-tile.png',
    alt: 'A campaign playing on a display across the training floor of a gym',
    places: [
      { name: 'Cult Fitness', area: 'Bellandur', crowd: '400–600 people a day' },
      { name: 'Gold’s Gym', area: 'Jayanagar', crowd: '250–400 people a day' },
      { name: 'Fitternity', area: 'Whitefield', crowd: '350–500 people a day' },
    ],
  },
  {
    id: 'retail',
    label: 'Apparel',
    singular: 'apparel',
    image: '/assets/clothes-tile.png',
    alt: 'A campaign playing on a display inside an apparel store',
    places: [
      { name: 'Croma', area: 'MG Road', crowd: '1,200–1,800 people a day' },
      { name: 'Decathlon', area: 'Yeshwanthpur', crowd: '900–1,400 people a day' },
      { name: 'Westside', area: 'Commercial Street', crowd: '800–1,200 people a day' },
    ],
  },
  {
    id: 'sneaker',
    label: 'Footwear',
    singular: 'footwear',
    image: '/assets/sneaker-tile.png',
    alt: 'A campaign playing on a display in a footwear store',
    places: [
      { name: 'Metro Shoes', area: 'Church Street', crowd: '500–700 people a day' },
      { name: 'Nike Store', area: 'UB City', crowd: '700–1,000 people a day' },
      { name: 'Bata Store', area: 'Jayanagar', crowd: '400–600 people a day' },
    ],
  },
] as const;

export default function LocationsSection() {
  const [active, setActive] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const stageRef = useRef<HTMLDivElement>(null);

  // Arrow-key navigation, as expected of a horizontal tablist (WAI-ARIA APG).
  const onTabKeyDown = (event: React.KeyboardEvent, index: number) => {
    const last = CATEGORIES.length - 1;
    let next: number | null = null;

    if (event.key === 'ArrowRight') next = index === last ? 0 : index + 1;
    else if (event.key === 'ArrowLeft') next = index === 0 ? last : index - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;

    if (next === null) return;
    event.preventDefault();
    setActive(next);
    tabRefs.current[next]?.focus();
  };

  const category = CATEGORIES[active];

  /**
   * Parallax on the stage plate only. Reads the pinned inventory row's progress if that row is
   * driving the scroll, and otherwise falls back to this section's own position — so the plate
   * drifts once, not once per listener.
   */
  useGSAP(
    () => {
      const plate = stageRef.current?.querySelector<HTMLElement>('[data-plate]');
      if (!plate) return;

      const mm = gsap.matchMedia();

      mm.add(MOTION_OK, () => {
        const venues = document.getElementById('venues');

        gsap.fromTo(
          plate,
          { yPercent: -5 },
          {
            yPercent: 5,
            ease: 'none',
            scrollTrigger: {
              // If the inventory row is pinned, reuse its progress so the two sections stay in sync.
              trigger: venues ?? stageRef.current,
              start: venues ? 'top top' : 'top bottom',
              end: venues ? () => `+=${venues.offsetHeight}` : 'bottom top',
              scrub: true,
              invalidateOnRefresh: true,
            },
          },
        );
      });

      return () => mm.revert();
    },
    { scope: stageRef },
  );

  return (
    <section
      id="locations"
      aria-labelledby="locations-title"
      className="scroll-mt-28 border-y border-line bg-paper-raised px-5 py-16 sm:px-8 lg:px-10 lg:py-32"
    >
      <div className="mx-auto w-full max-w-shell">
        <div className="grid gap-14 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-6">
            <h2
              id="locations-title"
              className="type-display max-w-2xl text-[length:var(--type-h2)] text-ink"
            >
              Real people. Real places.
            </h2>
            <p className="type-lead mt-6">
              Describe who you are trying to reach. We surface the venues whose footfall already
              looks like your audience — then you choose which ones to run in.
            </p>

            {/* Category selector. Tabs pattern: one selected tab controls the list below. */}
            <div className="mt-10">
              <div role="tablist" aria-label="Venue categories" className="flex flex-wrap gap-2">
                {CATEGORIES.map((item, index) => {
                  const isActive = index === active;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      ref={(node) => {
                        tabRefs.current[index] = node;
                      }}
                      id={`category-tab-${item.id}`}
                      aria-selected={isActive}
                      aria-controls={`category-panel-${item.id}`}
                      tabIndex={isActive ? 0 : -1}
                      onClick={() => setActive(index)}
                      onKeyDown={(event) => onTabKeyDown(event, index)}
                      className={`inline-flex min-h-[44px] items-center rounded-pill border px-4 text-sm font-medium transition-[background-color,border-color,color] duration-fast ease-out ${
                        isActive
                          ? 'border-ink bg-ink text-paper-raised'
                          : 'border-line-strong text-ink-muted hover:border-ink hover:text-ink'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>

              {/* All panels stay in the DOM so each tab's aria-controls resolves; inactive ones are
                  hidden rather than unmounted. The list itself is the point of the panel — the
                  right-hand stage carries the imagery. */}
              {CATEGORIES.map((item, index) => {
                const isActive = index === active;

                return (
                  <div
                    key={item.id}
                    role="tabpanel"
                    id={`category-panel-${item.id}`}
                    aria-labelledby={`category-tab-${item.id}`}
                    hidden={!isActive}
                    tabIndex={0}
                    className="mt-8 focus-visible:ring-0"
                  >
                    <ol className="flex flex-col">
                      {item.places.map((place, placeIndex) => (
                        <li
                          key={place.name}
                          className="group flex flex-col gap-2 border-t border-line py-5 transition-colors duration-base ease-out last:border-b hover:border-line-strong sm:flex-row sm:items-baseline sm:gap-8"
                        >
                          <span
                            className="type-eyebrow w-8 shrink-0 text-ink-muted/70"
                            aria-hidden="true"
                          >
                            {String(placeIndex + 1).padStart(2, '0')}
                          </span>

                          <div className="min-w-0 flex-1">
                            <p className="text-[length:var(--type-body)] font-semibold text-ink">
                              {place.name}
                            </p>
                            <p className="type-small mt-1 flex items-center gap-1.5 text-ink-muted">
                              <MapPin
                                className="h-[1.125rem] w-[1.125rem] shrink-0 text-ink-muted/70"
                                strokeWidth={1.6}
                                aria-hidden="true"
                              />
                              {place.area}, Bengaluru
                            </p>
                          </div>

                          <p className="type-small flex shrink-0 items-center gap-2 text-ink-muted sm:w-56 sm:justify-end">
                            <Users
                              className="h-[1.125rem] w-[1.125rem] shrink-0 text-ink-muted/70"
                              strokeWidth={1.6}
                              aria-hidden="true"
                            />
                            <span className="tabular-nums">{place.crowd}</span>
                          </p>
                        </li>
                      ))}
                    </ol>

                    <p className="type-small mt-6 text-ink-muted/80">
                      Where you are in the funnel, this is the shortlist — the three locations we
                      would put a {item.singular} campaign in first.
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="mt-10">
              <CtaLink href="/campaigns/new" withArrow variant="secondary">
                Explore locations
              </CtaLink>
            </div>
          </div>

          {/* Single stage plate. Parallax is driven off the pinned inventory row's progress rather
              than its own ScrollTrigger, so only one scroll listener owns horizontal travel. */}
          <div ref={stageRef} className="lg:col-span-6">
            <figure className="relative mx-auto max-w-xl overflow-hidden rounded-lg bg-paper-sunk shadow-lift ring-1 ring-line lg:sticky lg:top-28 lg:max-w-none">
              <div className="relative aspect-[4/5] sm:aspect-[16/11] lg:aspect-[4/5]">
                <div data-plate className="absolute inset-x-0 -top-[8%] h-[116%]">
                  <Image
                    key={category.id}
                    src={category.image}
                    alt={category.alt}
                    fill
                    sizes="(max-width: 1024px) 92vw, 46vw"
                    className="object-cover"
                    quality={90}
                  />
                </div>
                <div
                  className="absolute inset-0 bg-gradient-to-t from-accent/60 via-accent/15 to-transparent"
                  aria-hidden="true"
                />
                <div
                  className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/10 to-transparent"
                  aria-hidden="true"
                />
              </div>

              <figcaption className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5 sm:p-6">
                <div className="min-w-0 text-paper-raised">
                  <p className="type-eyebrow text-paper-raised/75">{category.label}</p>
                  <p className="mt-2.5 text-[length:var(--type-h3)] font-semibold text-paper-raised">
                    {category.places.length} shortlisted locations
                  </p>
                </div>
                <span className="shrink-0 rounded-pill bg-white/15 px-4 py-2 text-[length:var(--type-small)] font-medium text-paper-raised ring-1 ring-inset ring-white/25 backdrop-blur-md">
                  Bengaluru
                </span>
              </figcaption>
            </figure>
          </div>
        </div>
      </div>
    </section>
  );
}
