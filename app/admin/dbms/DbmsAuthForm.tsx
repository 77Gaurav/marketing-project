'use client';

import { useState, type FormEvent } from 'react';
import { Database, KeyRound, Lock, ShieldCheck, ArrowRight, Server } from 'lucide-react';
import { Field, TextInput } from '@/components/ui/Field';

interface Props {
  onSuccess: (user: string) => void;
}

export default function DbmsAuthForm({ onSuccess }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!username.trim() || !password) {
      setError('Please provide both the DB admin username and password.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/dbms/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const body = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        user?: string;
      };

      if (!response.ok || !body.success) {
        setError(body.error ?? 'Invalid DB admin credentials. Please verify your credentials.');
        setBusy(false);
        return;
      }

      onSuccess(body.user ?? username.trim());
    } catch {
      setError('We could not reach the authentication server. Please check your network.');
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="card border border-line bg-paper-raised p-8 sm:p-10 shadow-sm">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-ink text-paper-raised mb-6 shadow-sm">
          <Database className="h-6 w-6" strokeWidth={1.75} />
        </div>

        <h2 className="type-display text-[length:var(--type-h2)] font-bold text-ink">
          Database Management System
        </h2>
        <p className="mt-2 text-[length:var(--type-body)] text-ink-muted">
          Enter DB admin username and password to inspect the relational schema and live database records.
        </p>

        {error && (
          <div
            role="alert"
            className="mt-6 rounded-md border border-state-error bg-paper px-4 py-3 text-[length:var(--type-small)] text-state-error"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-5">
          <Field id="dbms-username" label="DB admin username">
            {({ describedBy, invalid }) => (
              <div className="relative">
                <TextInput
                  id="dbms-username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  required
                  disabled={busy}
                  invalid={invalid}
                  describedBy={describedBy}
                  placeholder="e.g. dbadmin"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            )}
          </Field>

          <Field id="dbms-password" label="DB admin password">
            {({ describedBy, invalid }) => (
              <div className="relative">
                <TextInput
                  id="dbms-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  disabled={busy}
                  invalid={invalid}
                  describedBy={describedBy}
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            )}
          </Field>

          <div className="pt-2">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-pill bg-ink px-6 text-base font-semibold text-paper-raised transition-all duration-fast hover:bg-ink/85 disabled:cursor-not-allowed disabled:opacity-60 shadow-sm"
            >
              {busy ? (
                <span>Authenticating…</span>
              ) : (
                <>
                  <KeyRound className="h-4 w-4" />
                  <span>Authenticate & Open DBMS</span>
                  <ArrowRight className="h-4 w-4 ml-1" />
                </>
              )}
            </button>
          </div>
        </form>

        <div className="mt-8 border-t border-line pt-5">
          <div className="flex items-start gap-2.5 text-xs text-ink-muted">
            <ShieldCheck className="h-4 w-4 text-state-ok mt-0.5 shrink-0" />
            <p>
              Requires separate DBMS administrator credentials configured via <code className="font-semibold text-ink">DBMS_USERNAME</code> and <code className="font-semibold text-ink">DBMS_PASSWORD</code> in <code className="font-semibold text-ink">.env</code>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
