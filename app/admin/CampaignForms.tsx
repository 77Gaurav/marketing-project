'use client';

import { useState, type FormEvent } from 'react';
import { Field, Select, TextInput } from '@/components/ui/Field';
import type { AdminCampaignListItem } from '@/device_backend';
import type { BrandListEntry, StoreListEntry } from '@/lib/db/types';

interface ErrorBody {
  error: string;
  fields?: Record<string, string>;
}

/* ------------------------------------------------------------------ Add Campaign Form */

export function AddCampaignForm({
  brands,
  stores,
  onSaved,
  onCancel,
  onError,
}: {
  brands: BrandListEntry[];
  stores: StoreListEntry[];
  onSaved: (name: string) => Promise<void>;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const [brandId, setBrandId] = useState(brands[0]?.id ?? '');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('LIVE');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [selectedStores, setSelectedStores] = useState<string[]>([]);
  const [playsPerHour, setPlaysPerHour] = useState(10);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function toggleStore(id: string) {
    setSelectedStores((curr) =>
      curr.includes(id) ? curr.filter((s) => s !== id) : [...curr, id],
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!brandId) {
      setErrors({ brandId: 'Please select a brand.' });
      return;
    }
    if (!name.trim()) {
      setErrors({ name: 'Campaign name is required.' });
      return;
    }

    setErrors({});
    setBusy(true);

    try {
      const res = await fetch('/api/admin/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId,
          name: name.trim(),
          description: description.trim() || undefined,
          status,
          startsOn: startsOn || undefined,
          endsOn: endsOn || undefined,
          storeIds: selectedStores,
          playsPerHour,
        }),
      });

      const body = (await res.json().catch(() => ({}))) as ErrorBody & { success?: boolean };

      if (!res.ok) {
        if (body.fields) setErrors(body.fields);
        else onError(body.error ?? 'Could not create campaign.');
        setBusy(false);
        return;
      }

      await onSaved(name.trim());
    } catch {
      onError('We could not reach the server. Check your connection and try again.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="card mt-6 p-6 lg:p-7 border border-line">
      <div className="flex items-center justify-between border-b border-line pb-4">
        <div>
          <h3 className="type-display text-base font-semibold text-ink">Add a campaign</h3>
          <p className="mt-1 text-xs text-ink-muted">
            Launch or schedule a marketing flight for an existing brand, with optional venue display allocation.
          </p>
        </div>
        <span className="rounded-pill bg-state-ok/10 text-state-ok px-3 py-1 text-xs font-semibold">
          New Campaign
        </span>
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <Field id="campaign-brand" label="Brand" error={errors.brandId}>
          {({ describedBy, invalid }) => (
            <Select
              id="campaign-brand"
              value={brandId}
              disabled={busy}
              invalid={invalid}
              describedBy={describedBy}
              onChange={(e) => setBrandId(e.target.value)}
            >
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.contactEmail})
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field id="campaign-name" label="Campaign name" error={errors.name}>
          {({ describedBy, invalid }) => (
            <TextInput
              id="campaign-name"
              value={name}
              disabled={busy}
              required
              placeholder="e.g. Summer Sunglasses Drop"
              invalid={invalid}
              describedBy={describedBy}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>

        <Field id="campaign-description" label="Description" optional error={errors.description}>
          {({ describedBy, invalid }) => (
            <TextInput
              id="campaign-description"
              value={description}
              disabled={busy}
              placeholder="15s spot targeted at fitness and café displays"
              invalid={invalid}
              describedBy={describedBy}
              onChange={(e) => setDescription(e.target.value)}
            />
          )}
        </Field>

        <Field id="campaign-status" label="Initial Status">
          {({ describedBy, invalid }) => (
            <Select
              id="campaign-status"
              value={status}
              disabled={busy}
              invalid={invalid}
              describedBy={describedBy}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="LIVE">Live (active immediately)</option>
              <option value="DRAFT">Draft</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="PAUSED">Paused</option>
            </Select>
          )}
        </Field>

        <Field id="campaign-startsOn" label="Flight Start Date" optional>
          {({ describedBy, invalid }) => (
            <TextInput
              id="campaign-startsOn"
              type="date"
              value={startsOn}
              disabled={busy}
              invalid={invalid}
              describedBy={describedBy}
              onChange={(e) => setStartsOn(e.target.value)}
            />
          )}
        </Field>

        <Field id="campaign-endsOn" label="Flight End Date" optional>
          {({ describedBy, invalid }) => (
            <TextInput
              id="campaign-endsOn"
              type="date"
              value={endsOn}
              disabled={busy}
              invalid={invalid}
              describedBy={describedBy}
              onChange={(e) => setEndsOn(e.target.value)}
            />
          )}
        </Field>
      </div>

      {stores.length > 0 && (
        <div className="mt-6 border-t border-line pt-5">
          <label className="text-xs font-semibold text-ink uppercase tracking-wider block mb-2">
            Target Stores / Venue Displays (Optional allocation)
          </label>
          <div className="grid gap-2 sm:grid-cols-3 max-h-48 overflow-y-auto p-1">
            {stores.map((s) => (
              <label
                key={s.id}
                className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                  selectedStores.includes(s.id)
                    ? 'border-ink bg-ink/5 font-medium text-ink'
                    : 'border-line hover:border-line-strong text-ink-muted'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedStores.includes(s.id)}
                  onChange={() => toggleStore(s.id)}
                  className="rounded border-line"
                />
                <span className="truncate">
                  {s.name} ({s.screenCount} screens)
                </span>
              </label>
            ))}
          </div>

          {selectedStores.length > 0 && (
            <div className="mt-4 flex items-center gap-3">
              <span className="text-xs text-ink-muted">Plays per hour per store:</span>
              <input
                type="number"
                min={1}
                max={60}
                value={playsPerHour}
                onChange={(e) => setPlaysPerHour(Number(e.target.value))}
                className="w-20 rounded border border-line px-2 py-1 text-xs text-ink font-semibold"
              />
            </div>
          )}
        </div>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-[44px] items-center justify-center rounded-pill bg-ink px-7 text-sm font-semibold text-paper-raised hover:bg-ink/90 disabled:opacity-60"
        >
          {busy ? 'Creating…' : 'Create Campaign'}
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

/* ------------------------------------------------------------------ Deactivate Campaign Form */

export function DeactivateCampaignForm({
  campaigns,
  onDeactivated,
  onCancel,
  onError,
}: {
  campaigns: AdminCampaignListItem[];
  onDeactivated: (name: string, status: string) => Promise<void>;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const [selectedId, setSelectedId] = useState(campaigns[0]?.id ?? '');
  const [targetStatus, setTargetStatus] = useState<'PAUSED' | 'LIVE'>('PAUSED');
  const [busy, setBusy] = useState(false);

  const selectedCampaign = campaigns.find((c) => c.id === selectedId);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedCampaign) return;

    setBusy(true);

    try {
      if (targetStatus === 'PAUSED') {
        const res = await fetch('/api/admin/campaigns/deactivate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ campaignId: selectedCampaign.id }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Failed to deactivate campaign.');
      } else {
        const res = await fetch('/api/admin/campaigns', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ campaignId: selectedCampaign.id, status: 'LIVE' }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Failed to reactivate campaign.');
      }

      await onDeactivated(selectedCampaign.name, targetStatus);
    } catch (err: any) {
      onError(err.message || 'Error updating campaign status.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card mt-6 p-6 lg:p-7 border border-line">
      <div className="flex items-center justify-between border-b border-line pb-4">
        <div>
          <h3 className="type-display text-base font-semibold text-ink">Deactivate / Pause Campaign</h3>
          <p className="mt-1 text-xs text-ink-muted">
            Pause campaign playback across all assigned stores. Connected hardware players retain the video locally.
          </p>
        </div>
        <span className="rounded-pill bg-state-run/15 text-state-run px-3 py-1 text-xs font-semibold">
          Lifecycle Action
        </span>
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <Field id="deactivate-campaign-select" label="Select Campaign">
          {({ describedBy, invalid }) => (
            <Select
              id="deactivate-campaign-select"
              value={selectedId}
              disabled={busy}
              describedBy={describedBy}
              invalid={invalid}
              onChange={(e) => {
                const id = e.target.value;
                setSelectedId(id);
                const camp = campaigns.find((c) => c.id === id);
                if (camp?.status === 'PAUSED') {
                  setTargetStatus('LIVE');
                } else {
                  setTargetStatus('PAUSED');
                }
              }}
            >
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.brand.name}) — Status: {c.status}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field id="deactivate-campaign-action" label="Desired Action">
          {({ describedBy, invalid }) => (
            <Select
              id="deactivate-campaign-action"
              value={targetStatus}
              disabled={busy}
              describedBy={describedBy}
              invalid={invalid}
              onChange={(e) => setTargetStatus(e.target.value as 'PAUSED' | 'LIVE')}
            >
              <option value="PAUSED">Deactivate / Pause (Hold playback)</option>
              <option value="LIVE">Reactivate / Resume (Start playback)</option>
            </Select>
          )}
        </Field>
      </div>

      {selectedCampaign && (
        <div className="mt-6 rounded-lg bg-paper p-4 border border-line text-xs space-y-1">
          <p className="font-semibold text-ink">
            Current Status: <span className="uppercase">{selectedCampaign.status}</span>
          </p>
          <p className="text-ink-muted">
            Assigned stores: {selectedCampaign.assignedStores.length} venue(s) · Creative:{' '}
            {selectedCampaign.video ? 'Uploaded' : 'No video attached'}
          </p>
          <p className="text-ink-muted">
            {targetStatus === 'PAUSED'
              ? 'Players in assigned stores will immediately pause ad rotation while keeping the video file cached.'
              : 'Players will schedule the campaign back into rotation.'}
          </p>
        </div>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={busy || !selectedCampaign}
          className={`inline-flex min-h-[44px] items-center justify-center rounded-pill px-7 text-sm font-semibold text-paper-raised disabled:opacity-60 ${
            targetStatus === 'PAUSED' ? 'bg-state-run hover:bg-state-run/90' : 'bg-state-ok hover:bg-state-ok/90'
          }`}
        >
          {busy
            ? 'Updating…'
            : targetStatus === 'PAUSED'
            ? 'Deactivate Campaign'
            : 'Reactivate Campaign'}
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

/* ------------------------------------------------------------------ Delete Campaign Form */

export function DeleteCampaignForm({
  campaigns,
  onDeleted,
  onCancel,
  onError,
}: {
  campaigns: AdminCampaignListItem[];
  onDeleted: (name: string) => Promise<void>;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const [selectedId, setSelectedId] = useState(campaigns[0]?.id ?? '');
  const [confirmName, setConfirmName] = useState('');
  const [busy, setBusy] = useState(false);

  const selectedCampaign = campaigns.find((c) => c.id === selectedId);
  const mismatch = selectedCampaign !== undefined && confirmName !== selectedCampaign.name;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedCampaign) return;

    if (confirmName !== selectedCampaign.name) {
      onError('Please type the exact campaign name to confirm deletion.');
      return;
    }

    setBusy(true);

    try {
      const res = await fetch(`/api/admin/campaigns?id=${encodeURIComponent(selectedCampaign.id)}`, {
        method: 'DELETE',
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to delete campaign.');

      await onDeleted(selectedCampaign.name);
    } catch (err: any) {
      onError(err.message || 'Error deleting campaign.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card mt-6 p-6 lg:p-7 border border-state-error/30 bg-paper">
      <div className="flex items-center justify-between border-b border-line pb-4">
        <div>
          <h3 className="type-display text-base font-semibold text-state-error">Delete Campaign</h3>
          <p className="mt-1 text-xs text-ink-muted">
            Permanently deletes the campaign record and triggers a purge event across all assigned displays.
          </p>
        </div>
        <span className="rounded-pill bg-state-error/15 text-state-error px-3 py-1 text-xs font-semibold">
          Destructive Action
        </span>
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <Field id="delete-campaign-select" label="Select Campaign to Delete">
          {({ describedBy, invalid }) => (
            <Select
              id="delete-campaign-select"
              value={selectedId}
              disabled={busy}
              describedBy={describedBy}
              invalid={invalid}
              onChange={(e) => {
                setSelectedId(e.target.value);
                setConfirmName('');
              }}
            >
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.brand.name})
                </option>
              ))}
            </Select>
          )}
        </Field>

        {selectedCampaign && (
          <Field
            id="delete-campaign-confirm"
            label={`Type "${selectedCampaign.name}" to confirm`}
          >
            {({ describedBy, invalid }) => (
              <TextInput
                id="delete-campaign-confirm"
                value={confirmName}
                disabled={busy}
                placeholder={selectedCampaign.name}
                autoComplete="off"
                describedBy={describedBy}
                invalid={invalid}
                onChange={(e) => setConfirmName(e.target.value)}
              />
            )}
          </Field>
        )}
      </div>

      {selectedCampaign && (
        <div className="mt-4 rounded-lg bg-state-error/5 p-4 border border-state-error/20 text-xs text-state-error">
          Warning: This permanently removes '{selectedCampaign.name}'. Connected player hardware will purge
          the stored video creative locally.
        </div>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={busy || !selectedCampaign || mismatch}
          className="inline-flex min-h-[44px] items-center justify-center rounded-pill bg-state-error px-7 text-sm font-semibold text-paper-raised hover:bg-state-error/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Deleting…' : 'Delete Campaign Permanently'}
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
