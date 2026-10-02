'use client';

import { X } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react';
import gsap from 'gsap';
import { DURATION, EASE, MOTION_OK } from '@/lib/motion';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  maxWidth?: string;
}

/**
 * Accessible dialog primitive.
 *
 * Handles what the bespoke modals were missing: focus trapping, Escape to dismiss, focus
 * restoration to the trigger, background scroll lock, and inert-ish pointer blocking. The scrim
 * opacity is high enough that foreground contrast holds against any content behind it.
 */
export default function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxWidth = 'max-w-lg',
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();

  const getFocusable = useCallback(
    () =>
      panelRef.current
        ? Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
            (el) => el.offsetParent !== null,
          )
        : [],
    [],
  );

  // Move focus into the dialog on open, restore it to the trigger on close.
  useEffect(() => {
    if (!isOpen) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const focusables = getFocusable();
    (focusables[0] ?? panelRef.current)?.focus();

    return () => {
      previouslyFocused.current?.focus?.();
    };
  }, [isOpen, getFocusable]);

  // Escape closes; Tab is trapped inside the panel.
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusables = getFocusable();
      if (!focusables.length) {
        event.preventDefault();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === panelRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose, getFocusable]);

  // Lock background scroll without the layout shift that `overflow: hidden` causes.
  useEffect(() => {
    if (!isOpen) return;

    const { body, documentElement } = document;
    const scrollbarWidth = window.innerWidth - documentElement.clientWidth;
    const prevOverflow = body.style.overflow;
    const prevPadding = body.style.paddingRight;

    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;

    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPadding;
    };
  }, [isOpen]);

  // Entrance only. Must be gated in JS, not just CSS: GSAP writes inline styles, which the
  // global reduced-motion override cannot reach.
  useEffect(() => {
    if (!isOpen || !panelRef.current) return;

    const mm = gsap.matchMedia();
    mm.add(MOTION_OK, () => {
      gsap.from(panelRef.current!, {
        opacity: 0,
        y: 14,
        scale: 0.985,
        duration: DURATION.base,
        ease: EASE.out,
        clearProps: 'opacity,transform',
      });
    });

    return () => mm.revert();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto overscroll-contain bg-ink/60 p-4 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`relative my-auto w-full ${maxWidth} overflow-hidden rounded-xl bg-paper-raised shadow-float ring-1 ring-line`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5 sm:px-7 sm:py-6">
          <div>
            <h2 id={titleId} className="type-display text-[length:var(--type-h3)] text-ink">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-2 text-[length:var(--type-small)] text-ink-muted">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="icon-btn -mr-2 -mt-1 shrink-0"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="px-6 py-6 sm:px-7 sm:py-7">{children}</div>
      </div>
    </div>
  );
}