'use client';

import { useRef, type ReactNode } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { DURATION, EASE, MOTION_OK, REVEAL_Y } from '@/lib/motion';

gsap.registerPlugin(ScrollTrigger);

interface RevealProps {
  children: ReactNode;
  /** Stagger these descendants (scoped to this instance) instead of the root element. */
  stagger?: string;
  y?: number;
  className?: string;
}

/**
 * Scroll reveal that respects prefers-reduced-motion.
 *
 * The hidden start state is applied by GSAP as an inline style, so with JavaScript disabled the
 * markup still renders fully readable — content is never gated behind animation.
 */
export default function Reveal({ children, stagger, y = REVEAL_Y, className }: RevealProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(MOTION_OK, () => {
        if (!rootRef.current) return;

        // once: true — reverse-on-scroll thrashes layout as users flick back up the page.
        const scrollTrigger = { trigger: rootRef.current, start: 'top 85%', once: true };

        if (stagger) {
          const targets = rootRef.current.querySelectorAll<HTMLElement>(stagger);
          if (!targets.length) return;

          gsap.from(targets, {
            opacity: 0,
            y,
            duration: DURATION.reveal,
            ease: EASE.out,
            stagger: 0.08,
            scrollTrigger,
          });
          return;
        }

        gsap.from(rootRef.current, {
          opacity: 0,
          y,
          duration: DURATION.reveal,
          ease: EASE.out,
          scrollTrigger,
        });
      });

      return () => mm.revert();
    },
    { scope: rootRef, dependencies: [stagger, y] },
  );

  return (
    <div ref={rootRef} className={className}>
      {children}
    </div>
  );
}