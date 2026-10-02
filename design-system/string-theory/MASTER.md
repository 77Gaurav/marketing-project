# String Theory — Master Design System

Direction: **Refined Light Editorial**. Neutral-first light canvas, near-black typography,
one disciplined accent, real editorial type hierarchy, cinematic (not decorative) motion.

Global source of truth. Page-level files in `pages/` override this document.

---

## 1. Design Tokens

### Colour — neutral-first, single accent

Semantic tokens live in `app/globals.css` as CSS custom properties. Never hardcode hex in components.

| Token | Value | Role |
|---|---|---|
| `--color-ink` | `#171717` | Primary text, primary buttons |
| `--color-ink-soft` | `#404040` | Secondary text, strong labels |
| `--color-ink-muted` | `#6B6B6B` | Body text on paper (4.5:1+) |
| `--color-ink-faint` | `#A3A3A3` | Decorative only, never load-bearing |
| `--color-paper` | `#FAFAF9` | Page background |
| `--color-paper-raised` | `#FFFFFF` | Cards, panels |
| `--color-paper-sunk` | `#F4F4F3` | Wells, inset areas |
| `--color-line` | `#E5E5E4` | Hairline borders, dividers |
| `--color-line-strong` | `#D4D4D3` | Input borders, strong separators |
| `--color-accent` | `#4338CA` | Single accent — links, focus ring, active state |
| `--color-accent-hover` | `#3730A3` | Accent hover |
| `--color-accent-wash` | `#EEF2FF` | Accent tinted surface |

Status colours are **semantic only** — pipeline states, success, retry. Never decorative:

| Token | Value | Meaning |
|---|---|---|
| `--color-state-ok` | `#047857` | READY, verified, live |
| `--color-state-run` | `#4338CA` | In-progress pipeline stage |
| `--color-state-wait` | `#B45309` | RETRYING, awaiting |
| `--color-state-error` | `#B91C1C` | Failed stage |

Rule: the accent is the only colour used for emphasis in UI chrome. If two colours both read as
"highlight", one of them is wrong.

### Typography — tri-stack

| Role | Family | Source |
|---|---|---|
| Display | Libre Bodoni | `typography.csv` → *Magazine Style* (editorial, refined, print) |
| UI / body | Inter | `typography.csv` → *Spatial Clear* (legibility on dynamic backgrounds) |
| Label / data | JetBrains Mono | `typography.csv` → *Bold Typography Mobile* (mono for labels and stats) |

- Display face is **display sizes only** (`--type-hero` and up). It is not legible below 24px.
- Body copy never exceeds `65ch` measure.
- Eyebrow labels: mono, uppercase, `0.18em` tracking, 11–12px.
- All sizes are fluid via `clamp()` in `--type-*` tokens.

### Spacing — 4px base, 8px rhythm

`--space-1` 4px · `--space-2` 8px · `--space-3` 12px · `--space-4` 16px · `--space-6` 24px ·
`--space-8` 32px · `--space-12` 48px · `--space-16` 64px · `--space-24` 96px · `--space-32` 128px

Section rhythm: eyebrow → headline → body → content. Headline to body is `--space-6`.
Body to content is `--space-16`. Section padding is `--space-32` desktop / `--space-16` mobile.

### Radius

`--radius-sm` 8px · `--radius-md` 12px · `--radius-lg` 20px · `--radius-xl` 28px · `--radius-pill` 999px

### Elevation

Shadows stay near-neutral and low-opacity. Tint comes from the accent at most 8%.

| Token | Value |
|---|---|
| `--shadow-sm` | `0 1px 2px rgba(23,23,23,.04)` |
| `--shadow-md` | `0 4px 16px -4px rgba(23,23,23,.08)` |
| `--shadow-lg` | `0 18px 44px -18px rgba(23,23,23,.18)` |
| `--shadow-accent` | `0 18px 44px -20px rgba(67,56,202,.35)` |

### Motion

Shared tokens — never copy a duration into an ad-hoc transition (`ux.csv` → *Duration Timing*).

| Token | Value | Use |
|---|---|---|
| `--ease-out` | `cubic-bezier(.16,1,.3,1)` | Entrances, reveals |
| `--ease-in-out` | `cubic-bezier(.65,0,.35,1)` | State changes |
| `--dur-fast` | `160ms` | Hover, colour, opacity |
| `--dur-base` | `280ms` | Layout, transforms |
| `--dur-slow` | `600ms` | Scroll reveals |
| `--dur-cinematic` | `1000ms` | Hero entrance only |

