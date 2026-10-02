'use client';

import { useRef } from 'react';
import Image from 'next/image';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Play } from 'lucide-react';
import Cta from '@/components/ui/Cta';
import CtaLink from '@/components/ui/CtaLink';
import { useModals } from '@/components/ui/ModalProvider';
import { DURATION, EASE, MOTION_OK } from '@/lib/motion';

export default function HeroSection() {
  const { openDemo } = useModals();
  const rootRef = useRef<HTMLElement>(null);
  const plateRef = useRef<HTMLDivElement>(null);

  // One entrance timeline for the whole hero, plus a slow counter-drift on the photo panel.
  // Runs once on mount and is skipped entirely under reduced motion, so the copy is never waiting
  // on an animation to become readable.
  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(MOTION_OK, () => {
        const tl = gsap.timeline({ defaults: { ease: EASE.out } });

        tl.from('[data-enter]', {
          opacity: 0,
          y: 30,
          duration: DURATION.cinematic,
          stagger: 0.09,
          clearProps: 'opacity,transform',
        }).from('[data-hero-plate]', { scale: 1.1, duration: DURATION.cinematic * 1.2, clearProps: 'transform' }, 0);

        // Ultra-slow parallax: the photo trails the page so the hero has depth without movement
        // that competes with reading. Scrubbed, so it tracks the scroll position exactly.
        gsap.to(plateRef.current, {
          yPercent: 12,
          ease: 'none',
          scrollTrigger: {
            trigger: rootRef.current,
            start: 'top top',
            end: 'bottom top',
            scrub: true,
          },
        });
      });

      return () => mm.revert();
    },
    { scope: rootRef },
  );

  return (
    <section
      ref={rootRef}
      id="product"
      aria-labelledby="hero-title"
      className="relative isolate scroll-mt-28 overflow-hidden bg-paper"
    >
      {/* Copy column. Everything the visitor reads lives here, on flat paper — the photo is
          pinned to the opposite side of the split and never sits behind the text.
          lg:max-w-[45%] ends the column exactly where the paper is still fully opaque, so the
          longest headline line can never reach the image. */}
      <div className="relative mx-auto flex w-full max-w-shell flex-col justify-center px-5 pb-14 pt-32 sm:px-8 sm:pb-16 sm:pt-36 lg:min-h-screen lg:min-h-[100svh] lg:max-w-none lg:px-[5.5vw] lg:pb-0 lg:pt-[var(--header-height)]">
        <div className="lg:max-w-[45%]">
          <p data-enter className="type-eyebrow text-accent">
            Digital out of home, matched by audience
          </p>

          <h1
            data-enter
            id="hero-title"
            className="type-display mt-6 text-[length:var(--type-hero)] leading-[1.04] text-ink lg:text-[length:var(--type-hero-split)] lg:leading-[1.12]"
          >
            Your audience has
            <br />
            screens waiting
            <br />
            <span className="text-accent">for you.</span>
          </h1>

          <p data-enter className="type-lead mt-8">
            String Theory finds the cafés, gyms and stores your audience already visits, then puts
            your video on every screen in them — scheduled, published and measured end to end.
          </p>

          <div data-enter className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
            <CtaLink href="/campaigns/new" withArrow>
              Start a campaign
            </CtaLink>
            <Cta onClick={openDemo} variant="secondary">
              <span className="flex items-center gap-2.5">
                <span className="flex h-6 w-6 items-center justify-center rounded-pill bg-ink/8">
                  <Play className="h-2.5 w-2.5 translate-x-px fill-ink" aria-hidden="true" />
                </span>
                Watch how it works
              </span>
            </Cta>
          </div>
        </div>
      </div>

      {/* Photo panel. In normal flow it stacks *under* the copy on small screens; from lg up it
          leaves the flow and becomes a full-height panel pinned to the right 55% of the
          viewport. It stops at the header rather than running under it, so every nav control
          — including the ones that sit past the split — stays on flat paper and keeps full
          contrast against the photograph. Overscanned vertically so the parallax drift never
          exposes an edge. */}
      <div
        aria-hidden="true"
        className="relative w-full lg:absolute lg:bottom-0 lg:right-0 lg:top-[var(--header-height)] lg:w-[55%] lg:overflow-hidden"
      >
        <div
          ref={plateRef}
          data-hero-plate
          className="h-[62vw] max-h-[26rem] w-full will-change-transform lg:absolute lg:inset-x-0 lg:top-[-12%] lg:h-[124%] lg:max-h-none"
        >
          <Image
            src="/assets/landing-screen-bg.png"
            alt=""
            fill
            sizes="(min-width: 1024px) 55vw, 100vw"
            className="object-cover object-center"
            priority
            quality={90}
          />
        </div>

        {/* Paper feathers. Desktop only — on mobile there is no edge to blend into. */}
        <div className="hero-feather absolute inset-y-0 left-0 hidden w-[24%] lg:block" />
        <div className="hero-feather-top absolute inset-x-0 top-0 hidden h-16 lg:block" />
      </div>
    </section>
  );
}