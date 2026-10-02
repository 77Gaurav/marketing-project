'use client';

import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Check, Plus, ShieldCheck, Sparkles } from 'lucide-react';
import Cta from '@/components/ui/Cta';
import { useModals } from '@/components/ui/ModalProvider';
import { DURATION, EASE, MOTION_OK } from '@/lib/motion';

/**
 * Publishing milestones shown in the preview. This is a buyer-facing summary, not the internal
 * state machine — no codec names, storage providers, retries or deletion behaviour are exposed.
 */
const MILESTONES = [
  { label: 'Creative received', detail: 'Your master file is accepted and locked for this campaign.' },
  { label: 'Approved for every screen', detail: 'Checked against the formats each display in the network plays.' },
  { label: 'Scheduled', detail: 'Placed in the venue’s daypart, ready to run at the right hour.' },
  { label: 'Live', detail: 'Playing across the locations you selected, and reported back per screen.' },
] as const;

/** Colour, border and glow per milestone. Semantic state only, never decorative. */
const TONE = [
  { dot: 'bg-accent', chip: 'text-accent', ring: 'ring-accent/25', glow: 'shadow-[0_18px_50px_-20px_rgba(67,56,202,0.55)]' },
  { dot: 'bg-accent', chip: 'text-accent', ring: 'ring-accent/25', glow: 'shadow-[0_18px_50px_-20px_rgba(67,56,202,0.55)]' },
  { dot: 'bg-accent', chip: 'text-accent', ring: 'ring-accent/25', glow: 'shadow-[0_18px_50px_-20px_rgba(67,56,202,0.55)]' },
  { dot: 'bg-state-ok', chip: 'text-state-ok', ring: 'ring-state-ok/25', glow: 'shadow-[0_18px_50px_-20px_rgba(4,120,87,0.5)]' },
] as const;

