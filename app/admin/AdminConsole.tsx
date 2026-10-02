'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Field, Select, TextInput } from '@/components/ui/Field';
import { BRAND_STATUSES, STORE_STATUSES, type BrandListEntry, type StoreListEntry } from '@/lib/db/types';
import { adminBrandSchema, adminStoreSchema, fieldErrorsFrom } from '@/lib/validation/admin';

/**
 * The admin console.
 *
 * Data is read on the server and handed in as props, so the first paint has no loading state and no
 * waterfall. After a mutation the affected list is re-fetched rather than patched in place: a row
 * deleted by cascade, or a slug gained from a collision suffix, are server facts, and re-reading is
 * the only way the table cannot disagree with the database.
 *
 * Deleting is inline rather than in a dialog. An operator deleting from a table of thirty rows should
 * not have to dismiss a modal per row, and an inline panel needs no focus trap and no scroll lock —
 * the accessibility cost of a dialog is exactly what an inline confirmation avoids. The destructive
 * paths still refuse to act until the name has been typed, and the refusal is enforced by the API as
 * well as here, so the confirmation cannot be skipped by calling the endpoint directly.
 */

interface AdminIdentity {
  fullName: string;
  email: string;
}

interface Props {
  admin: AdminIdentity;
  initialBrands: BrandListEntry[];
  initialStores: StoreListEntry[];
  weakPasswordWarning: boolean;
}

interface ErrorBody {
  error: string;
  fields?: Record<string, string>;
}

/** What the server said a delete would destroy, per the two-step protocol in the API routes. */
interface PendingDelete {
  kind: 'brand' | 'store';
  id: string;
  name: string;
  /** Brands only: the number of campaigns the server said this delete would take with it. */
  campaignCount?: number;
}

type OpenPanel = 'brand' | 'store' | null;

// Fixed to UTC so the server-rendered markup and the hydrated markup agree. A local-time formatter
// produces different text on each side of hydration whenever the two disagree, which shows up as a
// React hydration warning on exactly the page an operator is trying to trust.
const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const NUMBER_FORMAT = new Intl.NumberFormat('en-GB');

function formatDate(iso: string): string {
  return DATE_FORMAT.format(new Date(iso));
}

/** Maps a status onto the tokens already used for state elsewhere in the product. */
const BRAND_STATUS_TONE: Record<string, string> = {
  ACTIVE: 'text-state-ok',
  PENDING_REVIEW: 'text-state-run',
  SUSPENDED: 'text-state-error',
};

const STORE_STATUS_TONE: Record<string, string> = {
  ACTIVE: 'text-state-ok',
  PENDING_REVIEW: 'text-state-run',
  PAUSED: 'text-state-wait',
  CLOSED: 'text-state-error',
};

