/**
 * Shared motion tokens — see design-system/string-theory/MASTER.md §2
 *
 * Every animation in the app pulls its easing and duration from here. The ux dataset is explicit
 * that copying one duration across every transition is a defect, so these are named by intent
 * rather than by number.
 */

export const EASE = {
  /** Entrances and reveals — long tail, decelerating */
  out: 'expo.out',
  /** State changes that begin and end on screen */
  inOut: 'power2.inOut',
  /** Colour and opacity only — no transform */
  soft: 'power1.out',
} as const;

export const DURATION = {
  /** Hover, focus, colour transitions */
  fast: 0.16,
  /** Layout and transform shifts */
  base: 0.28,
  /** Pointer-tracked surfaces settling back to rest */
  slow: 0.5,
  /** Scroll-triggered reveals */
  reveal: 0.6,
  /** Hero entrance only — never reused */
  cinematic: 1,
} as const;

/** Reveal distance. Kept small so motion reads as a fade, not a slide. */
export const REVEAL_Y = 16;

/** The media query that must gate every non-essential animation. */
export const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/** Animations are opt-in: match this to enable them. */
export const MOTION_OK = '(prefers-reduced-motion: no-preference)';