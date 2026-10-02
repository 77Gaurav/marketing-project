import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

/**
 * Anchor twin of `components/ui/Cta.tsx`.
 *
 * Every "Start a campaign" control is navigation to another page, so it is an `<a>`, not a
 * `<button>` with an onClick that pushes a route. That buys middle-click and open-in-new-tab, a
 * status-bar URL before hovering, and no client JavaScript to make the link work — all of which
 * MASTER.md §5 asks for when it says interactive elements should be real buttons *and* links.
 *
 * Class names are duplicated from Cta rather than shared through an array: Tailwind scans source for
 * literal strings and a shared constant would survive, but keeping the two files visually identical
 * side by side is worth more than the duplication.
 */

type Variant = 'primary' | 'secondary';

interface CtaLinkProps extends React.ComponentPropsWithoutRef<typeof Link> {
  variant?: Variant;
  withArrow?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
};

export default function CtaLink({
  variant = 'primary',
  withArrow = false,
  className = '',
  children,
  ...props
}: CtaLinkProps) {
  return (
    <Link {...props} className={`${VARIANTS[variant]} group ${className}`}>
      <span>{children}</span>
      {withArrow && (
        <ArrowRight
          className="h-4 w-4 transition-transform duration-fast ease-out group-hover:translate-x-1"
          aria-hidden="true"
        />
      )}
    </Link>
  );
}