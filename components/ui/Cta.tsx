'use client';

import { ArrowRight } from 'lucide-react';

type Variant = 'primary' | 'secondary';

interface CtaProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Optional arrow that nudges on hover. Purely decorative — hidden from AT. */
  withArrow?: boolean;
}

// Written out in full because Tailwind tree-shakes @layer components against literal source
// matches — a template string like `btn-${variant}` would be purged from the build.
const VARIANTS: Record<Variant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
};

/**
 * Shared CTA. Hit target is ≥48px via `.btn-*`. Hover changes colour only, never size, so
 * surrounding content never shifts.
 */
export default function Cta({
  variant = 'primary',
  withArrow = false,
  className = '',
  children,
  ...props
}: CtaProps) {
  return (
    <button type="button" {...props} className={`${VARIANTS[variant]} group ${className}`}>
      <span>{children}</span>
      {withArrow && (
        <ArrowRight
          className="h-4 w-4 transition-transform duration-fast ease-out group-hover:translate-x-1"
          aria-hidden="true"
        />
      )}
    </button>
  );
}