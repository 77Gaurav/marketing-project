'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Check,
  Clock,
  Copy,
  Laptop,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Store as StoreIcon,
  Terminal,
  Tv,
} from 'lucide-react';
import type { StoreListEntry, Device } from '@/lib/db/types';

interface StoreDeviceConsoleProps {
  admin: { fullName: string; email: string };
  initialStores: StoreListEntry[];
  initialDevices: (Device & { storeName?: string; storeSlug?: string })[];
}

interface NewDeviceAlert {
  deviceId: string;
  activationCode: string;
  status: string;
  storeId: string;
  storeName?: string;
}

export default function StoreDeviceConsole({
  admin,
  initialStores,
  initialDevices,
}: StoreDeviceConsoleProps) {
  const [stores, setStores] = useState<StoreListEntry[]>(initialStores);
  const [devices, setDevices] = useState<(Device & { storeName?: string; storeSlug?: string })[]>(initialDevices);
  const [selectedStoreId, setSelectedStoreId] = useState<string>(initialStores[0]?.id || '');
  const [searchFilter, setSearchFilter] = useState('');
  const [isAddingDevice, setIsAddingDevice] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [newDeviceAlert, setNewDeviceAlert] = useState<NewDeviceAlert | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [viewScope, setViewScope] = useState<'selected' | 'all'>('selected');

  const selectedStore = stores.find((s) => s.id === selectedStoreId) || stores[0];

  const filteredStores = stores.filter((store) => {
    const q = searchFilter.toLowerCase();
    return (
      store.name.toLowerCase().includes(q) ||
      store.slug.toLowerCase().includes(q) ||
      store.location.toLowerCase().includes(q)
    );
  });

  const displayedDevices = devices.filter((device) => {
    if (viewScope === 'selected' && selectedStore) {
      return device.storeId === selectedStore.id;
    }
    return true;
  });

  const totalStores = stores.length;
  const totalDevices = devices.length;
  const activatedCount = devices.filter(
    (d) => d.status === 'Activated' || (d.status as string) === 'ACTIVATED',
  ).length;
  const pendingCount = devices.filter(
    (d) => d.status === 'Activation Pending' || (d.status as string) === 'PENDING',
  ).length;

  async function refreshData() {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/admin/store/devices');
      if (res.ok) {
        const data = await res.json();
        if (data.stores) setStores(data.stores);
        if (data.devices) setDevices(data.devices);
      }
    } catch (err) {
      console.error('Failed to refresh data', err);
    } finally {
      setIsRefreshing(false);
    }
  }

  function handleCopy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey(null);
    }, 2000);
  }

  async function handleAddDevice() {
    if (!selectedStore) {
      setNotification({ message: 'Please select a store first.', type: 'error' });
      return;
    }

    setIsAddingDevice(true);
    setNotification(null);

    try {
      const response = await fetch('/admin/store', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ storeId: selectedStore.id }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create device');
      }

      setNewDeviceAlert({
        deviceId: String(data.deviceId),
        activationCode: data.activationCode,
        status: data.status,
        storeId: data.storeId,
        storeName: selectedStore.name,
      });

      setNotification({
        message: `New Device #${data.deviceId} created! Awaiting activation from the Raspberry Pi.`,
        type: 'success',
      });

      await refreshData();
    } catch (err: any) {
      console.error('Error adding device:', err);
      setNotification({
        message: err.message || 'Failed to add device.',
        type: 'error',
      });
    } finally {
      setIsAddingDevice(false);
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
          <span className="font-semibold text-ink">Add New Device</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={refreshData}
            disabled={isRefreshing}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-pill border border-line bg-paper px-4 py-2 text-sm font-medium text-ink hover:border-ink hover:bg-paper-raised transition-all disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh Status
          </button>
          <div className="hidden sm:inline-flex rounded-pill bg-paper-raised px-4 py-2 text-sm text-ink-muted border border-line">
            Admin: <span className="font-semibold text-ink ml-1">{admin.fullName || admin.email}</span>
          </div>
        </div>
      </div>

      {/* Main Title Section */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-ink-muted">
          Hardware Display Deployment
        </p>
        <h1 className="type-display mt-2 text-3xl sm:text-4xl font-extrabold text-ink tracking-tight">
          Add New Device
        </h1>
        <p className="type-lead mt-3 text-base sm:text-lg text-ink-muted max-w-2xl">
          Register new display devices for your venue stores, generate auto-incremented device IDs with one-time activation codes, and connect physical Raspberry Pi players.
        </p>
      </div>

      {/* Overview Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="card p-6 border-line bg-paper">
          <div className="flex items-center gap-2.5 text-ink-muted">
            <StoreIcon className="h-5 w-5" />
            <span className="text-sm font-semibold uppercase tracking-wider">Venues</span>
          </div>
          <p className="type-display mt-3 text-3xl font-extrabold text-ink">{totalStores}</p>
          <span className="text-xs text-ink-muted mt-1 block">Active venue locations</span>
        </div>

        <div className="card p-6 border-line bg-paper">
          <div className="flex items-center gap-2.5 text-ink-muted">
            <Tv className="h-5 w-5" />
            <span className="text-sm font-semibold uppercase tracking-wider">Total Devices</span>
          </div>
          <p className="type-display mt-3 text-3xl font-extrabold text-ink">{totalDevices}</p>
          <span className="text-xs text-ink-muted mt-1 block">Hardware screens registered</span>
        </div>

        <div className="card p-6 border-line bg-paper border-l-4 border-l-state-ok">
          <div className="flex items-center gap-2.5 text-state-ok">
            <ShieldCheck className="h-5 w-5" />
            <span className="text-sm font-semibold uppercase tracking-wider">Activated</span>
          </div>
          <p className="type-display mt-3 text-3xl font-extrabold text-ink">{activatedCount}</p>
          <span className="text-xs text-ink-muted mt-1 block">Online & playing content</span>
        </div>

        <div className="card p-6 border-line bg-paper border-l-4 border-l-state-run">
          <div className="flex items-center gap-2.5 text-state-run">
            <Clock className="h-5 w-5" />
            <span className="text-sm font-semibold uppercase tracking-wider">Pending</span>
          </div>
          <p className="type-display mt-3 text-3xl font-extrabold text-ink">{pendingCount}</p>
          <span className="text-xs text-ink-muted mt-1 block">Awaiting Raspberry Pi activation</span>
        </div>
      </div>

      {/* Notification Banner */}
      {notification && (
        <div
          role="status"
          className={`flex items-center justify-between gap-4 rounded-xl px-5 py-4 text-sm font-medium border ${
            notification.type === 'success'
              ? 'border-state-ok/40 bg-state-ok/10 text-ink'
              : 'border-state-error/40 bg-state-error/10 text-state-error'
          }`}
        >
          <span>{notification.message}</span>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="text-xs font-semibold text-ink-muted hover:text-ink underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Primary Action Card: Selected Store & Large "Add New Device" Button */}
      {selectedStore && (
        <div className="card p-7 border-line bg-paper-raised/30 shadow-sm space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-line">
            <div className="space-y-2">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex items-center gap-1.5 rounded-pill bg-paper px-3 py-1 text-xs font-bold uppercase tracking-wider text-ink border border-line">
                  <StoreIcon className="h-3.5 w-3.5 text-ink-muted" />
                  Target Store
                </span>
                <span className="rounded bg-paper px-2 py-0.5 text-xs font-mono font-semibold text-ink-muted border border-line">
                  {selectedStore.slug}
                </span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-ink">{selectedStore.name}</h2>
              <p className="text-sm text-ink-muted">{selectedStore.location}</p>
            </div>

            {/* Increased Size "Add New Device" Button */}
            <div>
              <button
                type="button"
                id="add-new-device-main-btn"
                onClick={handleAddDevice}
                disabled={isAddingDevice}
                className="w-full sm:w-auto inline-flex min-h-[52px] items-center justify-center gap-3 rounded-pill bg-ink px-8 py-3.5 text-base font-bold text-paper-raised shadow-md hover:bg-ink/85 disabled:opacity-50 transition-all duration-fast"
              >
                <Plus className="h-5 w-5" strokeWidth={2.5} />
                {isAddingDevice ? 'Generating Device...' : 'Add New Device'}
              </button>
            </div>
          </div>

          {/* Quick Store Selector Pill Menu */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-ink-muted block mb-2.5">
              Select Venue Store:
            </label>
            <div className="flex flex-wrap gap-2">
              {stores.map((store) => {
                const isSelected = store.id === selectedStore.id;
                return (
                  <button
                    key={store.id}
                    type="button"
                    onClick={() => {
                      setSelectedStoreId(store.id);
                      setViewScope('selected');
                    }}
                    className={`inline-flex items-center gap-2 rounded-pill px-4 py-2 text-sm font-semibold transition-all ${
                      isSelected
                        ? 'bg-ink text-paper-raised shadow-sm'
                        : 'border border-line bg-paper text-ink hover:border-ink hover:bg-paper-raised'
                    }`}
                  >
                    <span>{store.name}</span>
                    <span
                      className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                        isSelected ? 'bg-paper/20 text-paper-raised' : 'bg-paper-raised text-ink-muted'
                      }`}
                    >
                      {store.slug}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Prominent Generated Device Credentials Card */}
      {newDeviceAlert && (
        <div className="card p-7 border-2 border-state-run/60 bg-paper-raised shadow-md space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-state-run/20 text-state-run">
                <Tv className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-xl font-bold text-ink">Device Credentials Generated</h3>
                <p className="text-sm text-ink-muted">
                  Linked to store: <span className="font-semibold text-ink">{newDeviceAlert.storeName}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-pill bg-state-run/15 px-3.5 py-1.5 text-xs font-bold text-state-run">
                <span className="h-2 w-2 rounded-full bg-state-run animate-ping" />
                {`{status: "${newDeviceAlert.status}"}`}
              </span>
              <button
                type="button"
                onClick={() => setNewDeviceAlert(null)}
                className="text-xs font-medium text-ink-muted hover:text-ink px-2.5 py-1 rounded border border-line bg-paper"
              >
                Dismiss
              </button>
            </div>
          </div>

          {/* Credential Tiles with Large, Readable Typography */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="rounded-xl border border-line bg-paper p-5 space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                Auto-Incremented Device ID
              </span>
              <div className="flex items-center justify-between">
                <span className="font-mono text-3xl font-extrabold text-ink">
                  {newDeviceAlert.deviceId}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(newDeviceAlert.deviceId, 'alert-dev-id')}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink hover:underline"
                >
                  {copiedKey === 'alert-dev-id' ? (
                    <>
                      <Check className="h-4 w-4 text-state-ok" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" /> Copy
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-state-run/40 bg-state-run/5 p-5 space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-state-run">
                One-Time Activation Code
              </span>
              <div className="flex items-center justify-between">
                <span className="font-mono text-3xl font-extrabold tracking-wider text-state-run">
                  {newDeviceAlert.activationCode}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(newDeviceAlert.activationCode, 'alert-act-code')}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-state-run hover:underline"
                >
                  {copiedKey === 'alert-act-code' ? (
                    <>
                      <Check className="h-4 w-4 text-state-ok" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" /> Copy Code
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Hardware Activation Instructions */}
          <div className="rounded-xl border border-line bg-paper p-5 space-y-3">
            <div className="flex items-center gap-2 text-ink">
              <Terminal className="h-4 w-4 text-ink-muted" />
              <h4 className="text-sm font-bold uppercase tracking-wider">
                Raspberry Pi Hardware Activation Command
              </h4>
            </div>
            <p className="text-sm text-ink-muted leading-relaxed">
              Activation must happen from the Raspberry Pi player. Provide the credentials above to the device.
              When the device sends this JSON request to <code className="font-mono font-semibold text-ink bg-paper-raised px-1.5 py-0.5 rounded">/admin/store/activate</code>, its status will transition to <span className="font-semibold text-state-ok">"Activated"</span>:
            </p>

            <pre className="overflow-x-auto rounded-lg bg-ink p-4 font-mono text-xs sm:text-sm text-paper-raised leading-relaxed">
{`curl -X POST http://localhost:3000/admin/store/activate \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(
    {
      DeviceId: newDeviceAlert.deviceId,
      ActivationCode: newDeviceAlert.activationCode,
    },
    null,
    2,
  )}'`}
            </pre>
          </div>
        </div>
      )}

      {/* Registered Devices List Section */}
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h3 className="text-xl font-bold text-ink">
              {viewScope === 'selected' && selectedStore
                ? `Devices at ${selectedStore.name}`
                : 'All Network Devices'}
            </h3>
            <span className="rounded-full bg-paper-raised px-3 py-1 text-xs font-bold text-ink border border-line">
              {displayedDevices.length}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-pill border border-line bg-paper p-1 text-sm font-semibold">
              <button
                type="button"
                onClick={() => setViewScope('selected')}
                className={`rounded-pill px-4 py-1.5 transition-colors ${
                  viewScope === 'selected' ? 'bg-ink text-paper-raised shadow-sm' : 'text-ink-muted hover:text-ink'
                }`}
              >
                Selected Store
              </button>
              <button
                type="button"
                onClick={() => setViewScope('all')}
                className={`rounded-pill px-4 py-1.5 transition-colors ${
                  viewScope === 'all' ? 'bg-ink text-paper-raised shadow-sm' : 'text-ink-muted hover:text-ink'
                }`}
              >
                All Venues ({devices.length})
              </button>
            </div>
          </div>
        </div>

        {displayedDevices.length === 0 ? (
          <div className="card p-12 text-center border-dashed border-line bg-paper space-y-4">
            <Tv className="mx-auto h-12 w-12 text-ink-muted/40" />
            <h4 className="text-lg font-bold text-ink">No devices registered</h4>
            <p className="text-sm text-ink-muted max-w-md mx-auto">
              {viewScope === 'selected' && selectedStore
                ? `No display screen players registered for ${selectedStore.name} yet. Click "Add New Device" to generate a device ID and activation code.`
                : 'No devices found across any store in the network.'}
            </p>
            {selectedStore && viewScope === 'selected' && (
              <button
                type="button"
                onClick={handleAddDevice}
                disabled={isAddingDevice}
                className="inline-flex min-h-[46px] items-center gap-2 rounded-pill bg-ink px-6 py-2.5 text-sm font-semibold text-paper-raised hover:bg-ink/85 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Add New Device
              </button>
            )}
          </div>
        ) : (
          <div className="card overflow-hidden border border-line bg-paper shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line bg-paper-raised/60 text-xs font-bold uppercase tracking-wider text-ink-muted">
                    <th className="px-6 py-4">Device ID</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">One-Time Activation Code</th>
                    {viewScope === 'all' && <th className="px-6 py-4">Store Venue</th>}
                    <th className="px-6 py-4">Created Date</th>
                    <th className="px-6 py-4">Hardware Activation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {displayedDevices.map((device) => {
                    const isPending =
                      device.status === 'Activation Pending' || (device.status as string) === 'PENDING';
                    const isActivated =
                      device.status === 'Activated' || (device.status as string) === 'ACTIVATED';

                    return (
                      <tr key={device.id} className="hover:bg-paper-raised/40 transition-colors">
                        <td className="px-6 py-5 font-mono text-base font-extrabold text-ink">
                          #{device.deviceId}
                        </td>

                        <td className="px-6 py-5">
                          {isActivated ? (
                            <span className="inline-flex items-center gap-2 rounded-pill bg-state-ok/15 px-3 py-1 text-xs font-bold text-state-ok">
                              <span className="h-2 w-2 rounded-full bg-state-ok" />
                              Activated
                            </span>
                          ) : isPending ? (
                            <span className="inline-flex items-center gap-2 rounded-pill bg-state-run/15 px-3 py-1 text-xs font-bold text-state-run">
                              <span className="h-2 w-2 rounded-full bg-state-run animate-ping" />
                              Activation Pending
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-2 rounded-pill bg-paper-raised px-3 py-1 text-xs font-bold text-ink-muted">
                              {device.status}
                            </span>
                          )}
                        </td>

                        <td className="px-6 py-5 font-mono text-sm">
                          {device.activationCode ? (
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-ink">{device.activationCode}</span>
                              <button
                                type="button"
                                onClick={() => handleCopy(device.activationCode || '', `tbl-${device.id}`)}
                                title="Copy activation code"
                                className="p-1 rounded text-ink-muted hover:text-ink transition-colors"
                              >
                                {copiedKey === `tbl-${device.id}` ? (
                                  <Check className="h-4 w-4 text-state-ok" />
                                ) : (
                                  <Copy className="h-4 w-4" />
                                )}
                              </button>
                            </div>
                          ) : (
                            <span className="text-ink-muted">—</span>
                          )}
                        </td>

                        {viewScope === 'all' && (
                          <td className="px-6 py-5 text-sm">
                            <span className="font-semibold text-ink block">{device.storeName || '—'}</span>
                            <span className="font-mono text-xs text-ink-muted">{device.storeSlug || ''}</span>
                          </td>
                        )}

                        <td className="px-6 py-5 text-sm text-ink-muted">
                          {device.createdAt ? new Date(device.createdAt).toLocaleDateString() : '—'}
                        </td>

                        <td className="px-6 py-5 text-sm">
                          {isActivated ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-state-ok">
                              <ShieldCheck className="h-4 w-4" />
                              Activated on Hardware
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted">
                              <Clock className="h-4 w-4 text-state-run" />
                              Awaiting Raspberry Pi POST
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
