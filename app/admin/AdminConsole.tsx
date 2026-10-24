'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  Database,
  Plus,
  Radio,
  Trash2,
  Tv,
  PowerOff,
  Store as StoreIcon,
  Layers,
  ArrowRight,
  ExternalLink,
  RotateCcw,
  CheckCircle,
} from 'lucide-react';
import { Field, Select, TextInput } from '@/components/ui/Field';
import { BRAND_STATUSES, STORE_STATUSES, type BrandListEntry, type StoreListEntry, type BrandStatus, type StoreStatus } from '@/lib/db/types';
import { adminBrandSchema, adminStoreSchema, fieldErrorsFrom } from '@/lib/validation/admin';
import AddStoreForm from '@/components/store/AddStoreForm';
import { AddCampaignForm, DeactivateCampaignForm, DeleteCampaignForm } from './CampaignForms';
import { DeactivateStoreForm, DeleteStoreForm } from './StoreForms';
import { DeactivateBrandForm, DeleteBrandForm } from './BrandForms';
import type { AdminCampaignListItem } from '@/device_backend';
import type { TableSummary } from '@/lib/db/repositories/database-explorer';

interface AdminIdentity {
  fullName: string;
  email: string;
}

interface Props {
  admin: AdminIdentity;
  initialBrands: BrandListEntry[];
  initialStores: StoreListEntry[];
  initialCampaigns?: AdminCampaignListItem[];
  initialTables?: TableSummary[];
  weakPasswordWarning: boolean;
}

interface ErrorBody {
  error: string;
  fields?: Record<string, string>;
}

interface PendingDelete {
  kind: 'brand' | 'store' | 'campaign';
  id: string;
  name: string;
  campaignCount?: number;
}

type PanelName =
  | 'add-store'
  | 'deactivate-store'
  | 'delete-store'
  | 'add-campaign'
  | 'deactivate-campaign'
  | 'delete-campaign'
  | 'add-brand'
  | 'deactivate-brand'
  | 'delete-brand'
  | null;

type SectionTab = 'all' | 'stores' | 'campaigns' | 'brands';

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const NUMBER_FORMAT = new Intl.NumberFormat('en-GB');

function formatDate(iso: string): string {
  try {
    return DATE_FORMAT.format(new Date(iso));
  } catch {
    return iso;
  }
}

const BRAND_STATUS_TONE: Record<string, string> = {
  ACTIVE: 'text-state-ok bg-state-ok/10',
  PENDING_REVIEW: 'text-state-run bg-state-run/10',
  SUSPENDED: 'text-state-error bg-state-error/10',
};

const STORE_STATUS_TONE: Record<string, string> = {
  ACTIVE: 'text-state-ok bg-state-ok/10',
  PENDING: 'text-state-run bg-state-run/10',
  PENDING_REVIEW: 'text-state-run bg-state-run/10',
  DEACTIVATED: 'text-state-error bg-state-error/10',
  PAUSED: 'text-state-error bg-state-error/10',
  CLOSED: 'text-state-error bg-state-error/10',
};

const CAMPAIGN_STATUS_TONE: Record<string, string> = {
  LIVE: 'text-state-ok bg-state-ok/10',
  ACTIVE: 'text-state-ok bg-state-ok/10',
  SCHEDULED: 'text-blue-700 bg-blue-50',
  DRAFT: 'text-ink-muted bg-paper',
  PAUSED: 'text-state-run bg-state-run/10',
  COMPLETED: 'text-emerald-700 bg-emerald-50',
  CANCELLED: 'text-state-error bg-state-error/10',
};

