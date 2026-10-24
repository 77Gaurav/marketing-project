'use client';

import { useState, type FormEvent } from 'react';
import { Field, Select, TextInput } from '@/components/ui/Field';
import type { StoreListEntry, StoreStatus } from '@/lib/db/types';

interface ErrorBody {
  error: string;
}

/* ------------------------------------------------------------------ Deactivate Store Form */

export function DeactivateStoreForm({
  stores,
  onDeactivated,
  onCancel,
  onError,
}: {
  stores: StoreListEntry[];
  onDeactivated: (name: string, status: string) => Promise<void>;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const [selectedId, setSelectedId] = useState(stores[0]?.id ?? '');
  const [targetStatus, setTargetStatus] = useState<StoreStatus>('DEACTIVATED');
  const [busy, setBusy] = useState(false);

  const selectedStore = stores.find((s) => s.id === selectedId);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedStore) return;

    setBusy(true);

    try {
      const res = await fetch('/api/admin/stores/deactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: selectedStore.id, status: targetStatus }),
      });

      const body = (await res.json().catch(() => ({}))) as ErrorBody & { success?: boolean };

      if (!res.ok || !body.success) {
        throw new Error(body.error || 'Failed to update store status.');
      }

      await onDeactivated(selectedStore.name, targetStatus);
    } catch (err: any) {
      onError(err.message || 'Error updating store status.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card mt-6 p-6 lg:p-7 border border-line">
      <div className="flex items-center justify-between border-b border-line pb-4">
        <div>
          <h3 className="type-display text-base font-semibold text-ink">Deactivate / Change Store Status</h3>
          <p className="mt-1 text-xs text-ink-muted">
            Deactivating takes a venue offline and removes any running or pending device activations.
          </p>
        </div>
        <span className="rounded-pill bg-state-run/15 text-state-run px-3 py-1 text-xs font-semibold">
          Venue Lifecycle
        </span>
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <Field id="deactivate-store-select" label="Select Store">
          {({ describedBy, invalid }) => (
            <Select
              id="deactivate-store-select"
              value={selectedId}
              disabled={busy}
              describedBy={describedBy}
              invalid={invalid}
              onChange={(e) => {
                const id = e.target.value;
                setSelectedId(id);
                const s = stores.find((st) => st.id === id);
                if (s?.status === 'DEACTIVATED' || s?.status === 'PAUSED' || s?.status === 'CLOSED') {
                  setTargetStatus('ACTIVE');
                } else {
                  setTargetStatus('DEACTIVATED');
                }
              }}
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.location}) — Status:{' '}
                  {s.status === 'ACTIVE'
                    ? 'Active'
                    : s.status === 'PENDING' || s.status === 'PENDING_REVIEW'
                    ? 'Pending'
                    : 'Deactivated'}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <div className="space-y-1.5">
          <label htmlFor="deactivate-store-status" className="block text-sm font-semibold text-ink">
            New Status
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              {
                value: 'ACTIVE',
                label: 'Active',
                dot: 'bg-state-ok',
                activeClass: 'border-state-ok bg-state-ok/10 text-state-ok font-bold shadow-xs',
                defaultClass: 'border-line-strong bg-paper text-ink hover:border-ink/40',
              },
              {
                value: 'PENDING',
                label: 'Pending',
                dot: 'bg-state-run',
                activeClass: 'border-state-run bg-state-run/10 text-state-run font-bold shadow-xs',
                defaultClass: 'border-line-strong bg-paper text-ink hover:border-ink/40',
              },
              {
                value: 'DEACTIVATED',
                label: 'Deactivated',
                dot: 'bg-state-error',
                activeClass: 'border-state-error bg-state-error/10 text-state-error font-bold shadow-xs',
                defaultClass: 'border-line-strong bg-paper text-ink hover:border-ink/40',
              },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                disabled={busy}
                onClick={() => setTargetStatus(option.value as StoreStatus)}
                className={`flex min-h-[46px] items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs transition-all ${
                  targetStatus === option.value ? option.activeClass : option.defaultClass
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${option.dot}`} />
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {selectedStore && (
        <div className="mt-6 rounded-lg bg-paper p-4 border border-line text-xs space-y-1">
          <p className="font-semibold text-ink">
            Current Status: <span className="uppercase">{selectedStore.status}</span> · Screen count:{' '}
            {selectedStore.screenCount} screens
          </p>
          <p className="text-ink-muted">
            {targetStatus !== 'ACTIVE'
              ? 'Warning: Deactivating this store will immediately delete any pending player hardware activations.'
              : 'Reactivating this store returns its display inventory to the available advertising pool.'}
          </p>
        </div>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={busy || !selectedStore}
          className={`inline-flex min-h-[44px] items-center justify-center rounded-pill px-7 text-sm font-semibold text-paper-raised disabled:opacity-60 ${
            targetStatus === 'ACTIVE' ? 'bg-state-ok hover:bg-state-ok/90' : 'bg-state-run hover:bg-state-run/90'
          }`}
        >
          {busy
            ? 'Updating…'
            : targetStatus === 'ACTIVE'
            ? 'Reactivate Store'
            : 'Deactivate Store'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="inline-flex min-h-[44px] items-center justify-center rounded-pill border border-line-strong px-7 text-sm font-medium text-ink-muted hover:text-ink disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ Delete Store Form */

export function DeleteStoreForm({
  stores,
  onDeleted,
  onCancel,
  onError,
}: {
  stores: StoreListEntry[];
  onDeleted: (name: string, screensRemoved: number) => Promise<void>;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const [selectedId, setSelectedId] = useState(stores[0]?.id ?? '');
  const [confirmName, setConfirmName] = useState('');
  const [busy, setBusy] = useState(false);

  const selectedStore = stores.find((s) => s.id === selectedId);
  const mismatch = selectedStore !== undefined && confirmName !== selectedStore.name;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedStore) return;

    if (confirmName !== selectedStore.name) {
      onError('Please type the store name exactly to confirm deletion.');
      return;
    }

    setBusy(true);

    try {
      const params = new URLSearchParams({ confirm: selectedStore.name });
      const res = await fetch(`/api/admin/stores/${selectedStore.id}?${params}`, {
        method: 'DELETE',
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to delete store.');

      await onDeleted(selectedStore.name, body.screensRemoved ?? selectedStore.screenCount);
    } catch (err: any) {
      onError(err.message || 'Error deleting store.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card mt-6 p-6 lg:p-7 border border-state-error/30 bg-paper">
      <div className="flex items-center justify-between border-b border-line pb-4">
        <div>
          <h3 className="type-display text-base font-semibold text-state-error">Delete Store</h3>
          <p className="mt-1 text-xs text-ink-muted">
            Permanently removes the store record and associated screen inventory from the platform.
          </p>
        </div>
        <span className="rounded-pill bg-state-error/15 text-state-error px-3 py-1 text-xs font-semibold">
          Destructive Action
        </span>
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <Field id="delete-store-select" label="Select Store to Delete">
          {({ describedBy, invalid }) => (
            <Select
              id="delete-store-select"
              value={selectedId}
              disabled={busy}
              describedBy={describedBy}
              invalid={invalid}
              onChange={(e) => {
                setSelectedId(e.target.value);
                setConfirmName('');
              }}
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.location}) — {s.screenCount} screens
                </option>
              ))}
            </Select>
          )}
        </Field>

        {selectedStore && (
          <Field
            id="delete-store-confirm"
            label={`Type "${selectedStore.name}" to confirm`}
          >
            {({ describedBy, invalid }) => (
              <TextInput
                id="delete-store-confirm"
                value={confirmName}
                disabled={busy}
                placeholder={selectedStore.name}
                autoComplete="off"
                describedBy={describedBy}
                invalid={invalid}
                onChange={(e) => setConfirmName(e.target.value)}
              />
            )}
          </Field>
        )}
      </div>

      {selectedStore && (
        <div className="mt-4 rounded-lg bg-state-error/5 p-4 border border-state-error/20 text-xs text-state-error">
          Warning: Deleting '{selectedStore.name}' permanently removes {selectedStore.screenCount} screen
          {selectedStore.screenCount === 1 ? '' : 's'} from the String Theory network inventory.
        </div>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={busy || !selectedStore || mismatch}
          className="inline-flex min-h-[44px] items-center justify-center rounded-pill bg-state-error px-7 text-sm font-semibold text-paper-raised hover:bg-state-error/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Deleting…' : 'Delete Store Permanently'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="inline-flex min-h-[44px] items-center justify-center rounded-pill border border-line-strong px-7 text-sm font-medium text-ink-muted hover:text-ink disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