Reveal distance stays small (12–24px). Anything larger reads as a slide, not a fade
(`gsap.csv` → *Scroll Reveal*).

### Glass

`--glass-bg`, `--glass-border`, `--glass-blur` in `globals.css`. Glass is for elements floating
over photography. Over flat paper it just looks muddy — use `--color-paper-raised` instead.

---

## 2. Motion Rules

- **`prefers-reduced-motion` is non-negotiable.** Every GSAP context is wrapped in
  `gsap.matchMedia()`; under reduce, the reveal is skipped entirely and elements render in their
  final state. See `components/ui/Reveal.tsx`.
- **Animate 1–2 key elements per view maximum** (`ux.csv` → *Excessive Motion*).
- No `animate-bounce`, `animate-ping`, or looping decoration that competes with scroll motion.
- Reveal triggers use `once: true`. Reverse-on-scroll causes layout thrash.
- Animations never gate content visibility. Static HTML is fully readable with JS disabled.
- No parallax or scroll-jacking (`ux.csv` → *Motion Sensitivity*).

---

## 3. Accessibility Contract

- Body text ≥ 4.5:1 on its surface. Large display text ≥ 3:1.
- Every interactive element has a visible `:focus-visible` ring using `--color-accent`.
  Focus is never removed without a replacement.
- `scroll-padding-top` equals sticky header height so anchors and focus are never obscured
  (`ux.csv` → *Focus Not Obscured*).
- Modals: `role="dialog"`, `aria-modal`, labelled, focus trapped, `Escape` closes, focus
  restored to the trigger, background scroll locked.
- Decorative icons next to visible text: `aria-hidden="true"`. Standalone icon controls get an
  accessible name.
- Tab order matches visual order. No positive `tabindex`.
- Colour is never the only signal — pipeline states pair colour with a text label.

## 4. Iconography

Lucide (`lucide-react`), already a project dependency. One family, `strokeWidth={1.5}` for
outlines, consistent 16/20/24px sizing via `--icon-sm|md|lg`.

**Emoji are never used as icons or structural markers.** Any emoji found in a component is a bug.

## 5. Component Rules

- Interactive elements are real `<button>` / `<a>`. No `onClick` on a `<div>`.
- Hit targets ≥ 44px. Expand with padding or a pseudo-element when the visual is smaller.
- Press states change colour, opacity or elevation — never transform, which shifts layout.
- Cards: hairline `--color-line` border + `--shadow-sm`. Hover lifts to `--shadow-lg` and
  border darkens to `--color-line-strong`. No coloured glow.
- One primary CTA per view, styled with `--color-ink`. Accent is reserved for focus and active
  state so it keeps its meaning.

## 6. Section Pattern

Scroll-triggered storytelling (`landing.csv` → *scroll-triggered-storytelling*):

`Hero` → `Venue categories` → `How it works (pipeline)` → `Locations` → `Social proof` →
`Capabilities` → `Pricing` → `Final CTA` → `Footer`

- Sticky progress indicator reflects scroll depth; chapters stay reachable from the nav.
- Every chapter is comprehensible without its animation.
- Brand identity is under `Brand → Target Audience → Matching Stores → Select Stores → Advertise`.
  Motion should communicate that chain, not decorate.

## 7. Anti-Patterns

- Purple/indigo gradient blobs as section backgrounds — the generic-SaaS tell this design replaces.
- Emoji as icons.
- Gradient text on headlines that carries meaning.
- Glass panels on flat paper backgrounds.
- `animate-bounce` / `animate-ping` used decoratively.
- Invented metrics presented as real results.
- Animation that hides content from crawlers or reduced-motion users.

## 8. Stack Rules

Next.js App Router, TypeScript, Tailwind, GSAP.

- `page.tsx` and `layout.tsx` are **Server Components**. `'use client'` only on interactive leaves.
- Fonts via `next/font/google`, never a raw `<link>` to Google Fonts.
- All images via `next/image` with explicit `sizes`.
- ScrollTrigger registered once, killed on unmount via `gsap.context()` + `useGSAP`.

## 9. Provenance

Tokens derived from skill dataset lookups: `typography.csv` (*Magazine Style*, *Spatial Clear*,
*Bold Typography Mobile*), `colors.csv` (*Architecture/Interior* — minimal black + accent),
`landing.csv` (*scroll-triggered-storytelling*), `ux.csv`, `gsap.csv`, `stacks/nextjs.csv`.