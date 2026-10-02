'use client';

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { Menu, Radio, X } from 'lucide-react';
import Cta from '@/components/ui/Cta';
import CtaLink from '@/components/ui/CtaLink';
import { useModals } from '@/components/ui/ModalProvider';
import { DURATION, EASE, MOTION_OK, REDUCED_MOTION } from '@/lib/motion';

/**
 * Two lists, two jobs — keep them separate.
 *
 * SECTIONS is in document order and is only used to resolve which section is under the probe
 * line, so it must stay ordered top-to-bottom.
 * NAV is the visual order of the bar. Its `id` is the real section anchor, so every label still
 * jumps to the section that owns it and the slide-to-pill still resolves by id.
 */
const SECTIONS = [
  { id: 'venues' },
  { id: 'workflow' },
  { id: 'platform' },
  { id: 'pricing' },
];

const NAV = [
  { id: 'platform', label: 'Product' },
  { id: 'venues', label: 'Solutions' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'workflow', label: 'Resources' },
];

export default function Navbar() {
  const { openDemo } = useModals();
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const progressRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const navRef = useRef<HTMLUListElement>(null);

  // Scroll depth + active chapter, coalesced into one rAF so we read layout once per frame.
  useEffect(() => {
    let frame = 0;

    const measure = () => {
      frame = 0;

      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const depth = scrollable > 0 ? window.scrollY / scrollable : 0;
      if (progressRef.current) {
        progressRef.current.style.transform = `scaleX(${Math.min(Math.max(depth, 0), 1)})`;
      }

      setScrolled(window.scrollY > 12);

      // Last section in document order whose top has passed the 40% viewport probe line.
      const probe = window.innerHeight * 0.4;
      let current: string | null = null;
      for (const section of SECTIONS) {
        const el = document.getElementById(section.id);
        if (el && el.getBoundingClientRect().top <= probe) current = section.id;
      }
      setActive(current);
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  // Slide the single active pill to the current chapter.
  useEffect(() => {
    const pill = pillRef.current;
    const list = navRef.current;
    if (!pill || !list) return;

    const mm = gsap.matchMedia();

    mm.add(REDUCED_MOTION, () => {
      const target = active
        ? list.querySelector<HTMLElement>(`[data-chapter="${active}"]`)
        : null;
      gsap.set(pill, { autoAlpha: target ? 1 : 0 });
      if (target) gsap.set(pill, { x: target.offsetLeft, width: target.offsetWidth });
    });

    mm.add(MOTION_OK, () => {
      const target = active
        ? list.querySelector<HTMLElement>(`[data-chapter="${active}"]`)
        : null;

      if (!target) {
        gsap.to(pill, { autoAlpha: 0, duration: DURATION.fast, ease: EASE.soft });
        return;
      }

      gsap.to(pill, {
        autoAlpha: 1,
        x: target.offsetLeft,
        width: target.offsetWidth,
        duration: DURATION.base,
        ease: EASE.out,
      });
    });

    return () => mm.revert();
  }, [active]);

  // Close the drawer on Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  return (
    <header
      className="fixed inset-x-0 top-0 z-50"
      style={{ height: 'var(--header-height)' }}
    >
      <div
        className={`absolute inset-0 border-b transition-colors duration-base ease-out ${
          scrolled || menuOpen
            ? 'border-line bg-paper/85 backdrop-blur-xl'
            : 'border-transparent bg-transparent'
        }`}
      />

      {/* Gutter matches the hero's split gutter so the logo aligns with the hero headline, not
          with the max-w-shell sections below it. */}
      <div className="relative mx-auto flex h-full w-full max-w-shell items-center justify-between px-5 sm:px-8 lg:max-w-none lg:px-[5.5vw]">
        <a
          href="#main"
          className="flex min-h-tap items-center gap-2.5 rounded-md text-ink"
          aria-label="String Theory — home"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-ink text-paper-raised">
            <Radio className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </span>
          <span className="text-[1.1875rem] font-semibold tracking-tight">
            String<span className="text-ink-muted">Theory</span>
          </span>
        </a>

        <nav aria-label="Sections" className="hidden lg:block">
          <ul ref={navRef} className="relative flex items-center gap-1">
            {/* Single pill slides between chapters rather than one pill per link. */}
            <span
              ref={pillRef}
              className="pointer-events-none absolute left-0 top-0 -z-10 h-full rounded-pill bg-paper-sunk"
              style={{ opacity: 0, visibility: 'hidden' }}
              aria-hidden="true"
            />
            {NAV.map((chapter) => (
              <li key={chapter.id}>
                <a
                  href={`#${chapter.id}`}
                  data-chapter={chapter.id}
                  aria-current={active === chapter.id ? 'true' : undefined}
                  className={`relative inline-flex min-h-tap items-center rounded-pill px-4 py-2.5 text-[length:var(--type-small)] font-medium transition-colors duration-fast ease-out ${
                    active === chapter.id ? 'text-ink' : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {chapter.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <button
            type="button"
            onClick={openDemo}
            className="inline-flex min-h-tap items-center rounded-pill px-4 text-[length:var(--type-small)] font-medium text-ink-muted transition-colors duration-fast ease-out hover:text-ink"
          >
            Watch demo
          </button>
          <CtaLink
            href="/campaigns/new"
            className="px-5 text-[length:var(--type-small)]"
          >
            Start a campaign
          </CtaLink>
        </div>

        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          className="icon-btn lg:hidden"
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        >
          {menuOpen ? (
            <X className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Menu className="h-5 w-5" aria-hidden="true" />
          )}
        </button>
      </div>

      <div
        ref={progressRef}
        className="absolute inset-x-0 bottom-0 h-px origin-left bg-accent"
        style={{ transform: 'scaleX(0)' }}
        aria-hidden="true"
      />

      {/* grid-rows 0fr → 1fr animates to content height without measuring or JS */}
      <div
        id="mobile-nav"
        className={`grid border-b border-line bg-paper transition-[grid-template-rows] duration-base ease-out lg:hidden ${
          menuOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <nav aria-label="Sections" className="overflow-hidden">
          <div className="px-5 pb-8 pt-2">
            <ul>
              {NAV.map((chapter) => (
                <li key={chapter.id} className="border-b border-line last:border-b-0">
                  <a
                    href={`#${chapter.id}`}
                    onClick={() => setMenuOpen(false)}
                    className="flex min-h-[3.5rem] items-center text-[length:var(--type-lead)] text-ink"
                  >
                    {chapter.label}
                  </a>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-col gap-3">
              <Cta
                variant="secondary"
                onClick={() => {
                  setMenuOpen(false);
                  openDemo();
                }}
              >
                Watch demo
              </Cta>
              <CtaLink
                href="/campaigns/new"
                onClick={() => setMenuOpen(false)}
              >
                Start a campaign
              </CtaLink>
            </div>
          </div>
        </nav>
      </div>
    </header>
  );
}