export default function AdminConsole({
  admin,
  initialBrands,
  initialStores,
  initialCampaigns = [],
  initialTables,
  weakPasswordWarning,
}: Props) {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<SectionTab>('all');
  const [brands, setBrands] = useState<BrandListEntry[]>(initialBrands);
  const [stores, setStores] = useState<StoreListEntry[]>(initialStores);
  const [campaigns, setCampaigns] = useState<AdminCampaignListItem[]>(initialCampaigns);
  const [panel, setPanel] = useState<PanelName>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [confirmValue, setConfirmValue] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

  async function refreshCampaigns() {
    const response = await fetch('/api/admin/campaigns');
    if (!response.ok) throw new Error('refresh-campaigns');
    const body = (await response.json()) as { campaigns: AdminCampaignListItem[] };
    setCampaigns(body.campaigns);
  }

  async function handleSignOut() {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.refresh();
  }

  // Row inline deactivation handler for Brands
  async function handleToggleBrandStatus(brand: BrandListEntry) {
    const nextStatus: BrandStatus = brand.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    setBusyId(brand.id);
    setError(null);
    try {
      const res = await fetch('/api/admin/brands/deactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId: brand.id, status: nextStatus }),
      });
      if (!res.ok) throw new Error('Failed to update brand status');
      await refreshBrands();
      setNotice(nextStatus === 'SUSPENDED' ? `Deactivated ${brand.name}.` : `Reactivated ${brand.name}.`);
    } catch {
      setError(`Could not change status for ${brand.name}.`);
    } finally {
      setBusyId(null);
    }
  }

  // Row inline deactivation handler for Stores
  async function handleToggleStoreStatus(store: StoreListEntry) {
    const nextStatus: StoreStatus = store.status === 'ACTIVE' ? 'DEACTIVATED' : 'ACTIVE';
    setBusyId(store.id);
    setError(null);
    try {
      const res = await fetch('/api/admin/stores/deactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: store.id, status: nextStatus }),
      });
      if (!res.ok) throw new Error('Failed to update store status');
      await refreshStores();
      setNotice(nextStatus === 'DEACTIVATED' ? `Deactivated ${store.name}.` : `Activated ${store.name}.`);
    } catch {
      setError(`Could not change status for ${store.name}.`);
    } finally {
      setBusyId(null);
    }
  }

  // Row inline deactivation handler for Campaigns
  async function handleToggleCampaignStatus(campaign: AdminCampaignListItem) {
    const isActive = campaign.status === 'LIVE' || campaign.status === 'ACTIVE';
    setBusyId(campaign.id);
    setError(null);
    try {
      if (isActive) {
        const res = await fetch('/api/admin/campaigns/deactivate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ campaignId: campaign.id }),
        });
        if (!res.ok) throw new Error('Failed to deactivate campaign');
        setNotice(`Deactivated campaign '${campaign.name}'.`);
      } else {
        const res = await fetch('/api/admin/campaigns', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ campaignId: campaign.id, status: 'LIVE' }),
        });
        if (!res.ok) throw new Error('Failed to reactivate campaign');
        setNotice(`Reactivated campaign '${campaign.name}'.`);
      }
      await refreshCampaigns();
    } catch {
      setError(`Could not update campaign status for '${campaign.name}'.`);
    } finally {
      setBusyId(null);
    }
  }

  // Delete row confirmation handlers
  async function requestDelete(target: PendingDelete) {
    setBusyId(target.id);
    setError(null);

    if (target.kind === 'campaign') {
      setPendingDelete(target);
      setConfirmValue('');
      setBusyId(null);
      return;
    }

    try {
      const endpoint = `/api/admin/${target.kind === 'brand' ? 'brands' : 'stores'}/${target.id}`;
      const response = await fetch(endpoint, { method: 'DELETE' });

      if (response.status === 404) {
        setError('That row is already gone. The list has been refreshed.');
        if (target.kind === 'brand') await refreshBrands();
        else await refreshStores();
        return;
      }

      if (response.status !== 409) {
        const body = (await response.json().catch(() => ({}))) as ErrorBody;
        setError(body.error ?? 'Could not delete that row.');
        return;
      }

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
    } catch {
      setError('We could not reach the server. Check your connection and try again.');
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const target = pendingDelete;

    if (confirmValue !== target.name) {
      setError('Type the name exactly as shown before deleting.');
      return;
    }

    setBusyId(target.id);
    setError(null);

    try {
      if (target.kind === 'campaign') {
        const res = await fetch(`/api/admin/campaigns?id=${encodeURIComponent(target.id)}`, {
          method: 'DELETE',
        });
        if (!res.ok) throw new Error('Failed to delete campaign');
        await refreshCampaigns();
        setNotice(`Deleted campaign ${target.name}.`);
      } else {
        const collection = target.kind === 'brand' ? 'brands' : 'stores';
        const params = new URLSearchParams({ confirm: target.name });
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
          if (target.kind === 'brand') await refreshBrands();
          else await refreshStores();
          return;
        }

        if (target.kind === 'brand') {
          await refreshBrands();
          setNotice(`Deleted ${target.name}.`);
        } else {
          await refreshStores();
          setNotice(`Deleted ${target.name} and ${body.screensRemoved ?? 0} screen(s).`);
        }
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
    <div className="space-y-8">
      {/* Console Top Header */}
      <div className="flex flex-wrap items-start justify-between gap-6 border-b border-line pb-6">
        <div>
          <h1 className="type-display text-[length:var(--type-h2)] font-bold text-ink">Network Admin Console</h1>
          <p className="type-lead mt-2 text-sm text-ink-muted">
            Signed in as <strong className="text-ink">{admin.fullName}</strong> · {admin.email}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/admin/dbms"
            className="inline-flex min-h-[42px] items-center gap-2 rounded-pill bg-ink px-5 text-sm font-semibold text-paper-raised shadow-sm hover:bg-ink/85 transition-colors"
          >
            <Database className="h-4 w-4" />
            DBMS
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-pill border border-line-strong px-5 text-sm font-medium text-ink-muted transition-colors hover:border-ink/25 hover:text-ink"
          >
            Sign out
          </button>
        </div>
      </div>

      {weakPasswordWarning && (
        <div
          role="status"
          className="rounded-md border border-state-run bg-paper px-5 py-4 text-xs text-state-run"
        >
          Running on development credentials. Configure <code className="font-semibold">ADMIN_PASSWORD</code> before production deployment.
        </div>
      )}

      {/* Global Notice / Error Banners */}
      {notice && (
        <div
          role="status"
          className="rounded-md border border-state-ok bg-paper px-5 py-4 text-sm text-state-ok flex items-center justify-between"
        >
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-state-ok hover:opacity-75 font-bold">
            ✕
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-md border border-state-error bg-paper px-5 py-4 text-sm text-state-error flex items-center justify-between"
        >
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-state-error hover:opacity-75 font-bold">
            ✕
          </button>
        </div>
      )}

      {/* Metrics Summary Tiles */}
      <dl className="grid gap-4 sm:grid-cols-4">
        <SummaryTile label="Stores" value={NUMBER_FORMAT.format(stores.length)} />
        <SummaryTile label="Campaigns" value={NUMBER_FORMAT.format(campaigns.length)} />
        <SummaryTile label="Brands" value={NUMBER_FORMAT.format(brands.length)} />
        <SummaryTile label="Screens in Network" value={NUMBER_FORMAT.format(totalScreens)} />
      </dl>

      {/* Navigation Sub-Tabs & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <TabButton
            active={activeTab === 'all'}
            onClick={() => setActiveTab('all')}
            label="All Overview"
          />
          <TabButton
            active={activeTab === 'stores'}
            onClick={() => setActiveTab('stores')}
            label="Stores"
            count={stores.length}
          />
          <TabButton
            active={activeTab === 'campaigns'}
            onClick={() => setActiveTab('campaigns')}
            label="Campaigns"
            count={campaigns.length}
          />
          <TabButton
            active={activeTab === 'brands'}
            onClick={() => setActiveTab('brands')}
            label="Brands"
            count={brands.length}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/store/activate"
            className="inline-flex min-h-[38px] items-center gap-2 rounded-pill border border-line px-4 text-xs font-semibold text-ink-muted hover:text-ink hover:border-ink transition-colors"
          >
            <Radio className="h-3.5 w-3.5" />
            Device Activation
          </Link>

          <Link
            href="/admin/store"
            className="inline-flex min-h-[38px] items-center gap-2 rounded-pill bg-ink px-4 text-xs font-semibold text-paper-raised hover:bg-ink/85 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Hardware Player
          </Link>
        </div>
      </div>

      {/* =========================================================================
          SECTION 1: STORES (Add / Delete / Deactivate Store)
      ========================================================================== */}
      {(activeTab === 'all' || activeTab === 'stores') && (
        <section className="pt-4">
          <EntitySectionHeader
            title="Stores"
            count={stores.length}
            icon={<StoreIcon className="h-5 w-5" />}
            onAdd={() => setPanel(panel === 'add-store' ? null : 'add-store')}
            onDeactivate={() => setPanel(panel === 'deactivate-store' ? null : 'deactivate-store')}
            onDelete={() => setPanel(panel === 'delete-store' ? null : 'delete-store')}
            activePanel={panel}
            addLabel="Add Store"
            deactivateLabel="Deactivate Store"
            deleteLabel="Delete Store"
          />

          {/* Form 1: Add Store */}
          {panel === 'add-store' && (
            <AddStoreForm
              onCancel={() => setPanel(null)}
              onSaved={async (name) => {
                await refreshStores();
                setPanel(null);
                setNotice(`Added store '${name}'.`);
              }}
              onError={setError}
            />
          )}

          {/* Form 2: Deactivate Store */}
          {panel === 'deactivate-store' && (
            <DeactivateStoreForm
              stores={stores}
              onCancel={() => setPanel(null)}
              onDeactivated={async (name, st) => {
                await refreshStores();
                setPanel(null);
                setNotice(`Store '${name}' status updated to ${st}.`);
              }}
              onError={setError}
            />
          )}

          {/* Form 3: Delete Store */}
          {panel === 'delete-store' && (
            <DeleteStoreForm
              stores={stores}
              onCancel={() => setPanel(null)}
              onDeleted={async (name, count) => {
                await refreshStores();
                setPanel(null);
                setNotice(`Deleted store '${name}' and removed ${count} screens.`);
              }}
              onError={setError}
            />
          )}

          {/* Stores Table */}
          <div className="card mt-6 overflow-hidden">
            {stores.length === 0 ? (
              <EmptyState>No stores recorded yet. Use 'Add Store' above to add venue screen inventory.</EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[56rem] text-left text-xs">
                  <thead>
                    <tr className="border-b border-line bg-paper/50">
                      <Th>Store Venue</Th>
                      <Th>Location</Th>
                      <Th>Contact</Th>
                      <Th>Status</Th>
                      <Th className="text-right">Screens</Th>
                      <Th className="text-right">Actions</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60">
                    {stores.map((store) => (
                      <tr key={store.id} className="hover:bg-paper-raised/50 transition-colors">
                        <Td>
                          <Link
                            href={`/admin/store/${store.id}`}
                            className="font-bold text-ink hover:underline text-sm block"
                          >
                            {store.name}
                          </Link>
                          <span className="text-ink-muted text-[11px] block mt-0.5">
                            {store.website ?? 'No website'} · Slug: {store.slug}
                          </span>
                        </Td>
                        <Td className="text-ink">
                          <div>{store.location}</div>
                          {store.latitude != null && store.longitude != null && (
                            <span className="font-mono text-[10px] text-state-ok block mt-0.5">
                              BLR: {Number(store.latitude).toFixed(4)}, {Number(store.longitude).toFixed(4)}
                            </span>
                          )}
                        </Td>
                        <Td>
                          <span className="block text-ink">{store.contactName ?? '—'}</span>
                          <span className="block text-ink-muted text-[11px]">{store.contactEmail}</span>
                        </Td>
                        <Td>
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-pill text-[11px] font-semibold ${
                              STORE_STATUS_TONE[store.status] ?? 'text-ink-muted bg-paper'
                            }`}
                          >
                            {store.status === 'ACTIVE'
                              ? 'Active'
                              : store.status === 'PENDING' || store.status === 'PENDING_REVIEW'
                              ? 'Pending'
                              : 'Deactivated'}
                          </span>
                        </Td>
                        <Td className="text-right font-semibold text-ink text-sm">
                          {NUMBER_FORMAT.format(store.screenCount)}
                        </Td>
                        <Td className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {/* Inline Deactivate / Activate Toggle */}
                            <button
                              type="button"
                              disabled={busyId === store.id}
                              onClick={() => handleToggleStoreStatus(store)}
                              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium border transition-colors ${
                                store.status === 'ACTIVE'
                                  ? 'border-line text-ink-muted hover:border-state-run hover:text-state-run'
                                  : 'border-state-ok/40 bg-state-ok/10 text-state-ok hover:bg-state-ok hover:text-paper-raised'
                              }`}
                              title={store.status === 'ACTIVE' ? 'Deactivate store' : 'Reactivate store'}
                            >
                              <PowerOff className="h-3 w-3" />
                              {store.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                            </button>

                            {/* Inline Delete Button with Confirm Panel */}
                            {pendingDelete?.id === store.id && pendingDelete.kind === 'store' ? (
                              <ConfirmPanel
                                name={store.name}
                                value={confirmValue}
                                onChange={setConfirmValue}
                                busy={busyId === store.id}
                                mismatch={confirmMismatch}
                                warning={`This removes ${store.screenCount} screen${store.screenCount === 1 ? '' : 's'} from the network total.`}
                                onConfirm={confirmDelete}
                                onCancel={() => setPendingDelete(null)}
                              />
                            ) : (
                              <DeleteButton
                                id={`delete-store-${store.id}`}
                                label={`Delete ${store.name}`}
                                busy={busyId === store.id}
                                onClick={() => requestDelete({ kind: 'store', id: store.id, name: store.name })}
                              />
                            )}
                          </div>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {/* =========================================================================
          SECTION 2: CAMPAIGNS (Add / Delete / Deactivate Campaign)
      ========================================================================== */}
      {(activeTab === 'all' || activeTab === 'campaigns') && (
        <section className="pt-8">
          <EntitySectionHeader
            title="Campaigns"
            count={campaigns.length}
            icon={<Tv className="h-5 w-5" />}
            onAdd={() => setPanel(panel === 'add-campaign' ? null : 'add-campaign')}
            onDeactivate={() => setPanel(panel === 'deactivate-campaign' ? null : 'deactivate-campaign')}
            onDelete={() => setPanel(panel === 'delete-campaign' ? null : 'delete-campaign')}
            activePanel={panel}
            addLabel="Add Campaign"
            deactivateLabel="Deactivate Campaign"
            deleteLabel="Delete Campaign"
          />

          {/* Form 1: Add Campaign */}
          {panel === 'add-campaign' && (
            <AddCampaignForm
              brands={brands}
              stores={stores}
              onCancel={() => setPanel(null)}
              onSaved={async (name) => {
                await refreshCampaigns();
                setPanel(null);
                setNotice(`Created campaign '${name}'.`);
              }}
              onError={setError}
            />
          )}

          {/* Form 2: Deactivate Campaign */}
          {panel === 'deactivate-campaign' && (
            <DeactivateCampaignForm
              campaigns={campaigns}
              onCancel={() => setPanel(null)}
              onDeactivated={async (name, st) => {
                await refreshCampaigns();
                setPanel(null);
                setNotice(`Campaign '${name}' status updated to ${st}.`);
              }}
              onError={setError}
            />
          )}

          {/* Form 3: Delete Campaign */}
          {panel === 'delete-campaign' && (
            <DeleteCampaignForm
              campaigns={campaigns}
              onCancel={() => setPanel(null)}
              onDeleted={async (name) => {
                await refreshCampaigns();
                setPanel(null);
                setNotice(`Deleted campaign '${name}'.`);
              }}
              onError={setError}
            />
          )}

          {/* Campaigns Table */}
          <div className="card mt-6 overflow-hidden">
            {campaigns.length === 0 ? (
              <EmptyState>No campaigns yet. Use 'Add Campaign' above to schedule an ad flight for any brand.</EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[56rem] text-left text-xs">
                  <thead>
                    <tr className="border-b border-line bg-paper/50">
                      <Th>Campaign Name</Th>
                      <Th>Brand</Th>
                      <Th>Creative / Video</Th>
                      <Th>Flight Schedule</Th>
                      <Th>Status</Th>
                      <Th>Assigned Venues</Th>
                      <Th className="text-right">Actions</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60">
                    {campaigns.map((campaign) => {
                      const isActive = campaign.status === 'LIVE' || campaign.status === 'ACTIVE';

                      return (
                        <tr key={campaign.id} className="hover:bg-paper-raised/50 transition-colors">
                          <Td>
                            <span className="font-bold text-ink text-sm block">{campaign.name}</span>
                            <span className="text-ink-muted text-[11px] block mt-0.5">
                              Slug: {campaign.slug}
                            </span>
                          </Td>
                          <Td>
                            <span className="font-semibold text-ink">{campaign.brand.name}</span>
                            <span className="text-ink-muted text-[11px] block">
                              Slug: {campaign.brand.slug}
                            </span>
                          </Td>
                          <Td>
                            {campaign.video ? (
                              <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                                {campaign.video.sourceFilename ?? 'Creative attached'} ({campaign.video.status})
                              </span>
                            ) : (
                              <span className="text-ink-muted text-[11px] italic">No creative</span>
                            )}
                          </Td>
                          <Td className="text-ink-muted text-[11px]">
                            {campaign.startsOn ? formatDate(campaign.startsOn) : 'Open start'} &rarr;{' '}
                            {campaign.endsOn ? formatDate(campaign.endsOn) : 'Open end'}
                          </Td>
                          <Td>
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-pill text-[11px] font-semibold uppercase ${
                                CAMPAIGN_STATUS_TONE[campaign.status] ?? 'text-ink-muted bg-paper'
                              }`}
                            >
                              {campaign.status}
                            </span>
                          </Td>
                          <Td>
                            <span className="inline-flex items-center gap-1 font-semibold text-ink">
                              {campaign.assignedStores.length} venue(s)
                            </span>
                          </Td>
                          <Td className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              {/* Inline Deactivate / Activate Toggle */}
                              <button
                                type="button"
                                disabled={busyId === campaign.id}
                                onClick={() => handleToggleCampaignStatus(campaign)}
                                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium border transition-colors ${
                                  isActive
                                    ? 'border-line text-ink-muted hover:border-state-run hover:text-state-run'
                                    : 'border-state-ok/40 bg-state-ok/10 text-state-ok hover:bg-state-ok hover:text-paper-raised'
                                }`}
                                title={isActive ? 'Deactivate campaign' : 'Reactivate campaign'}
                              >
                                <PowerOff className="h-3 w-3" />
                                {isActive ? 'Deactivate' : 'Activate'}
                              </button>

                              {/* Inline Delete Button with Confirm Panel */}
                              {pendingDelete?.id === campaign.id && pendingDelete.kind === 'campaign' ? (
                                <ConfirmPanel
                                  name={campaign.name}
                                  value={confirmValue}
                                  onChange={setConfirmValue}
                                  busy={busyId === campaign.id}
                                  mismatch={confirmMismatch}
                                  warning="This permanently purges this campaign and its creative from all assigned hardware players."
                                  onConfirm={confirmDelete}
                                  onCancel={() => setPendingDelete(null)}
                                />
                              ) : (
                                <DeleteButton
                                  id={`delete-campaign-${campaign.id}`}
                                  label={`Delete ${campaign.name}`}
                                  busy={busyId === campaign.id}
                                  onClick={() => requestDelete({ kind: 'campaign', id: campaign.id, name: campaign.name })}
                                />
                              )}
                            </div>
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {/* =========================================================================
          SECTION 3: BRANDS (Add / Delete / Deactivate Brand)
      ========================================================================== */}
      {(activeTab === 'all' || activeTab === 'brands') && (
        <section className="pt-8">
          <EntitySectionHeader
            title="Brands"
            count={brands.length}
            icon={<Layers className="h-5 w-5" />}
            onAdd={() => setPanel(panel === 'add-brand' ? null : 'add-brand')}
            onDeactivate={() => setPanel(panel === 'deactivate-brand' ? null : 'deactivate-brand')}
            onDelete={() => setPanel(panel === 'delete-brand' ? null : 'delete-brand')}
            activePanel={panel}
            addLabel="Add Brand"
            deactivateLabel="Deactivate Brand"
            deleteLabel="Delete Brand"
          />

          {/* Form 1: Add Brand */}
          {panel === 'add-brand' && (
            <AddBrandForm
              onCancel={() => setPanel(null)}
              onSaved={async (name) => {
                await refreshBrands();
                setPanel(null);
                setNotice(`Added brand '${name}'.`);
              }}
              onError={setError}
            />
          )}

          {/* Form 2: Deactivate Brand */}
          {panel === 'deactivate-brand' && (
            <DeactivateBrandForm
              brands={brands}
              onCancel={() => setPanel(null)}
              onDeactivated={async (name, st) => {
                await refreshBrands();
                setPanel(null);
                setNotice(`Brand '${name}' status updated to ${st}.`);
              }}
              onError={setError}
            />
          )}

          {/* Form 3: Delete Brand */}
          {panel === 'delete-brand' && (
            <DeleteBrandForm
              brands={brands}
              onCancel={() => setPanel(null)}
              onDeleted={async (name, count) => {
                await refreshBrands();
                setPanel(null);
                setNotice(`Deleted brand '${name}' and ${count} associated campaigns.`);
              }}
              onError={setError}
            />
          )}

          {/* Brands Table */}
          <div className="card mt-6 overflow-hidden">
            {brands.length === 0 ? (
              <EmptyState>No brands yet. Use 'Add Brand' above to register a commercial advertising client.</EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[56rem] text-left text-xs">
                  <thead>
                    <tr className="border-b border-line bg-paper/50">
                      <Th>Brand Name</Th>
                      <Th>Contact Information</Th>
                      <Th>Status</Th>
                      <Th>Added Date</Th>
                      <Th className="text-right">Campaigns</Th>
                      <Th className="text-right">Actions</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60">
                    {brands.map((brand) => (
                      <tr key={brand.id} className="hover:bg-paper-raised/50 transition-colors">
                        <Td>
                          <span className="font-bold text-ink text-sm block">{brand.name}</span>
                          <span className="text-ink-muted text-[11px] block mt-0.5">
                            {brand.website ?? 'No website'} · Slug: {brand.slug}
                          </span>
                        </Td>
                        <Td>
                          <span className="block text-ink font-medium">{brand.contactName}</span>
                          <span className="block text-ink-muted text-[11px]">{brand.contactEmail}</span>
                        </Td>
                        <Td>
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-pill text-[11px] font-semibold uppercase ${
                              BRAND_STATUS_TONE[brand.status] ?? 'text-ink-muted bg-paper'
                            }`}
                          >
                            {brand.status}
                          </span>
                        </Td>
                        <Td className="text-ink-muted text-[11px]">{formatDate(brand.createdAt)}</Td>
                        <Td className="text-right font-semibold text-ink text-sm">
                          {NUMBER_FORMAT.format(brand.campaignCount)}
                        </Td>
                        <Td className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {/* Inline Deactivate / Activate Toggle */}
                            <button
                              type="button"
                              disabled={busyId === brand.id}
                              onClick={() => handleToggleBrandStatus(brand)}
                              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium border transition-colors ${
                                brand.status === 'ACTIVE'
                                  ? 'border-line text-ink-muted hover:border-state-run hover:text-state-run'
                                  : 'border-state-ok/40 bg-state-ok/10 text-state-ok hover:bg-state-ok hover:text-paper-raised'
                              }`}
                              title={brand.status === 'ACTIVE' ? 'Deactivate brand' : 'Reactivate brand'}
                            >
                              <PowerOff className="h-3 w-3" />
                              {brand.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                            </button>

                            {/* Inline Delete Button with Confirm Panel */}
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
                                onCancel={() => setPendingDelete(null)}
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
                          </div>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Section Header with 3 Form Buttons */

function EntitySectionHeader({
  title,
  count,
  icon,
  onAdd,
  onDeactivate,
  onDelete,
  activePanel,
  addLabel,
  deactivateLabel,
  deleteLabel,
}: {
  title: string;
  count: number;
  icon: ReactNode;
  onAdd: () => void;
  onDeactivate: () => void;
  onDelete: () => void;
  activePanel: PanelName;
  addLabel: string;
  deactivateLabel: string;
  deleteLabel: string;
}) {
  const isAddOpen = activePanel?.startsWith('add-');
  const isDeactivateOpen = activePanel?.startsWith('deactivate-');
  const isDeleteOpen = activePanel?.startsWith('delete-');

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink/5 text-ink font-semibold">
          {icon}
        </span>
        <h2 className="type-display text-xl font-bold text-ink">
          {title} <span className="text-ink-muted text-base font-normal">({count})</span>
        </h2>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onAdd}
          className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-pill px-4 text-xs font-semibold transition-colors ${
            activePanel?.includes('add')
              ? 'bg-ink text-paper-raised'
              : 'border border-line-strong text-ink hover:border-ink hover:bg-paper'
          }`}
        >
          <Plus className="h-3.5 w-3.5" />
          {addLabel}
        </button>

        <button
          type="button"
          onClick={onDeactivate}
          className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-pill px-4 text-xs font-semibold transition-colors ${
            activePanel?.includes('deactivate')
              ? 'bg-state-run text-paper-raised'
              : 'border border-line text-ink-muted hover:border-state-run hover:text-state-run'
          }`}
        >
          <PowerOff className="h-3.5 w-3.5" />
          {deactivateLabel}
        </button>

        <button
          type="button"
          onClick={onDelete}
          className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-pill px-4 text-xs font-semibold transition-colors ${
            activePanel?.includes('delete')
              ? 'bg-state-error text-paper-raised'
              : 'border border-line text-ink-muted hover:border-state-error hover:text-state-error'
          }`}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {deleteLabel}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Tab Button */

function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-[38px] items-center gap-2 rounded-pill px-4 text-xs font-semibold transition-colors ${
        active
          ? 'bg-ink text-paper-raised shadow-sm'
          : 'text-ink-muted hover:bg-paper-raised hover:text-ink'
      }`}
    >
      <span>{label}</span>
      {count !== undefined && (
        <span
          className={`rounded-pill px-1.5 py-0.2 text-[10px] ${
            active ? 'bg-paper-raised/20 text-paper-raised' : 'bg-line/60 text-ink-muted'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ Presentational Pieces */

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-5">
      <dt className="type-eyebrow text-ink-muted text-xs">{label}</dt>
      <dd className="mt-2 text-2xl font-bold text-ink">{value}</dd>
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="px-6 py-10 text-xs text-ink-muted text-center">{children}</p>;
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
      className="inline-flex items-center gap-1 rounded-md border border-line-strong px-2.5 py-1 text-[11px] font-medium text-state-error transition-colors hover:border-state-error disabled:cursor-not-allowed disabled:opacity-60"
    >
      <Trash2 className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
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
    <div className="flex flex-col items-end gap-1.5 p-2 bg-paper rounded border border-state-error/40 shadow-sm">
      <label htmlFor="delete-confirm-input" className="text-[11px] font-semibold text-ink">
        Type <span className="font-mono text-state-error">{name}</span> to delete
      </label>
      <p className="max-w-[20rem] text-right text-[10px] text-state-error">{warning}</p>
      <input
        id="delete-confirm-input"
        name="delete-confirm"
        value={value}
        disabled={busy}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        className={`min-h-[32px] w-[14rem] rounded border bg-paper-raised px-2.5 text-xs text-ink disabled:opacity-60 ${
          mismatch ? 'border-state-error' : 'border-line-strong'
        }`}
      />
      <div className="flex gap-1.5 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="inline-flex min-h-[28px] items-center rounded-pill border border-line px-3 text-[11px] font-medium text-ink-muted hover:text-ink disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy || mismatch}
          className="inline-flex min-h-[28px] items-center rounded-pill bg-state-error px-3 text-[11px] font-semibold text-paper-raised disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Add Brand Form */

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
    <form onSubmit={handleSubmit} noValidate className="card mt-6 p-6 lg:p-7 border border-line">
      <div className="flex items-center justify-between border-b border-line pb-4">
        <div>
          <h3 className="type-display text-base font-semibold text-ink">Add a brand</h3>
          <p className="mt-1 text-xs text-ink-muted">
            For an advertising customer or partner. Contact details will be linked for billing and notifications.
          </p>
        </div>
        <span className="rounded-pill bg-state-ok/10 text-state-ok px-3 py-1 text-xs font-semibold">
          New Customer
        </span>
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <Field id="brand-name" label="Brand name" error={errors.name}>
          {({ describedBy, invalid }) => (
            <TextInput
              id="brand-name"
              value={values.name}
              disabled={busy}
              required
              invalid={invalid}
              describedBy={describedBy}
              placeholder="e.g. Acme Athletics"
              onChange={(e) => set('name')(e.target.value)}
            />
          )}
        </Field>

        <Field id="brand-website" label="Website" optional error={errors.website}>
          {({ describedBy, invalid }) => (
            <TextInput
              id="brand-website"
              value={values.website}
              disabled={busy}
              placeholder="example.com"
              invalid={invalid}
              describedBy={describedBy}
              onChange={(e) => set('website')(e.target.value)}
            />
          )}
        </Field>

        <Field id="brand-contactName" label="Contact name" error={errors.contactName}>
          {({ describedBy, invalid }) => (
            <TextInput
              id="brand-contactName"
              value={values.contactName}
              disabled={busy}
              required
              invalid={invalid}
              describedBy={describedBy}
              placeholder="Full name"
              onChange={(e) => set('contactName')(e.target.value)}
            />
          )}
        </Field>

        <Field id="brand-contactEmail" label="Contact email" error={errors.contactEmail}>
          {({ describedBy, invalid }) => (
            <TextInput
              id="brand-contactEmail"
              type="email"
              value={values.contactEmail}
              disabled={busy}
              required
              invalid={invalid}
              describedBy={describedBy}
              placeholder="contact@brand.com"
              onChange={(e) => set('contactEmail')(e.target.value)}
            />
          )}
        </Field>

        <Field id="brand-contactPhone" label="Contact phone" error={errors.contactPhone}>
          {({ describedBy, invalid }) => (
            <TextInput
              id="brand-contactPhone"
              type="tel"
              value={values.contactPhone}
              disabled={busy}
              required
              invalid={invalid}
              describedBy={describedBy}
              placeholder="+44 20 7946 0001"
              onChange={(e) => set('contactPhone')(e.target.value)}
            />
          )}
        </Field>

        <Field id="brand-status" label="Status">
          {({ describedBy, invalid }) => (
            <Select
              id="brand-status"
              value={values.status}
              disabled={busy}
              invalid={invalid}
              describedBy={describedBy}
              onChange={(e) => set('status')(e.target.value)}
            >
              {BRAND_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status.replace('_', ' ').toLowerCase()}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-[44px] items-center justify-center rounded-pill bg-ink px-7 text-sm font-semibold text-paper-raised hover:bg-ink/90 disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Add Brand'}
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

/* ------------------------------------------------------------------ Table Cells */

function Th({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-ink-muted first:pl-6 last:pr-6 ${className}`}
    >
      {children}
    </th>
  );
}

function Td({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <td className={`px-4 py-3.5 align-middle text-xs first:pl-6 last:pr-6 ${className}`}>
      {children}
    </td>
  );
}
