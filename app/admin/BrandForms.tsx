'use client';

import { useState, type FormEvent } from 'react';
import { Field, Select, TextInput } from '@/components/ui/Field';
import type { BrandListEntry, BrandStatus } from '@/lib/db/types';

interface ErrorBody {
  error: string;
}

/* ------------------------------------------------------------------ Deactivate Brand Form */

export function DeactivateBrandForm({
  brands,
  onDeactivated,
  onCancel,
  onError,
}: {
  brands: BrandListEntry[];
  onDeactivated: (name: string, status: string) => Promise<void>;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const [selectedId, setSelectedId] = useState(brands[0]?.id ?? '');
  const [targetStatus, setTargetStatus] = useState<BrandStatus>('SUSPENDED');
  const [busy, setBusy] = useState(false);

  const selectedBrand = brands.find((b) => b.id === selectedId);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedBrand) return;

    setBusy(true);

    try {
      const res = await fetch('/api/admin/brands/deactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId: selectedBrand.id, status: targetStatus }),
      });

      const body = (await res.json().catch(() => ({}))) as ErrorBody & { success?: boolean };

      if (!res.ok || !body.success) {
        throw new Error(body.error || 'Failed to update brand status.');
      }

      await onDeactivated(selectedBrand.name, targetStatus);
    } catch (err: any) {
      onError(err.message || 'Error updating brand status.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card mt-6 p-6 lg:p-7 border border-line">
      <div className="flex items-center justify-between border-b border-line pb-4">
        <div>
          <h3 className="type-display text-base font-semibold text-ink">Deactivate / Change Brand Status</h3>
          <p className="mt-1 text-xs text-ink-muted">
            Deactivating marks a brand as suspended, preventing new campaign booking and holding active flights.
          </p>
        </div>
        <span className="rounded-pill bg-state-run/15 text-state-run px-3 py-1 text-xs font-semibold">
          Brand Lifecycle
        </span>
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <Field id="deactivate-brand-select" label="Select Brand">
          {({ describedBy, invalid }) => (
            <Select
              id="deactivate-brand-select"
              value={selectedId}
              disabled={busy}
              describedBy={describedBy}
              invalid={invalid}
              onChange={(e) => {
                const id = e.target.value;
                setSelectedId(id);
                const b = brands.find((br) => br.id === id);
                if (b?.status === 'SUSPENDED') {
                  setTargetStatus('ACTIVE');
                } else {
                  setTargetStatus('SUSPENDED');
                }
              }}
            >
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.contactEmail}) — Status: {b.status}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field id="deactivate-brand-status" label="New Status">
          {({ describedBy, invalid }) => (
            <Select
              id="deactivate-brand-status"
              value={targetStatus}
              disabled={busy}
              describedBy={describedBy}
              invalid={invalid}
              onChange={(e) => setTargetStatus(e.target.value as BrandStatus)}
            >
              <option value="SUSPENDED">SUSPENDED — Suspend brand and halt ad campaigns</option>
              <option value="PENDING_REVIEW">PENDING_REVIEW — Place under administrative review</option>
              <option value="ACTIVE">ACTIVE — Restore brand to active trading</option>
            </Select>
          )}
        </Field>
      </div>

      {selectedBrand && (
        <div className="mt-6 rounded-lg bg-paper p-4 border border-line text-xs space-y-1">
          <p className="font-semibold text-ink">
            Current Status: <span className="uppercase">{selectedBrand.status}</span> · Campaigns:{' '}
            {selectedBrand.campaignCount} active/recorded
          </p>
          <p className="text-ink-muted">
            {targetStatus === 'SUSPENDED'
              ? 'Suspending this brand flags the account and halts commercial campaign activations.'
              : 'Reactivating this brand marks it in good standing for campaign flights.'}
          </p>
        </div>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={busy || !selectedBrand}
          className={`inline-flex min-h-[44px] items-center justify-center rounded-pill px-7 text-sm font-semibold text-paper-raised disabled:opacity-60 ${
            targetStatus === 'ACTIVE' ? 'bg-state-ok hover:bg-state-ok/90' : 'bg-state-run hover:bg-state-run/90'
          }`}
        >
          {busy
            ? 'Updating…'
            : targetStatus === 'ACTIVE'
            ? 'Reactivate Brand'
            : 'Deactivate Brand'}
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

/* ------------------------------------------------------------------ Delete Brand Form */

export function DeleteBrandForm({
  brands,
  onDeleted,
  onCancel,
  onError,
}: {
  brands: BrandListEntry[];
  onDeleted: (name: string, campaignsDeleted: number) => Promise<void>;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const [selectedId, setSelectedId] = useState(brands[0]?.id ?? '');
  const [confirmName, setConfirmName] = useState('');
  const [busy, setBusy] = useState(false);

  const selectedBrand = brands.find((b) => b.id === selectedId);
  const mismatch = selectedBrand !== undefined && confirmName !== selectedBrand.name;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedBrand) return;

    if (confirmName !== selectedBrand.name) {
      onError('Please type the brand name exactly to confirm deletion.');
      return;
    }

    setBusy(true);

    try {
      const params = new URLSearchParams({
        confirm: selectedBrand.name,
        campaignCount: String(selectedBrand.campaignCount),
      });

      const res = await fetch(`/api/admin/brands/${selectedBrand.id}?${params}`, {
        method: 'DELETE',
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to delete brand.');

      await onDeleted(selectedBrand.name, body.campaignsDeleted ?? selectedBrand.campaignCount);
    } catch (err: any) {
      onError(err.message || 'Error deleting brand.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card mt-6 p-6 lg:p-7 border border-state-error/30 bg-paper">
      <div className="flex items-center justify-between border-b border-line pb-4">
        <div>
          <h3 className="type-display text-base font-semibold text-state-error">Delete Brand</h3>
          <p className="mt-1 text-xs text-ink-muted">
            Permanently removes the brand customer record, all associated campaigns, and uploaded video creative.
          </p>
        </div>
        <span className="rounded-pill bg-state-error/15 text-state-error px-3 py-1 text-xs font-semibold">
          Cascade Deletion
        </span>
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <Field id="delete-brand-select" label="Select Brand to Delete">
          {({ describedBy, invalid }) => (
            <Select
              id="delete-brand-select"
              value={selectedId}
              disabled={busy}
              describedBy={describedBy}
              invalid={invalid}
              onChange={(e) => {
                setSelectedId(e.target.value);
                setConfirmName('');
              }}
            >
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.contactEmail}) — {b.campaignCount} campaigns
                </option>
              ))}
            </Select>
          )}
        </Field>

        {selectedBrand && (
          <Field
            id="delete-brand-confirm"
            label={`Type "${selectedBrand.name}" to confirm`}
          >
            {({ describedBy, invalid }) => (
              <TextInput
                id="delete-brand-confirm"
                value={confirmName}
                disabled={busy}
                placeholder={selectedBrand.name}
                autoComplete="off"
                describedBy={describedBy}
                invalid={invalid}
                onChange={(e) => setConfirmName(e.target.value)}
              />
            )}
          </Field>
        )}
      </div>

      {selectedBrand && (
        <div className="mt-4 rounded-lg bg-state-error/5 p-4 border border-state-error/20 text-xs text-state-error">
          Warning: Deleting '{selectedBrand.name}' is irreversible. It permanently deletes{' '}
          {selectedBrand.campaignCount} campaign{selectedBrand.campaignCount === 1 ? '' : 's'} and all associated
          video records from the database.
        </div>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={busy || !selectedBrand || mismatch}
          className="inline-flex min-h-[44px] items-center justify-center rounded-pill bg-state-error px-7 text-sm font-semibold text-paper-raised hover:bg-state-error/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Deleting…' : 'Delete Brand and Campaigns'}
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
