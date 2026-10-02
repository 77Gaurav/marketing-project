'use client';

import { useRef } from 'react';
import Image from 'next/image';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import Reveal from '@/components/ui/Reveal';
import { useModals } from '@/components/ui/ModalProvider';
import { MOTION_OK } from '@/lib/motion';

gsap.registerPlugin(ScrollTrigger);

/**
 * One tile per venue type. `image` is the full-bleed plate — the tile is the image, and the copy
 * sits on it. Copy stays audience-facing: no codec, storage or impression figures.
 */
const TILES = [
  {
    id: 'cafe',
    label: 'Cafés',
    image: '/assets/cafe-tile.png',
    alt: 'A campaign playing on a display above the counter in a neighbourhood café',
    audience: 'Commuters and remote workers',
    screens: 1420,
    summary: 'Morning and lunch rushes, when the audience is waiting rather than browsing.',
  },
  {
    id: 'gym',
    label: 'Gyms',
    image: '/assets/gym-tile.png',
    alt: 'A campaign playing on a display across the training floor of a gym',
    audience: 'Active professionals, 25 to 40',
    screens: 850,
    summary: 'Evening peaks and weekend mornings, alongside training rather than against it.',
  },
  {
    id: 'retail',
    label: 'Apparel',
    image: '/assets/clothes-tile.png',
    alt: 'A campaign playing on a display inside an apparel store',
    audience: 'Shoppers and browsers',
    screens: 2100,
    summary: 'Full trading hours, timed to weekend footfall when baskets are largest.',
  },
  {
    id: 'sneaker',
    label: 'Footwear',
    image: '/assets/sneaker-tile.png',
    alt: 'A campaign playing on a display in a footwear store',
    audience: 'Footwear buyers and Gen Z',
    screens: 960,
    summary: 'Drop windows and launch weekends, where the audience is already deciding.',
  },
] as const;

