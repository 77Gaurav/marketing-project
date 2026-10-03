import Link from 'next/link';

/**
 * The Google sign-in control.
 *
 * A link, not a button with an onClick that calls `fetch` then `window.location`. The endpoint is a
 * redirect to Google, so an anchor is what it actually is: it works with middle-click and
 * open-in-new-tab, shows its destination in the status bar, and keeps working with JavaScript
 * disabled or before hydration. A client-side fetch would also add a round trip and a place to fail
 * for no benefit — there is no JSON response here to consume.
 *
 * The `next` destination rides along as a query parameter and is re-validated by the server on the
 * way back, so it cannot be used to bounce anyone off-site after sign-in.
 */

interface GoogleSignInButtonProps {
  /** Internal path to land on afterwards. Constrained server-side by `safeNextPath`. */
  next?: string;
  className?: string;
}

/** The four-colour wordmark's glyph, inlined: one request fewer and it inherits `currentColor`. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.94-2.91l-3.88-3c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.29 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.28a12 12 0 0 0 0 10.78l4.01-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.76 0 3.34.61 4.59 1.8l3.43-3.43C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.61l4.01 3.1C6.23 6.86 8.88 4.75 12 4.75Z"
      />
    </svg>
  );
}

export default function GoogleSignInButton({ next, className = '' }: GoogleSignInButtonProps) {
  const href = next ? `/api/auth/google?next=${encodeURIComponent(next)}` : '/api/auth/google';

  return (
    <Link
      href={href}
      className={`btn-secondary ${className}`}
      // `noopener` is irrelevant here because the same tab is reused, but naming the intent costs
      // nothing and keeps the pattern consistent if this ever becomes a new-tab flow.
      rel="noopener"
    >
      <GoogleMark />
      <span>Continue with Google</span>
    </Link>
  );
}