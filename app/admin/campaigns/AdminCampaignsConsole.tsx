'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Check,
  Database,
  Film,
  HardDrive,
  Layers,
  MapPin,
  Play,
  Plus,
  PowerOff,
  Radio,
  RefreshCw,
  Search,
  Store as StoreIcon,
  Trash2,
  Tv,
  X,
} from 'lucide-react';
import type { AdminCampaignListItem } from '@/device_backend';
import type { StoreListEntry } from '@/lib/db/types';

interface AdminCampaignsConsoleProps {
  admin: { fullName: string; email: string };
  initialCampaigns: AdminCampaignListItem[];
  initialStores: StoreListEntry[];
}

export default function AdminCampaignsConsole({
  admin,
  initialCampaigns,
  initialStores,
}: AdminCampaignsConsoleProps) {
  const [campaigns, setCampaigns] = useState<AdminCampaignListItem[]>(initialCampaigns);
  const [stores, setStores] = useState<StoreListEntry[]>(initialStores);
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Assign modal state
  const [selectedCampaign, setSelectedCampaign] = useState<AdminCampaignListItem | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [playsPerHour, setPlaysPerHour] = useState<number>(10);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Notification state
  const [notification, setNotification] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);

  // Refresh campaigns from API
  async function refreshCampaigns() {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/admin/campaigns');
      if (res.ok) {
        const data = await res.json();
        if (data.campaigns) setCampaigns(data.campaigns);
      }
    } catch (err) {
      console.error('Failed to refresh campaigns:', err);
    } finally {
      setIsRefreshing(false);
    }
  }

  // Filtered campaigns
  const filteredCampaigns = campaigns.filter((c) => {
    const q = searchFilter.toLowerCase();
    const matchesSearch =
      c.name.toLowerCase().includes(q) ||
      c.slug.toLowerCase().includes(q) ||
      c.brand.name.toLowerCase().includes(q) ||
      c.assignedStores.some((s) => s.storeName.toLowerCase().includes(q));

    const matchesStatus =
      statusFilter === 'ALL' ||
      c.status.toUpperCase() === statusFilter ||
      (statusFilter === 'ASSIGNED' && c.assignedStores.length > 0);

    return matchesSearch && matchesStatus;
  });

  const totalCampaigns = campaigns.length;
  const activeCampaigns = campaigns.filter(
    (c) => c.status === 'LIVE' || c.status === 'ACTIVE' || c.assignedStores.some((s) => s.status === 'ACTIVE'),
  ).length;
  const totalStoreAllocations = campaigns.reduce((sum, c) => sum + c.assignedStores.length, 0);
  const totalCreatives = campaigns.filter((c) => c.video !== null).length;

  // Handle Assigning campaign to store
  async function handleAssignSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCampaign || !selectedStoreId) return;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/admin/campaigns/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId: selectedCampaign.id,
          storeId: selectedStoreId,
          playsPerHour,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to assign campaign to store');
      }

      setNotification({
        message: `Campaign '${selectedCampaign.name}' assigned to store. Task event created (Revision #${data.event?.revision}).`,
        type: 'success',
      });
      setSelectedCampaign(null);
      await refreshCampaigns();
    } catch (err: any) {
      setNotification({
        message: err.message || 'Error assigning campaign to store.',
        type: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  // Handle Deactivating campaign or specific store task
  async function handleDeactivate(campaignId: string, storeId?: string) {
    const confirmMsg = storeId
      ? 'Deactivate this campaign task for this store? Players will retain the video file locally and pause playback.'
      : 'Deactivate this campaign across all stores? Players will retain the video file locally and pause playback.';

    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await fetch('/api/admin/campaigns/deactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId, storeId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to deactivate campaign task');

      setNotification({
        message: data.message || 'Campaign task deactivated successfully.',
        type: 'success',
      });
      await refreshCampaigns();
    } catch (err: any) {
      setNotification({
        message: err.message || 'Error deactivating campaign task.',
        type: 'error',
      });
    }
  }

  // Handle Deleting campaign or unassigning from store
  async function handleDelete(campaignId: string, storeId?: string) {
    const confirmMsg = storeId
      ? 'Remove this campaign from this store? Hardware players will delete the cached video locally.'
      : 'Permanently delete this campaign and remove its task from all stores? Players will delete the video file locally.';

    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await fetch('/api/admin/campaigns/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId, storeId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete campaign task');

      setNotification({
        message: data.message || 'Campaign task deleted. Players will purge the local video.',
        type: 'success',
      });
      await refreshCampaigns();
    } catch (err: any) {
      setNotification({
        message: err.message || 'Error deleting campaign task.',
        type: 'error',
      });
    }
  }

  function getStatusBadge(status: string) {
    const upper = status.toUpperCase();
    if (upper === 'LIVE' || upper === 'ACTIVE') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-pill bg-state-ok/15 px-3 py-1 text-xs font-bold text-state-ok">
          <span className="h-1.5 w-1.5 rounded-full bg-state-ok" />
          {status}
        </span>
      );
    }
    if (upper === 'PAUSED' || upper === 'DEACTIVATED' || upper === 'SUSPENDED') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-pill bg-state-warn/15 px-3 py-1 text-xs font-bold text-state-warn">
          <span className="h-1.5 w-1.5 rounded-full bg-state-warn" />
          {status}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 rounded-pill bg-ink/10 px-3 py-1 text-xs font-bold text-ink-muted">
        <span className="h-1.5 w-1.5 rounded-full bg-ink-muted" />
        {status}
      </span>
    );
  }

  return (
    <div className="space-y-8">
      {/* Top Banner & Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-line pb-6">
        <div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted hover:text-ink transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Admin Overview
            </Link>
            <span className="text-line">/</span>
            <span className="text-xs font-semibold text-ink">Campaigns & Tasks</span>
          </div>
          <h1 className="type-display mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            Campaigns & Player Tasks
          </h1>
          <p className="type-lead mt-1 text-sm text-ink-muted">
            Manage advertising campaigns, assign video creatives to venues, and monitor player hardware task synchronization.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={refreshCampaigns}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 rounded-pill border border-line bg-paper px-4 py-2 text-xs font-semibold text-ink hover:border-ink transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-line pb-4">
        <Link
          href="/admin"
          className="inline-flex min-h-[40px] items-center gap-2 rounded-pill px-5 text-[length:var(--type-small)] font-semibold text-ink-muted hover:bg-paper-raised hover:text-ink transition-colors"
        >
          <Radio className="h-4 w-4" />
          Network Overview
        </Link>
        <Link
          href="/admin/store"
          className="inline-flex min-h-[40px] items-center gap-2 rounded-pill px-5 text-[length:var(--type-small)] font-semibold text-ink-muted hover:bg-paper-raised hover:text-ink transition-colors"
        >
          <Tv className="h-4 w-4" />
          Stores & Devices
        </Link>
        <Link
          href="/admin/campaigns"
          className="inline-flex min-h-[40px] items-center gap-2 rounded-pill bg-ink px-5 text-[length:var(--type-small)] font-semibold text-paper-raised shadow-sm"
        >
          <Layers className="h-4 w-4" />
          Campaigns & Tasks
        </Link>
      </div>

      {/* Notification Toast */}
      {notification && (
        <div
          className={`flex items-center justify-between rounded-xl px-5 py-3.5 text-sm font-medium shadow-sm transition-all ${
            notification.type === 'success'
              ? 'bg-state-ok/15 text-state-ok border border-state-ok/30'
              : 'bg-state-error/15 text-state-error border border-state-error/30'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {notification.type === 'success' ? (
              <Check className="h-4 w-4 flex-shrink-0" />
            ) : (
              <PowerOff className="h-4 w-4 flex-shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="text-current opacity-70 hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Stat Tiles */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-line bg-paper-raised p-5 shadow-float">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Total Campaigns</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-ink">{totalCampaigns}</p>
        </div>
        <div className="rounded-xl border border-line bg-paper-raised p-5 shadow-float">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Active / Live</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-state-ok">{activeCampaigns}</p>
        </div>
        <div className="rounded-xl border border-line bg-paper-raised p-5 shadow-float">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Store Allocations</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-ink">{totalStoreAllocations}</p>
        </div>
        <div className="rounded-xl border border-line bg-paper-raised p-5 shadow-float">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Video Creatives</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-ink">{totalCreatives}</p>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input
            type="text"
            placeholder="Search campaigns, brands, or assigned stores..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full rounded-pill border border-line bg-paper-raised pl-10 pr-4 py-2.5 text-sm text-ink placeholder:text-ink-muted/70 focus:border-ink focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          {['ALL', 'LIVE', 'DRAFT', 'PAUSED', 'ASSIGNED'].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`rounded-pill px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                statusFilter === st
                  ? 'bg-ink text-paper-raised'
                  : 'bg-paper-raised text-ink-muted hover:text-ink border border-line'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Campaigns List */}
      {filteredCampaigns.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-12 text-center bg-paper-raised/40">
          <Layers className="mx-auto h-8 w-8 text-ink-muted/60" />
          <h3 className="mt-3 text-base font-semibold text-ink">No campaigns found</h3>
          <p className="mt-1 text-sm text-ink-muted">
            {searchFilter ? 'Try adjusting your search criteria.' : 'No advertising campaigns have been created yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {filteredCampaigns.map((campaign) => (
            <div
              key={campaign.id}
              className="rounded-xl border border-line bg-paper-raised p-6 shadow-float transition-all hover:border-ink/40"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h2 className="text-xl font-bold tracking-tight text-ink">{campaign.name}</h2>
                    <span className="rounded-pill bg-paper px-2.5 py-0.5 text-xs font-semibold text-ink-muted border border-line">
                      {campaign.brand.name}
                    </span>
                    {getStatusBadge(campaign.status)}
                  </div>
                  <p className="mt-1 text-xs text-ink-muted font-mono">
                    ID: {campaign.id} &bull; Slug: /{campaign.brand.slug}/{campaign.slug} &bull; Created: {new Date(campaign.createdAt).toLocaleDateString()}
                  </p>
                </div>

                {/* Main Action Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCampaign(campaign);
                      setSelectedStoreId(stores[0]?.id || '');
                    }}
                    className="inline-flex items-center gap-1.5 rounded-pill bg-ink px-4 py-2 text-xs font-semibold text-paper-raised hover:bg-ink/85 transition-colors shadow-sm"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Assign to Store
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeactivate(campaign.id)}
                    className="inline-flex items-center gap-1.5 rounded-pill border border-state-warn/40 bg-state-warn/10 px-3 py-2 text-xs font-semibold text-state-warn hover:bg-state-warn/20 transition-colors"
                  >
                    <PowerOff className="h-3.5 w-3.5" />
                    Deactivate All
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(campaign.id)}
                    className="inline-flex items-center gap-1.5 rounded-pill border border-state-error/40 bg-state-error/10 px-3 py-2 text-xs font-semibold text-state-error hover:bg-state-error/20 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete Campaign
                  </button>
                </div>
              </div>

              {/* Creative Video Details */}
              <div className="mt-5 rounded-lg bg-paper p-4 border border-line/70">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-muted">
                    <Film className="h-3.5 w-3.5" />
                    Video Creative Asset
                  </div>
                  {campaign.video ? (
                    <div className="text-xs space-y-1">
                      <p className="font-semibold text-ink flex items-center gap-1.5">
                        <span>{campaign.video.sourceFilename}</span>
                        <span className="rounded-pill bg-state-ok/15 text-state-ok px-2 py-0.2 text-[10px] font-bold">
                          {campaign.video.status}
                        </span>
                      </p>
                      <p className="text-ink-muted font-mono text-[11px] truncate" title={`${campaign.video.s3Bucket}/${campaign.video.s3Key}`}>
                        <HardDrive className="inline h-3 w-3 mr-1 text-ink-muted" />
                        s3://{campaign.video.s3Bucket}/{campaign.video.s3Key}
                      </p>
                      {(campaign.video.width || campaign.video.durationSeconds) && (
                        <p className="text-ink-muted text-[11px]">
                          {campaign.video.width && campaign.video.height
                            ? `${campaign.video.width}x${campaign.video.height}`
                            : 'Standard 1080p'}{' '}
                          &bull;{' '}
                          {campaign.video.durationSeconds ? `${campaign.video.durationSeconds}s` : '15s spot'}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-state-warn italic">No creative uploaded yet.</p>
                  )}
                </div>
              </div>

              {/* Assigned Stores List */}
              <div className="mt-5 border-t border-line/60 pt-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5">
                    <StoreIcon className="h-3.5 w-3.5" />
                    Assigned Venues & Task Queues ({campaign.assignedStores.length})
                  </h4>
                </div>

                {campaign.assignedStores.length === 0 ? (
                  <p className="mt-2 text-xs text-ink-muted italic">
                    Not currently assigned to any stores. Click &ldquo;Assign to Store&rdquo; to publish this task to venue players.
                  </p>
                ) : (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {campaign.assignedStores.map((assignment) => (
                      <div
                        key={assignment.storeId}
                        className="flex items-center justify-between rounded-lg border border-line bg-paper p-3 text-xs"
                      >
                        <div className="space-y-0.5">
                          <p className="font-semibold text-ink flex items-center gap-1.5">
                            <StoreIcon className="h-3 w-3 text-ink-muted" />
                            {assignment.storeName}
                          </p>
                          <p className="text-[11px] text-ink-muted">
                            {assignment.playsPerHour} plays/hour &bull;{' '}
                            <span
                              className={`font-semibold ${
                                assignment.status === 'ACTIVE' ? 'text-state-ok' : 'text-state-warn'
                              }`}
                            >
                              {assignment.status}
                            </span>
                          </p>
                        </div>

                        <div className="flex items-center gap-1">
                          {assignment.status === 'ACTIVE' ? (
                            <button
                              type="button"
                              onClick={() => handleDeactivate(campaign.id, assignment.storeId)}
                              title="Deactivate task for this store"
                              className="p-1 rounded text-ink-muted hover:text-state-warn hover:bg-state-warn/10 transition-colors"
                            >
                              <PowerOff className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedCampaign(campaign);
                                setSelectedStoreId(assignment.storeId);
                                setPlaysPerHour(assignment.playsPerHour);
                              }}
                              title="Reactivate task for this store"
                              className="p-1 rounded text-ink-muted hover:text-state-ok hover:bg-state-ok/10 transition-colors"
                            >
                              <Play className="h-3.5 w-3.5" />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleDelete(campaign.id, assignment.storeId)}
                            title="Remove task from store (deletes local player video)"
                            className="p-1 rounded text-ink-muted hover:text-state-error hover:bg-state-error/10 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Assign to Store Modal */}
      {selectedCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl bg-paper p-6 shadow-2xl border border-line">
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div>
                <h3 className="text-lg font-bold text-ink">Assign Campaign to Store</h3>
                <p className="text-xs text-ink-muted mt-0.5">
                  Publishes an <strong>UPSERT</strong> task event to venue player display screens.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCampaign(null)}
                className="rounded-full p-1.5 text-ink-muted hover:bg-paper-raised hover:text-ink transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAssignSubmit} className="mt-5 space-y-4">
              {/* Campaign summary */}
              <div className="rounded-lg bg-paper-raised p-3 border border-line text-xs space-y-1">
                <p className="font-semibold text-ink flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-ink-muted" />
                  Campaign: {selectedCampaign.name} ({selectedCampaign.brand.name})
                </p>
                <p className="text-ink-muted font-mono text-[11px]">
                  Creative S3: s3://{selectedCampaign.video?.s3Bucket || 'st-media-encoded'}/
                  {selectedCampaign.video?.s3Key || `videos/${selectedCampaign.id}.mp4`}
                </p>
              </div>

              {/* Store selector */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-ink mb-1.5">
                  Select Venue / Store
                </label>
                <select
                  value={selectedStoreId}
                  onChange={(e) => setSelectedStoreId(e.target.value)}
                  required
                  className="w-full rounded-pill border border-line bg-paper px-4 py-2.5 text-sm text-ink focus:border-ink focus:outline-none"
                >
                  <option value="" disabled>
                    Choose a store...
                  </option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.location}) &mdash; {s.screenCount} screen(s)
                    </option>
                  ))}
                </select>
              </div>

              {/* Plays per hour */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-ink mb-1.5">
                  Plays Per Hour (Target Frequency)
                </label>
                <input
                  type="number"
                  min="1"
                  max="120"
                  value={playsPerHour}
                  onChange={(e) => setPlaysPerHour(parseInt(e.target.value, 10) || 10)}
                  required
                  className="w-full rounded-pill border border-line bg-paper px-4 py-2.5 text-sm text-ink focus:border-ink focus:outline-none"
                />
                <p className="text-[11px] text-ink-muted mt-1">
                  How many times per hour venue displays should play this creative spot.
                </p>
              </div>

              {/* Callout */}
              <div className="rounded-lg bg-state-ok/10 border border-state-ok/20 p-3 text-xs text-ink space-y-1">
                <p className="font-semibold text-state-ok flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5" />
                  Hardware Task Sync Guaranteed
                </p>
                <p className="text-ink-muted text-[11px]">
                  The store&apos;s monotonic task revision will advance. Connected Raspberry Pi players will automatically fetch this task and download the creative video on their next hourly poll.
                </p>
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-line">
                <button
                  type="button"
                  onClick={() => setSelectedCampaign(null)}
                  className="rounded-pill border border-line px-5 py-2 text-xs font-semibold text-ink hover:border-ink transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !selectedStoreId}
                  className="rounded-pill bg-ink px-5 py-2 text-xs font-semibold text-paper-raised hover:bg-ink/85 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      Assigning Task...
                    </>
                  ) : (
                    'Assign & Create Task'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