export default function VenueCategories() {
  const { openCampaign } = useModals();
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  /**
   * Horizontal scroll driven by vertical scroll.
   *
   * The section is pinned and the track is translated on X. `scrub` above 1 adds inertia, so one
   * wheel notch is spread over roughly a second and a half of settling — the row drifts rather
   * than snapping tile to tile, which is the difference between a slideshow and a camera move.
   * Every tile also parallaxes its own plate at a different rate, so the row has depth.
   *
   * The whole thing is gated on MOTION_OK and on a fine pointer: where either fails, the section
   * falls back to native vertical stacking, so the content is never trapped behind a scroll hijack.
   */
  useGSAP(
    () => {
      const section = sectionRef.current;
      const track = trackRef.current;
      if (!section || !track) return;

      const mm = gsap.matchMedia();

      mm.add(`${MOTION_OK} and (min-width: 1024px) and (hover: hover)`, () => {
        // Inertia window, in seconds. Long enough that the row always feels behind the wheel and
        // never fights it, short enough that the reader is not waiting on the animation to finish.
        const SMOOTH = 1.4;
        const RUNWAY = () => window.innerHeight * 0.75;
        const distance = () => Math.max(0, track.scrollWidth - window.innerWidth);
        const end = () => `+=${distance() + RUNWAY()}`;

        const tween = gsap.to(track, {
          x: () => -distance(),
          ease: 'none',
          scrollTrigger: {
            trigger: section,
            start: 'top top',
            // Travel the full width, plus a viewport of runway so the last tile is fully
            // readable before the pin releases and the next section arrives.
            end,
            scrub: SMOOTH,
            pin: true,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            onUpdate: (self) => {
              section.dataset.progress = self.progress.toFixed(3);
            },
          },
        });

        // Per-tile parallax, on the same trigger and the same inertia as the row so tile depth
        // can never drift out of sync with the travel it is supposed to be sitting inside.
        const plates = track.querySelectorAll<HTMLElement>('[data-tile-plate]');
        plates.forEach((plate) => {
          gsap.fromTo(
            plate,
            { xPercent: -7 },
            {
              xPercent: 7,
              ease: 'none',
              scrollTrigger: {
                trigger: section,
                start: 'top top',
                end,
                scrub: SMOOTH,
                invalidateOnRefresh: true,
              },
            },
          );
        });

        return () => {
          tween.scrollTrigger?.kill();
          tween.kill();
        };
      });

      return () => mm.revert();
    },
    { scope: sectionRef },
  );

  return (
    <>
      <section
        ref={sectionRef}
        id="venues"
        aria-labelledby="venues-title"
        className="scroll-mt-28 border-y border-line bg-paper-raised lg:flex lg:h-screen lg:h-[100svh] lg:flex-col lg:overflow-hidden"
      >
        {/* Header sits above the pinned viewport-height body on desktop; stacks normally elsewhere. */}
        <div className="shrink-0 px-5 pt-16 sm:px-8 lg:px-10 lg:pt-24">
          <div className="mx-auto w-full max-w-shell">
            <h2
              id="venues-title"
              className="type-display max-w-4xl text-[length:var(--type-h2)] text-ink"
            >
              Built for the places people actually go.
            </h2>
            <p className="type-lead mt-6">
              Every screen in the network sits inside a venue your audience already visits. Pick a
              context and see what is available.
            </p>
          </div>
        </div>

        {/* Row of full-height tiles, each nearly the full width of the viewport so the photography is
            the thing being looked at. Desktop: translated by scroll. Mobile / reduced motion /
            coarse pointer: native horizontal scroll, so swipe works and nothing is trapped.

            Desktop: the section is pinned at exactly one viewport tall, so the track takes the
            space the header leaves and `items-center` centres the row in it. The row used to sit
            in a section ~358px taller than the viewport, which pushed the bottom of every tile
            permanently below the fold while pinned. */}
        <div className="mt-10 lg:mt-0 lg:flex lg:min-h-0 lg:flex-1 lg:items-center lg:py-8">
          <div
            data-tile-track
            ref={trackRef}
            className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-6 [scrollbar-width:thin] sm:gap-5 sm:px-8 lg:h-full lg:w-full lg:max-w-none lg:items-center lg:gap-8 lg:overflow-x-visible lg:px-10 lg:pb-0"
          >
            {TILES.map((tile, index) => (
              <article
                key={tile.id}
                className="group relative h-[62vh] min-h-[26rem] w-[86vw] shrink-0 snap-center overflow-hidden rounded-lg bg-ink shadow-lift ring-1 ring-black/5 sm:h-[68vh] sm:w-[80vw] lg:h-full lg:min-h-0 lg:max-h-[42rem] lg:w-[88vw] lg:shrink-0"
              >
                <div className="absolute inset-0 overflow-hidden">
                  <div data-tile-plate className="absolute inset-x-0 -inset-y-[7%] will-change-transform">
                    <Image
                      src={tile.image}
                      alt={tile.alt}
                      fill
                      sizes="(max-width: 640px) 86vw, (max-width: 1024px) 80vw, 88vw"
                      className="object-cover transition-transform duration-cinematic ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                      loading={index === 0 ? 'eager' : 'lazy'}
                      quality={90}
                    />
                  </div>

                  {/* Bottom-weighted scrim: the copy sits in the lower third of every tile. */}
                  <div
                    className="absolute inset-0 bg-gradient-to-t from-ink via-ink/45 to-ink/5"
                    aria-hidden="true"
                  />
                </div>

                {/* At full-bleed width the copy reads best as a single baseline-aligned band across
                    the bottom: context on the left, the audience and reach on the right. */}
                <div className="relative flex h-full flex-col justify-end gap-8 p-6 sm:p-8 lg:flex-row lg:items-end lg:justify-between lg:gap-16 lg:p-12">
                  <div className="max-w-2xl">
                    <p className="type-eyebrow text-white/70">{tile.label}</p>
                    <p className="mt-4 type-display text-[length:var(--type-h3)] text-white lg:text-[length:var(--type-h2)]">
                      {tile.summary}
                    </p>
                  </div>

                  <dl className="flex shrink-0 items-end gap-8 border-t border-white/20 pt-5 lg:gap-12 lg:border-l lg:border-t-0 lg:pl-12 lg:pt-0">
                    <div>
                      <dt className="type-eyebrow text-white/55">Audience</dt>
                      <dd className="mt-2 max-w-[14rem] text-[length:var(--type-small)] text-white/85">
                        {tile.audience}
                      </dd>
                    </div>
                    <div>
                      <dt className="type-eyebrow text-white/55">Screens</dt>
                      <dd className="mt-2 text-[length:var(--type-h3)] font-semibold tabular-nums text-white">
                        {tile.screens.toLocaleString('en-US')}
                      </dd>
                    </div>
                  </dl>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Section footer. Kept outside the pinned section so it never eats the row's height — the
          pinned section is exactly one viewport tall, and a footer inside it would push the bottom
          of every tile back below the fold. */}
      <Reveal className="border-b border-line bg-paper-raised px-5 pb-16 pt-10 sm:px-8 lg:px-10 lg:pb-20">
        <div className="mx-auto flex w-full max-w-shell flex-col gap-6 border-t border-line pt-10 sm:flex-row sm:items-center sm:justify-between">
          <p className="type-lead !max-w-2xl">
            Every location is vetted for sightlines, dwell time and footfall before it joins the
            network.
          </p>
          <button
            type="button"
            onClick={openCampaign}
            className="btn-primary shrink-0 self-start sm:self-auto"
          >
            Start a campaign
          </button>
        </div>
      </Reveal>
    </>
  );
}