export default function AdminConsole({ admin, initialBrands, initialStores, weakPasswordWarning }: Props) {
  const router = useRouter();

  const [brands, setBrands] = useState(initialBrands);
  const [stores, setStores] = useState(initialStores);
  const [panel, setPanel] = useState<OpenPanel>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [confirmValue, setConfirmValue] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [focusRequest, setFocusRequest] = useState<{ id: string; nonce: number } | null>(null);
  const requestFocus = (id: string) =>
    setFocusRequest((current) => ({ id, nonce: (current?.nonce ?? 0) + 1 }));

  useEffect(() => {
    if (!focusRequest) return;
    document.getElementById(focusRequest.id)?.focus();
  }, [focusRequest]);

  const totalScreens = stores.reduce((sum, store) => sum + store.screenCount, 0);

  async function refreshBrands() {
    const response = await fetch('/api/admin/brands');
    if (!response.ok) throw new Error('refresh-brands');
    const body = (await response.json()) as { brands: BrandListEntry[] };
    setBrands(body.brands);
  }

  async function refreshStores() {
    const response = await fetch('/api/admin/stores');
    if (!response.ok) throw new Error('refresh-stores');
    const body = (await response.json()) as { stores: StoreListEntry[] };
    setStores(body.stores);
  }

  /** Close the confirmation panel and put focus back where the operator left the page. */
  function cancelDelete() {
    const { kind, id } = pendingDelete ?? { kind: 'brand', id: '' };
    setPendingDelete(null);
    setConfirmValue('');
    requestFocus(`delete-${kind}-${id}`);
  }

  async function handleSignOut() {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.refresh();
  }

  /** Stage one of the delete: ask the server what it would destroy. */
  async function requestDelete(target: PendingDelete) {
    setBusyId(target.id);
    setError(null);

    try {
      const endpoint = `/api/admin/${target.kind === 'brand' ? 'brands' : 'stores'}/${target.id}`;
      const response = await fetch(endpoint, { method: 'DELETE' });

      if (response.status === 404) {
        setError('That row is already gone. The list has been refreshed.');
        await refreshBrands();
        return;
      }

      if (response.status !== 409) {
        const body = (await response.json().catch(() => ({}))) as ErrorBody;
        setError(body.error ?? 'Could not delete that row.');
        return;
      }

      // 409 carries the facts the confirmation has to be written against.
      const body = (await response.json()) as {
        brand?: { id: string; name: string; campaignCount: number };
        store?: { id: string; name: string; screenCount: number };
      };

      const detail = body.brand ?? body.store;
      if (!detail) {
        setError('Could not read what this delete would remove.');
        return;
      }

      setPendingDelete({
        kind: target.kind,
        id: detail.id,
        name: detail.name,
        campaignCount: body.brand?.campaignCount,
      });
      setConfirmValue('');
      requestFocus('delete-confirm-input');
    } catch {
      setError('We could not reach the server. Check your connection and try again.');
    } finally {
      setBusyId(null);
    }
  }

  /** Stage two: the name has been typed, so actually delete. */
  async function confirmDelete() {
    if (!pendingDelete) return;
    const target = pendingDelete;

    if (confirmValue !== target.name) {
      setError('Type the name exactly as shown before deleting.');
      requestFocus('delete-confirm-input');
      return;
    }

    setBusyId(target.id);
    setError(null);

    try {
      const collection = target.kind === 'brand' ? 'brands' : 'stores';
      const params = new URLSearchParams({ confirm: target.name });
      // Brands carry the count they will take with them, so a delete confirmed against a stale count
      // is refused by the server rather than destroying more than the operator agreed to.
      if (target.campaignCount !== undefined) {
        params.set('campaignCount', String(target.campaignCount));
      }

      const response = await fetch(`/api/admin/${collection}/${target.id}?${params}`, {
        method: 'DELETE',
      });
      const body = (await response.json().catch(() => ({}))) as ErrorBody & {
        campaignsDeleted?: number;
        screensRemoved?: number;
      };

      if (!response.ok) {
        setError(body.error ?? 'Could not delete that row.');
        // The server has told us the picture changed; re-read so the table matches reality.
        if (target.kind === 'brand') await refreshBrands();
        else await refreshStores();
        return;
      }

      if (target.kind === 'brand') {
        await refreshBrands();
        setNotice(
          body.campaignsDeleted
            ? `Deleted ${target.name} and ${body.campaignsDeleted} campaign${body.campaignsDeleted === 1 ? '' : 's'}.`
            : `Deleted ${target.name}.`,
        );
      } else {
        await refreshStores();
        setNotice(
          `Deleted ${target.name} and ${body.screensRemoved} screen${body.screensRemoved === 1 ? '' : 's'}.`,
        );
      }

      setPendingDelete(null);
      setConfirmValue('');
    } catch {
      setError('We could not reach the server. Check your connection and try again.');
    } finally {
      setBusyId(null);
    }
  }

  const confirmMismatch = pendingDelete !== null && confirmValue !== pendingDelete.name;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="type-display text-[length:var(--type-h2)] text-ink">Network admin</h1>
          <p className="type-lead mt-4">
            Signed in as {admin.fullName} · {admin.email}
          </p>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className="inline-flex min-h-tap items-center gap-2 rounded-pill border border-line-strong px-5 text-[length:var(--type-small)] font-medium text-ink-muted transition-colors duration-fast ease-out hover:border-ink/25 hover:text-ink"
        >
          Sign out
        </button>
      </div>

      {weakPasswordWarning && (
        <p
          role="status"
          className="mt-8 rounded-md border border-state-run bg-paper px-5 py-4 text-[length:var(--type-small)] text-state-run"
        >
          This console is running on the default development password. Set{' '}
          <code className="font-semibold">ADMIN_PASSWORD</code> in the environment before deploying —
          the server refuses to start in production without it.
        </p>
      )}

      <dl className="mt-10 grid gap-4 sm:grid-cols-3">
        <SummaryTile label="Brands" value={NUMBER_FORMAT.format(brands.length)} />
        <SummaryTile label="Stores" value={NUMBER_FORMAT.format(stores.length)} />
        <SummaryTile label="Screens in network" value={NUMBER_FORMAT.format(totalScreens)} />
      </dl>

      {/* Two regions rather than one page-level banner: a failed delete of a brand and a failed add
          of a store are different problems and should not overwrite each other. */}
      <p role="status" className="sr-only">
        {notice}
      </p>

      <section className="mt-14">
        <SectionHeader
          title="Brands"
          count={brands.length}
          open={panel === 'brand'}
          onToggle={() => setPanel(panel === 'brand' ? null : 'brand')}
          actionLabel={panel === 'brand' ? 'Close form' : 'Add brand'}
        />

        {error && (
          <div
            role="alert"
            className="mt-6 rounded-md border border-state-error bg-paper px-5 py-4 text-[length:var(--type-body)] text-state-error"
          >
            {error}
          </div>
        )}

        {panel === 'brand' && (
          <AddBrandForm
            onCancel={() => setPanel(null)}
            onSaved={async (name) => {
              await refreshBrands();
              setPanel(null);
              setNotice(`Added ${name}.`);
            }}
            onError={setError}
          />
        )}

        <div className="card mt-6 overflow-hidden">
          {brands.length === 0 ? (
            <EmptyState>No brands yet. A brand is created here, or by someone starting a campaign.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem] text-left">
                <caption className="sr-only">Brands, with contact details and campaign counts</caption>
                <thead>
                  <tr className="border-b border-line">
                    <Th>Brand</Th>
                    <Th className="hidden md:table-cell">Contact</Th>
                    <Th>Status</Th>
                    <Th className="hidden lg:table-cell">Added</Th>
                    <Th className="text-right">Campaigns</Th>
                    <Th className="text-right">
                      <span className="sr-only">Actions</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {brands.map((brand) => (
                    <tr key={brand.id} className="border-b border-line last:border-0">
                      <Td>
                        <span className="block font-semibold text-ink">{brand.name}</span>
                        <span className="block text-[length:var(--type-small)] text-ink-muted">
                          {brand.website ?? 'No website'}{' '}
                          {brand.ownerEmail === null && (
                            <span className="text-ink-muted">· no account</span>
                          )}
                        </span>
                      </Td>
                      <Td className="hidden md:table-cell">
                        <span className="block text-ink">{brand.contactName}</span>
                        <span className="block text-[length:var(--type-small)] text-ink-muted">
                          {brand.contactEmail}
                        </span>
                      </Td>
                      <Td>
                        <StatusLabel status={brand.status} tone={BRAND_STATUS_TONE} />
                      </Td>
                      <Td className="hidden lg:table-cell text-ink-muted">{formatDate(brand.createdAt)}</Td>
                      <Td className="text-right font-semibold text-ink">
                        {NUMBER_FORMAT.format(brand.campaignCount)}
                      </Td>
                      <Td className="text-right">
                        {pendingDelete?.id === brand.id && pendingDelete.kind === 'brand' ? (
                          <ConfirmPanel
                            name={brand.name}
                            value={confirmValue}
                            onChange={setConfirmValue}
                            busy={busyId === brand.id}
                            mismatch={confirmMismatch}
                            warning={
                              brand.campaignCount > 0
                                ? `This permanently deletes ${brand.campaignCount} campaign${brand.campaignCount === 1 ? '' : 's'} and their video records.`
                                : 'This brand has no campaigns.'
                            }
                            onConfirm={confirmDelete}
                            onCancel={cancelDelete}
                          />
                        ) : (
                          <DeleteButton
                            id={`delete-brand-${brand.id}`}
                            label={`Delete ${brand.name}`}
                            busy={busyId === brand.id}
                            onClick={() =>
                              requestDelete({
                                kind: 'brand',
                                id: brand.id,
                                name: brand.name,
                                campaignCount: brand.campaignCount,
                              })
                            }
                          />
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="mt-16">
        <SectionHeader
          title="Stores"
          count={stores.length}
          open={panel === 'store'}
          onToggle={() => setPanel(panel === 'store' ? null : 'store')}
          actionLabel={panel === 'store' ? 'Close form' : 'Add store'}
        />

        {panel === 'store' && (
          <AddStoreForm
            onCancel={() => setPanel(null)}
            onSaved={async (name) => {
              await refreshStores();
              setPanel(null);
              setNotice(`Added ${name}.`);
            }}
            onError={setError}
          />
        )}

        <div className="card mt-6 overflow-hidden">
          {stores.length === 0 ? (
            <EmptyState>
              No stores yet. A store is a venue that supplies screens — add its location and how many
              screens it has.
            </EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] text-left">
                <caption className="sr-only">Stores, with location, screen count and contact</caption>
                <thead>
                  <tr className="border-b border-line">
                    <Th>Store</Th>
                    <Th>Location</Th>
                    <Th className="hidden md:table-cell">Contact</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Screens</Th>
                    <Th className="text-right">
                      <span className="sr-only">Actions</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {stores.map((store) => (
                    <tr key={store.id} className="border-b border-line last:border-0">
                      <Td>
                        <span className="block font-semibold text-ink">{store.name}</span>
                        <span className="block text-[length:var(--type-small)] text-ink-muted">
                          {store.website ?? 'No website'}
                        </span>
                      </Td>
                      <Td className="text-ink">{store.location}</Td>
                      <Td className="hidden md:table-cell">
                        <span className="block text-ink">{store.contactName ?? '—'}</span>
                        <span className="block text-[length:var(--type-small)] text-ink-muted">
                          {store.contactEmail}
                        </span>
                      </Td>
                      <Td>
                        <StatusLabel status={store.status} tone={STORE_STATUS_TONE} />
                      </Td>
                      <Td className="text-right font-semibold text-ink">
                        {NUMBER_FORMAT.format(store.screenCount)}
                      </Td>
                      <Td className="text-right">
                        {pendingDelete?.id === store.id && pendingDelete.kind === 'store' ? (
                          <ConfirmPanel
                            name={store.name}
                            value={confirmValue}
                            onChange={setConfirmValue}
                            busy={busyId === store.id}
                            mismatch={confirmMismatch}
                            warning={`This removes ${store.screenCount} screen${store.screenCount === 1 ? '' : 's'} from the network total.`}
                            onConfirm={confirmDelete}
                            onCancel={cancelDelete}
                          />
                        ) : (
                          <DeleteButton
                            id={`delete-store-${store.id}`}
                            label={`Delete ${store.name}`}
                            busy={busyId === store.id}
                            onClick={() =>
                              requestDelete({ kind: 'store', id: store.id, name: store.name })
                            }
                          />
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ presentational pieces */

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-5 py-4">
      <dt className="type-eyebrow text-ink-muted">{label}</dt>
      <dd className="mt-2 text-[length:var(--type-h2)] font-semibold text-ink">{value}</dd>
    </div>
  );
}

function SectionHeader({
  title,
  count,
  open,
  onToggle,
  actionLabel,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  actionLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <h2 className="type-display text-[length:var(--type-h3)] text-ink">
        {title}{' '}
        <span className="text-ink-muted">({count})</span>
      </h2>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="inline-flex min-h-tap items-center gap-2 rounded-pill border border-line-strong px-5 text-[length:var(--type-small)] font-medium text-ink transition-colors duration-fast ease-out hover:border-ink/25"
      >
        {open ? null : <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />}
        {actionLabel}
      </button>
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="px-6 py-10 text-[length:var(--type-body)] text-ink-muted">{children}</p>;
}

function StatusLabel({ status, tone }: { status: string; tone: Record<string, string> }) {
  return (
    <span className={`text-[length:var(--type-small)] font-semibold ${tone[status] ?? 'text-ink-muted'}`}>
      {status.replace('_', ' ').toLowerCase()}
    </span>
  );
}

function DeleteButton({
  id,
  label,
  busy,
  onClick,
}: {
  id: string;
  label: string;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      id={id}
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={label}
      title={label}
      className="inline-flex min-h-tap items-center gap-1.5 rounded-md border border-line-strong px-3 text-[length:var(--type-small)] font-medium text-state-error transition-colors duration-fast ease-out hover:border-state-error disabled:cursor-not-allowed disabled:opacity-60"
    >
      <Trash2 className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
      Delete
    </button>
  );
}

function ConfirmPanel({
  name,
  value,
  onChange,
  busy,
  mismatch,
  warning,
  onConfirm,
  onCancel,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  busy: boolean;
  mismatch: boolean;
  warning: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col items-end gap-2">
      <label htmlFor="delete-confirm-input" className="text-[length:var(--type-small)] font-semibold text-ink">
        Type <span className="font-mono">{name}</span> to delete
      </label>
      <p className="max-w-[22rem] text-right text-[length:var(--type-small)] text-state-error">{warning}</p>
      <input
        id="delete-confirm-input"
        name="delete-confirm"
        value={value}
        disabled={busy}
        autoComplete="off"
        spellCheck={false}
        aria-describedby="delete-confirm-hint"
        onChange={(event) => onChange(event.target.value)}
        className={`min-h-[44px] w-[16rem] rounded-md border bg-paper-raised px-3 text-[length:var(--type-small)] text-ink disabled:opacity-60 ${
          mismatch ? 'border-state-error' : 'border-line-strong'
        }`}
      />
      <p id="delete-confirm-hint" className="sr-only">
        The name must match exactly. Press Delete to confirm, or Cancel to leave it alone.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="inline-flex min-h-tap items-center rounded-pill border border-line-strong px-4 text-[length:var(--type-small)] font-medium text-ink-muted hover:border-ink/25 hover:text-ink disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy || mismatch}
          className="inline-flex min-h-tap items-center rounded-pill bg-state-error px-4 text-[length:var(--type-small)] font-semibold text-paper-raised disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ add forms */

function AddBrandForm({
  onSaved,
  onCancel,
  onError,
}: {
  onSaved: (name: string) => Promise<void>;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const [values, setValues] = useState({
    name: '',
    website: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    status: 'ACTIVE',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof values) => (value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = adminBrandSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrorsFrom(parsed.error));
      return;
    }

    setErrors({});
    setBusy(true);

    try {
      const response = await fetch('/api/admin/brands', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      const body = (await response.json().catch(() => ({}))) as ErrorBody;

      if (!response.ok) {
        if (body.fields) setErrors(body.fields);
        else onError(body.error ?? 'Could not save this brand.');
        setBusy(false);
        return;
      }

      await onSaved(parsed.data.name);
    } catch {
      onError('We could not reach the server. Check your connection and try again.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="card mt-6 p-6 lg:p-7">
      <h3 className="type-display text-[length:var(--type-body)] font-semibold text-ink">Add a brand</h3>
      <p className="mt-2 text-[length:var(--type-small)] text-ink-muted">
        For a customer you already know. No account is created — the brand is reachable on its contact
        details.
      </p>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <Field id="brand-name" label="Brand name" error={errors.name}>
          {({ describedBy, invalid }) => (
            <TextInput id="brand-name" value={values.name} disabled={busy} required invalid={invalid} describedBy={describedBy} onChange={(e) => set('name')(e.target.value)} />
          )}
        </Field>

        <Field id="brand-website" label="Website" optional error={errors.website}>
          {({ describedBy, invalid }) => (
            <TextInput id="brand-website" value={values.website} disabled={busy} placeholder="example.com" invalid={invalid} describedBy={describedBy} onChange={(e) => set('website')(e.target.value)} />
          )}
        </Field>

        <Field id="brand-contactName" label="Contact name" error={errors.contactName}>
          {({ describedBy, invalid }) => (
            <TextInput id="brand-contactName" value={values.contactName} disabled={busy} required invalid={invalid} describedBy={describedBy} onChange={(e) => set('contactName')(e.target.value)} />
          )}
        </Field>

        <Field id="brand-contactEmail" label="Contact email" error={errors.contactEmail}>
          {({ describedBy, invalid }) => (
            <TextInput id="brand-contactEmail" type="email" value={values.contactEmail} disabled={busy} required invalid={invalid} describedBy={describedBy} onChange={(e) => set('contactEmail')(e.target.value)} />
          )}
        </Field>

        <Field id="brand-contactPhone" label="Contact phone" error={errors.contactPhone}>
          {({ describedBy, invalid }) => (
            <TextInput id="brand-contactPhone" type="tel" value={values.contactPhone} disabled={busy} required invalid={invalid} describedBy={describedBy} onChange={(e) => set('contactPhone')(e.target.value)} />
          )}
        </Field>

        <Field id="brand-status" label="Status" hint="A brand added here has already been reviewed, so it starts active.">
          {({ describedBy, invalid }) => (
            <Select id="brand-status" value={values.status} disabled={busy} invalid={invalid} describedBy={describedBy} onChange={(e) => set('status')(e.target.value)}>
              {BRAND_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status.replace('_', ' ').toLowerCase()}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <FormActions busy={busy} onCancel={onCancel} submitLabel="Add brand" />
    </form>
  );
}

function AddStoreForm({
  onSaved,
  onCancel,
  onError,
}: {
  onSaved: (name: string) => Promise<void>;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const [values, setValues] = useState({
    name: '',
    location: '',
    // Kept as a string in state so a half-typed "1" is not rejected as not-a-number mid-keystroke;
    // the schema accepts a numeric string and normalises it to a number before it reaches the API.
    screenCount: '1',
    website: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    status: 'ACTIVE',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof values) => (value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = adminStoreSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrorsFrom(parsed.error));
      return;
    }

    setErrors({});
    setBusy(true);

    try {
      const response = await fetch('/api/admin/stores', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      const body = (await response.json().catch(() => ({}))) as ErrorBody;

      if (!response.ok) {
        if (body.fields) setErrors(body.fields);
        else onError(body.error ?? 'Could not save this store.');
        setBusy(false);
        return;
      }

      await onSaved(parsed.data.name);
    } catch {
      onError('We could not reach the server. Check your connection and try again.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="card mt-6 p-6 lg:p-7">
      <h3 className="type-display text-[length:var(--type-body)] font-semibold text-ink">Add a store</h3>
      <p className="mt-2 text-[length:var(--type-small)] text-ink-muted">
        A venue that supplies screens. Location and screen count are what the network is measured in.
      </p>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <Field id="store-name" label="Store name" error={errors.name}>
          {({ describedBy, invalid }) => (
            <TextInput id="store-name" value={values.name} disabled={busy} required invalid={invalid} describedBy={describedBy} onChange={(e) => set('name')(e.target.value)} />
          )}
        </Field>

        <Field
          id="store-location"
          label="Location"
          hint="As a visitor would describe it — “third floor, by the escalators” is more useful than a postcode here."
          error={errors.location}
        >
          {({ describedBy, invalid }) => (
            <TextInput id="store-location" value={values.location} disabled={busy} required invalid={invalid} describedBy={describedBy} onChange={(e) => set('location')(e.target.value)} />
          )}
        </Field>

        <Field id="store-screenCount" label="Number of screens" error={errors.screenCount}>
          {({ describedBy, invalid }) => (
            <TextInput
              id="store-screenCount"
              type="number"
              inputMode="numeric"
              min={0}
              max={100000}
              step={1}
              value={values.screenCount}
              disabled={busy}
              required
              invalid={invalid}
              describedBy={describedBy}
              onChange={(e) => set('screenCount')(e.target.value)}
            />
          )}
        </Field>

        <Field id="store-website" label="Website" optional error={errors.website}>
          {({ describedBy, invalid }) => (
            <TextInput id="store-website" value={values.website} disabled={busy} placeholder="example.com" invalid={invalid} describedBy={describedBy} onChange={(e) => set('website')(e.target.value)} />
          )}
        </Field>

        <Field id="store-contactName" label="Contact name" optional error={errors.contactName}>
          {({ describedBy, invalid }) => (
            <TextInput id="store-contactName" value={values.contactName} disabled={busy} invalid={invalid} describedBy={describedBy} onChange={(e) => set('contactName')(e.target.value)} />
          )}
        </Field>

        <Field id="store-contactEmail" label="Contact email" error={errors.contactEmail}>
          {({ describedBy, invalid }) => (
            <TextInput id="store-contactEmail" type="email" value={values.contactEmail} disabled={busy} required invalid={invalid} describedBy={describedBy} onChange={(e) => set('contactEmail')(e.target.value)} />
          )}
        </Field>

        <Field id="store-contactPhone" label="Contact phone" optional error={errors.contactPhone}>
          {({ describedBy, invalid }) => (
            <TextInput id="store-contactPhone" type="tel" value={values.contactPhone} disabled={busy} invalid={invalid} describedBy={describedBy} onChange={(e) => set('contactPhone')(e.target.value)} />
          )}
        </Field>

        <Field id="store-status" label="Status">
          {({ describedBy, invalid }) => (
            <Select id="store-status" value={values.status} disabled={busy} invalid={invalid} describedBy={describedBy} onChange={(e) => set('status')(e.target.value)}>
              {STORE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status.replace('_', ' ').toLowerCase()}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <FormActions busy={busy} onCancel={onCancel} submitLabel="Add store" />
    </form>
  );
}

function FormActions({
  busy,
  onCancel,
  submitLabel,
}: {
  busy: boolean;
  onCancel: () => void;
  submitLabel: string;
}) {
  return (
    <div className="mt-8 flex flex-wrap gap-3">
      <button
        type="submit"
        disabled={busy}
        className="inline-flex min-h-[48px] items-center justify-center rounded-pill bg-ink px-7 text-[length:var(--type-body)] font-semibold text-paper-raised transition-colors duration-fast ease-out hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? 'Saving…' : submitLabel}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="inline-flex min-h-[48px] items-center justify-center rounded-pill border border-line-strong px-7 text-[length:var(--type-body)] font-medium text-ink-muted transition-colors duration-fast ease-out hover:border-ink/25 hover:text-ink disabled:opacity-60"
      >
        Cancel
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ table cells */

function Th({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={`px-4 py-3 text-[length:var(--type-small)] font-semibold uppercase tracking-wide text-ink-muted first:pl-6 last:pr-6 ${className}`}
    >
      {children}
    </th>
  );
}

function Td({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <td className={`px-4 py-4 align-middle text-[length:var(--type-small)] first:pl-6 last:pr-6 ${className}`}>
      {children}
    </td>
  );
}
