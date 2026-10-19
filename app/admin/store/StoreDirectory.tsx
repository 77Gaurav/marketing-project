'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  MapPin,
  RefreshCw,
  Search,
  Store as StoreIcon,
  Tv,
} from 'lucide-react';
import type { StoreListEntry } from '@/lib/db/types';

interface StoreDirectoryProps {
  admin: { fullName: string; email: string };
  initialStores: StoreListEntry[];
}

export default function StoreDirectory({ admin, initialStores }: StoreDirectoryProps) {
  const [stores, setStores] = useState<StoreListEntry[]>(initialStores);
  const [searchFilter, setSearchFilter] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const filteredStores = stores.filter((store) => {
    const q = searchFilter.toLowerCase();
    return (
      store.name.toLowerCase().includes(q) ||
      store.slug.toLowerCase().includes(q) ||
      store.location.toLowerCase().includes(q) ||
      (store.contactEmail && store.contactEmail.toLowerCase().includes(q))
    );
  });

  const totalStores = stores.length;
  const totalScreens = stores.reduce((sum, s) => sum + (s.screenCount || 0), 0);
  const activeStores = stores.filter((s) => s.status === 'ACTIVE').length;

  async function refreshStores() {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/admin/stores');
      if (res.ok) {
        const data = await res.json();
        if (data.stores) setStores(data.stores);
      }
    } catch (err) {
      console.error('Failed to refresh stores:', err);
    } finally {
      setIsRefreshing(false);
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-state-ok/15 px-3 py-1 text-xs font-bold text-state-ok">
            <span className="h-1.5 w-1.5 rounded-full bg-state-ok" />
            Active
          </span>
        );
      case 'PAUSED':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-state-run/15 px-3 py-1 text-xs font-bold text-state-run">
            <span className="h-1.5 w-1.5 rounded-full bg-state-run" />
            Paused
          </span>
        );
      case 'CLOSED':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-state-error/15 px-3 py-1 text-xs font-bold text-state-error">
            <span className="h-1.5 w-1.5 rounded-full bg-state-error" />
            Closed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-paper-raised px-3 py-1 text-xs font-bold text-ink-muted border border-line">
            {status || 'Pending Review'}
          </span>
        );
    }
  }

  return (
    <div className="space-y-10 max-w-6xl mx-auto">
      {/* Top Header & Breadcrumbs */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-6">
        <div className="flex items-center gap-3 text-sm text-ink-muted">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 font-medium hover:text-ink transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Admin Console
          </Link>
          <span className="text-line-strong">/</span>
          <span className="font-semibold text-ink">Stores</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={refreshStores}
            disabled={isRefreshing}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-pill border border-line bg-paper px-4 py-2 text-sm font-medium text-ink hover:border-ink hover:bg-paper-raised transition-all disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <div className="hidden sm:inline-flex rounded-pill bg-paper-raised px-4 py-2 text-sm text-ink-muted border border-line">
            Admin: <span className="font-semibold text-ink ml-1">{admin.fullName || admin.email}</span>
          </div>
        </div>
      </div>

      {/* Main Title Section */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-ink-muted">
          Store Network Management
        </p>
        <h1 className="type-display mt-2 text-3xl sm:text-4xl font-extrabold text-ink tracking-tight">
          Select a Store
        </h1>
        <p className="type-lead mt-3 text-base sm:text-lg text-ink-muted max-w-2xl">
          List of every store in the network. Select a store to configure its active status, generate 15-minute player activation codes, or manage screen devices.
        </p>
      </div>

      {/* Overview Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="card p-6 border-line bg-paper">
          <div className="flex items-center gap-2.5 text-ink-muted">
            <StoreIcon className="h-5 w-5" />
            <span className="text-sm font-semibold uppercase tracking-wider">Total Stores</span>
          </div>
          <p className="type-display mt-3 text-3xl font-extrabold text-ink">{totalStores}</p>
          <span className="text-xs text-ink-muted mt-1 block">Registered venues</span>
        </div>

        <div className="card p-6 border-line bg-paper border-l-4 border-l-state-ok">
          <div className="flex items-center gap-2.5 text-state-ok">
            <span className="h-2 w-2 rounded-full bg-state-ok" />
            <span className="text-sm font-semibold uppercase tracking-wider">Active Stores</span>
          </div>
          <p className="type-display mt-3 text-3xl font-extrabold text-ink">{activeStores}</p>
          <span className="text-xs text-ink-muted mt-1 block">Receiving active campaigns</span>
        </div>

        <div className="card p-6 border-line bg-paper">
          <div className="flex items-center gap-2.5 text-ink-muted">
            <Tv className="h-5 w-5" />
            <span className="text-sm font-semibold uppercase tracking-wider">Total Screens</span>
          </div>
          <p className="type-display mt-3 text-3xl font-extrabold text-ink">{totalScreens}</p>
          <span className="text-xs text-ink-muted mt-1 block">Network screen capacity</span>
        </div>
      </div>

      {/* Search Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-muted" />
          <input
            type="text"
            placeholder="Search stores by name, slug, or location..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-pill border border-line bg-paper text-sm text-ink placeholder:text-ink-muted/60 focus:outline-none focus:border-ink"
          />
        </div>

        <div className="text-xs text-ink-muted font-medium self-center">
          Showing <span className="font-bold text-ink">{filteredStores.length}</span> of {totalStores} stores
        </div>
      </div>

      {/* Stores Directory List */}
      {filteredStores.length === 0 ? (
        <div className="card p-12 text-center border-dashed border-line bg-paper space-y-4">
          <StoreIcon className="mx-auto h-12 w-12 text-ink-muted/40" />
          <h3 className="text-lg font-bold text-ink">No stores found</h3>
          <p className="text-sm text-ink-muted max-w-md mx-auto">
            {searchFilter ? 'No stores match your search filter.' : 'No stores registered yet.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredStores.map((store) => (
            <div
              key={store.id}
              className="card p-6 border-line bg-paper hover:border-ink hover:shadow-md transition-all flex flex-col justify-between group"
            >
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-bold text-ink group-hover:text-ink transition-colors">
                      {store.name}
                    </h3>
                    <span className="font-mono text-xs text-ink-muted bg-paper-raised px-2 py-0.5 rounded mt-1 inline-block border border-line">
                      {store.slug}
                    </span>
                  </div>
                  {getStatusBadge(store.status)}
                </div>

                <div className="space-y-2 text-sm text-ink-muted">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-ink-muted flex-shrink-0" />
                    <span className="truncate">{store.location || 'Location not specified'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Tv className="h-4 w-4 text-ink-muted flex-shrink-0" />
                    <span>{store.screenCount} {store.screenCount === 1 ? 'Screen' : 'Screens'}</span>
                  </div>
                </div>
              </div>

              <div className="pt-6 mt-6 border-t border-line flex items-center justify-between">
                <span className="text-xs text-ink-muted">
                  {store.createdAt ? new Date(store.createdAt).toLocaleDateString() : ''}
                </span>

                <Link
                  href={`/admin/store/${store.id}`}
                  className="inline-flex items-center gap-1.5 rounded-pill bg-ink px-4 py-2 text-xs font-bold text-paper-raised hover:bg-ink/85 transition-all shadow-sm"
                >
                  Select Store
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
