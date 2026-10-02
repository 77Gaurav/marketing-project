'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Field, TextInput } from '@/components/ui/Field';
import { adminCredentialsSchema, fieldErrorsFrom } from '@/lib/validation/admin';

/**
 * The admin sign-in form.
 *
 * On success it calls `router.refresh()` rather than navigating: the session is a cookie, and the
 * `/admin` page is a server component that decides between this form and the console. Refreshing
 * re-runs that decision on the server, so the two can never disagree about whether anyone is signed in
 * — a client-side `isLoggedIn` flag would be a second source of truth for a question only the server
 * can answer.
 *
 * Validation is the shared schema, the same object the API route parses with, so the field errors shown
 * here are the ones the server would have produced.
 */

interface ErrorBody {
  error: string;
  fields?: Record<string, string>;
  warning?: string;
}

export default function AdminLogin() {
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /**
   * Focus is requested rather than taken, and applied in an effect after React commits.
   *
   * Calling `.focus()` inside the submit handler does not work here for the same reason it did not in
   * the campaign form: the controls are still `disabled` by the in-flight request, and a disabled
   * element silently refuses focus. The nonce means asking for the same target twice is still a state
   * change and still re-runs the effect.
   */
  const [focusRequest, setFocusRequest] = useState<{ id: string; nonce: number } | null>(null);
  const requestFocus = (id: string) =>
    setFocusRequest((current) => ({ id, nonce: (current?.nonce ?? 0) + 1 }));

  useEffect(() => {
    if (!focusRequest) return;
    document.getElementById(focusRequest.id)?.focus();
  }, [focusRequest]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = adminCredentialsSchema.safeParse({ username, password });
    if (!parsed.success) {
      setErrors(fieldErrorsFrom(parsed.error));
      setFormError(null);
      const firstField = Object.keys(fieldErrorsFrom(parsed.error))[0];
      requestFocus(firstField === 'password' ? 'admin-password' : 'admin-username');
      return;
    }

    setErrors({});
    setFormError(null);
    setSubmitting(true);

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });

      const body = (await response.json().catch(() => ({}))) as ErrorBody;

      if (!response.ok) {
        if (body.fields) {
          setErrors(body.fields);
          const firstField = Object.keys(body.fields)[0];
          requestFocus(firstField === 'password' ? 'admin-password' : 'admin-username');
        } else {
          setFormError(body.error ?? 'Could not sign you in. Try again.');
          requestFocus('admin-form-error');
        }
        setSubmitting(false);
        return;
      }

      // The server now decides the page is the console, not this form.
      router.refresh();
    } catch {
      setFormError('We could not reach the server. Check your connection and try again.');
      requestFocus('admin-form-error');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="mt-10 flex flex-col gap-6">
      <Field id="admin-username" label="Username" error={errors.username}>
        {({ describedBy, invalid }) => (
          <TextInput
            id="admin-username"
            name="username"
            autoComplete="username"
            value={username}
            disabled={submitting}
            required
            invalid={invalid}
            describedBy={describedBy}
            onChange={(event) => setUsername(event.target.value)}
          />
        )}
      </Field>

      <Field id="admin-password" label="Password" error={errors.password}>
        {({ describedBy, invalid }) => (
          <TextInput
            id="admin-password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            disabled={submitting}
            required
            invalid={invalid}
            describedBy={describedBy}
            onChange={(event) => setPassword(event.target.value)}
          />
        )}
      </Field>

      {formError && (
        <div
          id="admin-form-error"
          role="alert"
          tabIndex={-1}
          className="rounded-md border border-state-error bg-paper px-5 py-4 text-[length:var(--type-body)] text-state-error"
        >
          {formError}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex min-h-[48px] items-center justify-center rounded-pill bg-ink px-7 text-[length:var(--type-body)] font-semibold text-paper-raised transition-colors duration-fast ease-out hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
