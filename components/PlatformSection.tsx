'use client';

import { useRef } from 'react';
import Image from 'next/image';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { BarChart3, CalendarClock, Film, Layers, ShieldCheck, Sliders } from 'lucide-react';
import CtaLink from '@/components/ui/CtaLink';
import { MOTION_OK } from '@/lib/motion';

/**
 * The platform, told as one argument rather than a wall of features.
 *
 * The order is the argument: creative goes in, it gets prepared, it gets scheduled, it gets
 * governed, and then you can see what happened. Read top to bottom, the six beats are the
 * lifecycle of a campaign. Each beat gets a number because it is a step, not a benefit.
 */
const BEATS = [
  {
    icon: Film,
    title: 'You send the file once',
    body: 'Uploads resume if a connection drops, so a large master file never has to be sent twice. That is the whole of your side of the job.',
  },
  {
    icon: Sliders,
    title: 'We prepare it for every screen',
    body: 'One master is adapted to every display format in the network and checked before it goes live, so a campaign never runs in a broken state.',
  },
  {
    icon: CalendarClock,
    title: 'It is scheduled the way the venue actually runs',
    body: 'Dayparts and time windows are set per location — breakfast at cafés, evenings at gyms, weekends in retail — because the same screen is worth something different at 8am and 9pm.',
  },
  {
    icon: Layers,
    title: 'Everyone sees only their own',
    body: 'Role-based access keeps brand teams inside their own campaigns while admins see the whole network, so a large roster of clients does not become a spreadsheet.',
  },
  {
    icon: BarChart3,
    title: 'You find out what worked',
    body: 'Performance by venue, not just in aggregate, so budget moves toward the locations that are actually earning it instead of staying where it was set.',
  },
  {
    icon: ShieldCheck,
    title: 'And you can prove it ran',
    body: 'Every change and deployment is recorded, so what ran, where and when can be reconstructed without asking anyone to remember.',
  },
] as const;

export default function PlatformSection() {
  const rootRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLOListElement>(null);

  /**
   * Editorial, not decorative: each beat's rule and copy are revealed as it enters the reading
   * column, so the list assembles in the order it is meant to be read. Gated on MOTION_OK — with
   * reduced motion the full argument is simply present from the start.
   */
  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(MOTION_OK, () => {
        gsap.utils.toArray<HTMLElement>('[data-beat]').forEach((beat) => {
          gsap.from(beat, {
            opacity: 0,
            y: 26,
            duration: 0.7,
            ease: 'expo.out',
            clearProps: 'opacity,transform',
            scrollTrigger: {
              trigger: beat,
              start: 'top 88%',
              once: true,
            },
          });
        });
      });

      return () => mm.revert();
    },
    { scope: rootRef },
  );

  return (
    <section
      ref={rootRef}
      id="platform"
      aria-labelledby="platform-title"
      className="scroll-mt-28 border-y border-line bg-paper-sunk px-5 py-16 sm:px-8 lg:px-10 lg:py-32"
    >
      <div className="mx-auto w-full max-w-shell">
        <div className="grid gap-14 lg:grid-cols-12 lg:gap-16">
          {/* The claim, stated once and held on screen while the beats are read. */}
          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-28">
              <h2
                id="platform-title"
                className="type-display max-w-xl text-[length:var(--type-h2)] text-ink"
              >
                Everything between the upload and the audience.
              </h2>
              <p className="type-lead mt-6">
                Screen advertising is not hard because of the creative. It is hard because of
                everything that has to happen to that creative after you hand it over — and that
                is the part we take on.
              </p>

              <figure className="mt-10 hidden overflow-hidden rounded-lg bg-ink shadow-lift ring-1 ring-black/5 lg:block">
                <div className="relative aspect-[16/10]">
                  <Image
                    src="/assets/landing-screen-bg.png"
                    alt=""
                    fill
                    sizes="(max-width: 1024px) 0px, 40vw"
                    className="object-cover opacity-70"
                  />
                  <div
                    className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent"
                    aria-hidden="true"
                  />
                </div>
                <figcaption className="type-small -mt-12 p-6 text-paper-raised/80">
                  One upload, every screen in the network.
                </figcaption>
              </figure>

              <div className="mt-10">
                <CtaLink href="/campaigns/new" withArrow variant="secondary">
                  Start a campaign
                </CtaLink>
              </div>
            </div>
          </div>

          {/* The argument itself: six numbered steps down a single hairline rail. No cards —
              this is a sequence to be read, not a set of things to be compared. */}
          <ol ref={listRef} className="flex flex-col lg:col-span-7">
            {BEATS.map((beat, index) => (
              <li
                key={beat.title}
                data-beat
                className="group relative flex flex-col gap-5 border-t border-line py-8 sm:flex-row sm:gap-8 sm:py-10 last:border-b lg:py-11"
              >
                <div className="flex shrink-0 items-center gap-4 sm:w-24 sm:flex-col sm:items-start sm:gap-5">
                  <span
                    className="type-display text-[length:var(--type-h3)] leading-none text-ink/25 transition-colors duration-base ease-out group-hover:text-accent sm:text-[length:var(--type-h2)]"
                    aria-hidden="true"
                  >
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span
                    className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-paper-raised text-ink ring-1 ring-line transition-colors duration-base ease-out group-hover:bg-accent-wash group-hover:text-accent"
                    aria-hidden="true"
                  >
                    <beat.icon className="h-5 w-5" strokeWidth={1.5} />
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="text-[length:var(--type-h3)] font-semibold leading-snug text-ink">
                    {beat.title}
                  </h3>
                  <p className="type-small mt-3 max-w-xl leading-relaxed text-ink-muted">
                    {beat.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