export default function WorkflowSection() {
  const { openCampaign } = useModals();
  const rootRef = useRef<HTMLElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  /**
   * Pointer-driven 3D tilt on the preview card.
   *
   * The rotation is written to CSS custom properties rather than directly to `transform`, so GSAP
   * never owns the transform and the resting state stays in CSS. A sheen layer and a pointer-tracked
   * radial highlight are driven from the same values, which is what makes the surface read as a lit
   * solid rather than a rotated screenshot.
   *
   * Gated on MOTION_OK and a fine pointer: no hover means no tilt, so touch and reduced-motion
   * users get the flat card instead of a device that reacts without being asked.
   */
  useGSAP(
    () => {
      const card = cardRef.current;
      if (!card) return;

      const mm = gsap.matchMedia();

      mm.add(`${MOTION_OK} and (hover: hover) and (pointer: fine)`, () => {
        const MAX = 7; // degrees — past ~8° the text starts to smear and the card reads as a stunt
        const LIFT = 18; // translateZ on the inner layer, gives real parallax against the shell

        const setTilt = (rx: number, ry: number) => {
          card.style.setProperty('--tilt-x', `${rx}deg`);
          card.style.setProperty('--tilt-y', `${ry}deg`);
          card.style.setProperty('--pointer-x', `${(ry / MAX / 2 + 0.5) * 100}%`);
          card.style.setProperty('--pointer-y', `${(0.5 - rx / MAX / 2) * 100}%`);
          card.style.setProperty('--sheen', '1');
        };

        const onMove = (event: PointerEvent) => {
          const rect = card.getBoundingClientRect();
          const px = (event.clientX - rect.left) / rect.width;
          const py = (event.clientY - rect.top) / rect.height;

          setTilt((0.5 - py) * MAX * 2, (px - 0.5) * MAX * 2);

          gsap.to(card.querySelector('[data-tilt-inner]'), {
            z: LIFT,
            duration: DURATION.base,
            ease: EASE.soft,
            overwrite: 'auto',
          });
        };

        const onLeave = () => {
          card.style.setProperty('--sheen', '0');
          gsap.to(card, {
            '--tilt-x': '0deg',
            '--tilt-y': '0deg',
            duration: DURATION.slow,
            ease: EASE.out,
          });
          gsap.to(card.querySelector('[data-tilt-inner]'), {
            z: 0,
            duration: DURATION.slow,
            ease: EASE.out,
          });
        };

        card.addEventListener('pointermove', onMove);
        card.addEventListener('pointerleave', onLeave);

        return () => {
          card.removeEventListener('pointermove', onMove);
          card.removeEventListener('pointerleave', onLeave);
        };
      });

      // Entrance: rise and settle, so the card arrives before the reader gets to it.
      mm.add(MOTION_OK, () => {
        gsap.from('[data-preview]', {
          opacity: 0,
          y: 40,
          rotateX: 6,
          duration: 0.9,
          ease: EASE.out,
          clearProps: 'opacity,transform',
        });
      });

      return () => mm.revert();
    },
    { scope: rootRef },
  );

  return (
    <section
      ref={rootRef}
      id="workflow"
      aria-labelledby="workflow-title"
      className="scroll-mt-28 px-5 py-16 sm:px-8 lg:px-10 lg:py-32"
    >
      <div className="mx-auto w-full max-w-shell">
        <div className="grid items-center gap-16 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-5">
            <h2
              id="workflow-title"
              className="type-display text-[length:var(--type-h2)] text-ink"
            >
              Live in an afternoon, not a quarter.
            </h2>
            <p className="type-lead mt-6">Upload once. We handle everything after that.</p>

            <ul className="mt-12 flex flex-col gap-8">
              {[
                {
                  icon: Sparkles,
                  title: 'One upload, every screen',
                  body: 'Your master file is adapted to the formats the whole network plays. No per-venue exports, no broken playback.',
                },
                {
                  icon: ShieldCheck,
                  title: 'Nothing runs unverified',
                  body: 'Creative is checked before it reaches a display, so a campaign never goes live in a broken state.',
                },
                {
                  icon: Plus,
                  title: 'Additions join in flight',
                  body: 'Extend a running campaign to new locations without re-sending creative or restarting the schedule.',
                },
              ].map((item) => (
                <li key={item.title} className="flex gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent-wash text-accent">
                    <item.icon className="h-5 w-5" strokeWidth={1.6} aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-[length:var(--type-h3)] font-semibold leading-snug text-ink">
                      {item.title}
                    </p>
                    <p className="type-small mt-2.5 text-ink-muted">{item.body}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-12">
              <Cta onClick={openCampaign} withArrow>
                Start a campaign
              </Cta>
            </div>
          </div>

          {/* Preview surface. The 3D transform lives entirely in CSS custom properties so the tilt
              survives React re-renders, and the card is still a flat, readable document under
              reduced motion and on touch. */}
          <div className="lg:col-span-7">
            <div
              className="[perspective:1400px]"
              role="region"
              aria-label="Publishing preview"
            >
              <div
                ref={cardRef}
                data-preview
                className="group relative rounded-xl bg-paper-raised p-1.5 shadow-float ring-1 ring-line/80 transition-shadow duration-slow ease-out [transform:rotateX(var(--tilt-x,0deg))_rotateY(var(--tilt-y,0deg))_translateZ(0)] [transform-style:preserve-3d] [transition:transform_500ms_cubic-bezier(0.16,1,0.3,1),box-shadow_500ms_cubic-bezier(0.16,1,0.3,1)] motion-reduce:[transform:none] motion-reduce:[transition:none] hover:shadow-lift-hover"
              >
                {/* Pointer-tracked specular highlight — the sheen that sells the tilt. */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 rounded-xl opacity-[var(--sheen,0)] transition-opacity duration-slow ease-out [background:radial-gradient(600px_circle_at_var(--pointer-x,50%)_var(--pointer-y,50%),rgba(255,255,255,0.9),transparent_42%)] motion-reduce:hidden"
                />
                {/* Accent edge that catches the light on the leading side. */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 rounded-xl opacity-[var(--sheen,0)] transition-opacity duration-slow ease-out [background:linear-gradient(115deg,transparent_38%,rgba(67,56,202,0.10)_50%,transparent_62%)] motion-reduce:hidden"
                />

                <div
                  data-tilt-inner
                  className="relative overflow-hidden rounded-lg border border-line bg-paper [transform:translateZ(0)] [transition:transform_400ms_cubic-bezier(0.16,1,0.3,1)] motion-reduce:[transform:none] motion-reduce:[transition:none]"
                >
                  {/* Card chrome */}
                  <div className="flex items-center gap-4 border-b border-line bg-paper-raised px-6 py-5">
                    <span
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-ink text-paper-raised shadow-md"
                      aria-hidden="true"
                    >
                      <Sparkles className="h-5 w-5" strokeWidth={1.6} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[length:var(--type-body)] font-semibold text-ink">
                        summer_drink_30s.mp4
                      </p>
                      <p className="type-small mt-0.5 text-ink-muted">
                        Café network · 1,420 screens selected
                      </p>
                    </div>
                    <span className="hidden shrink-0 items-center gap-2 rounded-pill bg-state-ok/10 px-4 py-2 text-[length:var(--type-small)] font-semibold text-state-ok ring-1 ring-inset ring-state-ok/25 sm:inline-flex">
                      <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
                      Ready
                    </span>
                  </div>

                  {/* Milestones */}
                  <div className="p-6 sm:p-8">
                    <p className="type-eyebrow text-ink-muted">Publishing</p>

                    <ol className="mt-6 flex flex-col">
                      {MILESTONES.map((milestone, index) => {
                        const isLast = index === MILESTONES.length - 1;
                        const tone = TONE[index];

                        return (
                          <li key={milestone.label} className="relative flex gap-5 pb-8 last:pb-0">
                            {/* Connector rail, inset to the dot's centre */}
                            {!isLast && (
                              <span
                                className="absolute left-[1.375rem] top-12 h-[calc(100%-2.5rem)] w-px bg-gradient-to-b from-line-strong to-line"
                                aria-hidden="true"
                              />
                            )}

                            <span
                              className={`relative mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full ring-4 ${tone.ring} ${tone.glow} bg-paper-raised`}
                              aria-hidden="true"
                            >
                              <span className={`h-3 w-3 rounded-full ${tone.dot}`} />
                            </span>

                            <div className="min-w-0 flex-1 pt-0.5">
                              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                                <p className="text-[length:var(--type-body)] font-semibold text-ink">
                                  {milestone.label}
                                </p>
                                {isLast ? (
                                  <span
                                    className={`type-eyebrow rounded-pill px-3 py-1.5 ring-1 ring-inset ${tone.chip} ${tone.ring}`}
                                  >
                                    Complete
                                  </span>
                                ) : (
                                  <span className="type-eyebrow text-ink-muted">Done</span>
                                )}
                              </div>
                              <p className="type-small mt-2 text-ink-muted">{milestone.detail}</p>
                            </div>
                          </li>
                        );
                      })}
                    </ol>

                    {/* Reporting summary */}
                    <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3">
                      {[
                        { label: 'Locations', value: '4' },
                        { label: 'Dayparts', value: 'Set' },
                        { label: 'Reporting', value: 'Per screen' },
                      ].map((item) => (
                        <div key={item.label} className="bg-paper-raised px-5 py-4">
                          <dt className="type-small text-ink-muted">{item.label}</dt>
                          <dd className="mt-1.5 text-[length:var(--type-body)] font-semibold tabular-nums text-ink">
                            {item.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}