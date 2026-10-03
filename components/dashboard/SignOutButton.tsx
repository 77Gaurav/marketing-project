'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LogOut } from 'lucide-react';

/**
 * Sign out.
 *
 * Posts to the logout route and then refreshes rather than navigating: the session is a cookie and
 * `/dashboard` is a server component that decides between the sign-in prompt and the dashboard, so
 * re-running it on the server is what actually makes the page change. A client-side "signedIn: false"
 * would be a second source of truth for a question only the session can answer.
 *
 * The button is disabled while the request is in flight so a double click cannot race, and the label
 * says so rather than leaving the control looking inert.
 */

export default function SignOutButton({ className = '' }: { className?: string }) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);

    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      // Refreshed either way: if the cookie somehow survived, the server still decides the page, and
      // navigating optimistically would show an empty dashboard to someone who is still signed in.
      router.refresh();
    } catch {
      setSigningOut(false);
    }
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={signingOut}
      className={`btn-secondary px-5 text-[length:var(--type-small)] disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      <LogOut className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
      <span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
    </button>
  );
}