import type { ReactNode } from 'react';

/**
 * Mono eyebrow: the section label that sits above every headline. Consistent across all
 * chapters is most of what makes the page read as one editorial system.
 */
export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`type-eyebrow text-accent ${className}`}>{children}</p>;
}