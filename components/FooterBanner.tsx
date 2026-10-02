'use client';

import Image from 'next/image';
import Cta from '@/components/ui/Cta';
import Reveal from '@/components/ui/Reveal';
import { Eyebrow } from '@/components/ui/Section';
import { useModals } from '@/components/ui/ModalProvider';

export default function FooterBanner() {
  const { openCampaign } = useModals();

  return (
    <section id="contact" className="scroll-mt-28 px-5 py-16 sm:px-8 lg:px-10 lg:py-24">
      <div className="mx-auto w-full max-w-shell">
        <Reveal className="relative isolate overflow-hidden rounded-xl bg-ink px-7 py-14 shadow-float sm:px-12 sm:py-16 lg:px-16">
          {/* Photography bleeds behind the whole panel; the copy sits on the scrim, not beside it. */}
          <div className="absolute inset-0 -z-10" aria-hidden="true">
            <Image
              src="/assets/footer-tile.png"
              alt=""
              fill
              sizes="(max-width: 1280px) 100vw, 1280px"
              className="object-cover object-center opacity-45"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/88 to-ink/60" />
          </div>

          <div className="relative grid items-center gap-12 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <Eyebrow className="text-white/70">Ready when you are</Eyebrow>
              <h2 className="type-display mt-6 max-w-2xl text-[length:var(--type-h2)] text-paper-raised">
                Put your video where your audience already is.
              </h2>
              <p className="type-lead mt-6 max-w-xl !text-white/75">
                Pick an audience, see the screens, deploy in an afternoon. No hardware to install,
                no media buyer required.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Cta
                  onClick={openCampaign}
                  withArrow
                  className="!bg-paper-raised !text-ink hover:!bg-paper-raised/90 hover:!shadow-none"
                >
                  Start a campaign
                </Cta>
                <a
                  href="mailto:sales@stringtheory.example"
                  className="inline-flex min-h-[48px] items-center justify-center rounded-pill border border-white/30 px-7 text-base font-medium text-white transition-colors duration-fast ease-out hover:border-white/60 hover:bg-white/10"
                >
                  Talk to sales
                </a>
              </div>
            </div>

            {/* Reassurance points replace the former play-count badge — an aggregate impression
                figure tells a buyer nothing actionable. */}
            <div className="lg:col-span-5">
              <ul className="flex flex-col gap-4 rounded-lg border border-white/15 bg-white/[0.06] p-7 backdrop-blur-xl">
                {[
                  'No hardware to install',
                  'No minimum term on single venues',
                  'Live in an afternoon',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-[length:var(--type-body)] text-white/85">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full bg-accent-wash"
                      aria-hidden="true"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}