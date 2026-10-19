'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Check,
  Clock,
  Copy,
  MapPin,
  Play,
  Power,
  PowerOff,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Store as StoreIcon,
  Terminal,
  Trash2,
  Tv,
} from 'lucide-react';
import type { Store, Device } from '@/lib/db/types';

interface StoreDetailConsoleProps {
  admin: { fullName: string; email: string };
  store: Store;
  initialDevices: Device[];
}

interface PendingActivation {
  deviceId: string;
  activationCode: string;
  expiresAt: string;
}

export default function StoreDetailConsole({
  admin,
  store: initialStore,
  initialDevices,
}: StoreDetailConsoleProps) {
  const [store, setStore] = useState<Store>(initialStore);
  const [devices, setDevices] = useState<Device[]>(initialDevices);
  const [pendingActivation, setPendingActivation] = useState<PendingActivation | null>(() => {
    // Check if there is an active pending device created within the last 15 mins
    const pendingDevice = initialDevices.find(
      (d) =>
        (d.status === 'Activation Pending' || (d.status as string) === 'PENDING') &&
        d.activationCode,
    );
    if (!pendingDevice) return null;

    const expiryTime = pendingDevice.expiresAt
      ? new Date(pendingDevice.expiresAt).getTime()
      : new Date(pendingDevice.createdAt).getTime() + 15 * 60 * 1000;

    if (expiryTime > Date.now()) {
      return {
        deviceId: pendingDevice.deviceId,
        activationCode: pendingDevice.activationCode || '',
        expiresAt: new Date(expiryTime).toISOString(),
      };
    }
    return null;
  });

  const [timeLeftSeconds, setTimeLeftSeconds] = useState<number>(0);
  const [isActivatingStore, setIsActivatingStore] = useState(false);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [notification, setNotification] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  // 15-minute countdown timer effect
  useEffect(() => {
    if (!pendingActivation) {
      setTimeLeftSeconds(0);
      return;
    }

    const calculateRemaining = () => {
      const remaining = Math.max(
        0,
        Math.floor((new Date(pendingActivation.expiresAt).getTime() - Date.now()) / 1000),
      );
      return remaining;
    };

    const initialRemaining = calculateRemaining();
    setTimeLeftSeconds(initialRemaining);

    if (initialRemaining <= 0) {
      handleCodeExpired();
      return;
    }

    const interval = setInterval(() => {
      const remaining = calculateRemaining();
      setTimeLeftSeconds(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        handleCodeExpired();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [pendingActivation]);

  async function handleCodeExpired() {
    setPendingActivation(null);
    setNotification({
      message:
        'The activation code has expired (15-minute validity window ended). Unactivated pending code was removed from the database.',
      type: 'info',
    });
    // Refresh to ensure server-side deletion took place and UI stays in sync
    await refreshData();
  }

  async function refreshData() {
    setIsRefreshing(true);
    try {
      const res = await fetch(`/api/admin/store/devices?storeId=${store.id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.devices) {
          setDevices(data.devices);
          // Check if pending code is still valid
          if (pendingActivation) {
            const stillPending = data.devices.find(
              (d: Device) =>
                d.deviceId === pendingActivation.deviceId &&
                (d.status === 'Activation Pending' || (d.status as string) === 'PENDING'),
            );
            if (!stillPending) {
              setPendingActivation(null);
            }
          }
        }
      }
    } catch (err) {
      console.error('Failed to refresh store devices:', err);
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

  // Toggle Store Active/Inactive status
  async function handleToggleStoreStatus() {
    const nextStatus = store.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    setIsActivatingStore(true);
    setNotification(null);

    try {
      const res = await fetch(`/api/admin/stores/${store.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update store status');
      }

      setStore(data.store);
      if (nextStatus !== 'ACTIVE') {
        setPendingActivation(null);
      }

      setNotification({
        message:
          nextStatus !== 'ACTIVE'
            ? `Store deactivated. Any running activation code has been deleted.`
            : `Store activated successfully.`,
        type: 'success',
      });

      await refreshData();
    } catch (err: any) {
      setNotification({
        message: err.message || 'Could not update store status.',
        type: 'error',
      });
    } finally {
      setIsActivatingStore(false);
    }
  }


  // Generate 15-Minute Activation Code
  async function handleGenerateActivationCode() {
    if (store.status !== 'ACTIVE') {
      setNotification({
        message: 'Cannot ask for device activation: Store must be activated first. Click "Activate Store" above.',
        type: 'error',
      });
      return;
    }

    setIsGeneratingCode(true);
    setNotification(null);

    try {
      const response = await fetch('/api/admin/store/devices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ storeId: store.id }),
      });


      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate activation code');
      }

      const expiresAt =
        data.expiresAt || new Date(Date.now() + 15 * 60 * 1000).toISOString();

      setPendingActivation({
        deviceId: String(data.deviceId),
        activationCode: data.activationCode,
        expiresAt,
      });

      setNotification({
        message: `Activation code generated! Valid for 15 minutes. Enter credentials on the Raspberry Pi display.`,
        type: 'success',
      });

      await refreshData();
    } catch (err: any) {
      setNotification({
        message: err.message || 'Failed to generate device activation code.',
        type: 'error',
      });
    } finally {
      setIsGeneratingCode(false);
    }
  }

  // Deactivate / Delete Device or Pending Code
  async function handleDeactivateDevice(deviceId: string, isPending: boolean) {
    const confirmMessage = isPending
      ? 'Are you sure you want to cancel and delete this pending activation code?'
      : `Are you sure you want to deactivate Device #${deviceId}? It will no longer receive campaigns.`;

    if (!window.confirm(confirmMessage)) return;

    try {
      const res = await fetch('/api/admin/store/devices', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to deactivate device');
      }

      if (pendingActivation?.deviceId === deviceId) {
        setPendingActivation(null);
      }

      setNotification({
        message: isPending
          ? `Pending activation code for Device #${deviceId} deleted.`
          : `Device #${deviceId} deactivated successfully.`,
        type: 'success',
      });

      await refreshData();
    } catch (err: any) {
      setNotification({
        message: err.message || 'Failed to deactivate device.',
        type: 'error',
      });
    }
  }

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const timerPercent = Math.min(100, Math.max(0, (timeLeftSeconds / (15 * 60)) * 100));

  const activatedDevices = devices.filter(
    (d) => d.status === 'Activated' || (d.status as string) === 'ACTIVATED',
  );

  return (
    <div className="space-y-10 max-w-6xl mx-auto">
      {/* Top Header & Breadcrumbs */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-6">
        <div className="flex items-center gap-3 text-sm text-ink-muted">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 font-medium hover:text-ink transition-colors"
          >
            Admin
          </Link>
          <span className="text-line-strong">/</span>
          <Link
            href="/admin/store"
            className="inline-flex items-center gap-1.5 font-medium hover:text-ink transition-colors"
          >
            Stores
          </Link>
          <span className="text-line-strong">/</span>
          <span className="font-semibold text-ink">{store.name}</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={refreshData}
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

      {/* Title Section: STORE NAME AS TITLE */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-2">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-paper px-3 py-1 text-xs font-bold uppercase tracking-wider text-ink border border-line">
              <StoreIcon className="h-3.5 w-3.5 text-ink-muted" />
              Venue Store
            </span>
            <span className="rounded bg-paper px-2 py-0.5 text-xs font-mono font-semibold text-ink-muted border border-line">
              {store.slug}
            </span>
            {store.status === 'ACTIVE' ? (
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-state-ok/15 px-3 py-1 text-xs font-bold text-state-ok">
                <span className="h-1.5 w-1.5 rounded-full bg-state-ok" />
                Store Active
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-state-run/15 px-3 py-1 text-xs font-bold text-state-run">
                <span className="h-1.5 w-1.5 rounded-full bg-state-run" />
                {store.status || 'Pending Review'}
              </span>
            )}
          </div>

          {/* STORE NAME AS TITLE */}
          <h1 className="type-display text-3xl sm:text-4xl font-extrabold text-ink tracking-tight">
            {store.name}
          </h1>

          <div className="flex flex-wrap items-center gap-4 text-sm text-ink-muted">
            <div className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4" />
              <span>{store.location || 'Location not specified'}</span>
            </div>
            <span>•</span>
            <div className="flex items-center gap-1.5">
              <Tv className="h-4 w-4" />
              <span>{store.screenCount} {store.screenCount === 1 ? 'Screen' : 'Screens'} capacity</span>
            </div>
            {store.contactEmail && (
              <>
                <span>•</span>
                <span>{store.contactEmail}</span>
              </>
            )}
          </div>
        </div>

        {/* Store Activate / Deactivate Toggle Button */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleToggleStoreStatus}
            disabled={isActivatingStore}
            className={`inline-flex min-h-[46px] items-center gap-2.5 rounded-pill px-6 py-2.5 text-sm font-bold transition-all shadow-sm ${
              store.status === 'ACTIVE'
                ? 'border border-state-run/50 bg-paper text-state-run hover:bg-state-run/10'
                : 'bg-state-ok text-paper-raised hover:bg-state-ok/90'
            }`}
          >
            {store.status === 'ACTIVE' ? (
              <>
                <PowerOff className="h-4 w-4" />
                {isActivatingStore ? 'Updating...' : 'Deactivate Store'}
              </>
            ) : (
              <>
                <Power className="h-4 w-4" />
                {isActivatingStore ? 'Updating...' : 'Activate Store'}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Notification Banner */}
      {notification && (
        <div
          role="status"
          className={`flex items-center justify-between gap-4 rounded-xl px-5 py-4 text-sm font-medium border ${
            notification.type === 'success'
              ? 'border-state-ok/40 bg-state-ok/10 text-ink'
              : notification.type === 'error'
              ? 'border-state-error/40 bg-state-error/10 text-state-error'
              : 'border-line bg-paper-raised text-ink'
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

      {/* Action Section: Generate Activation Code */}
      <div className="card p-7 border-line bg-paper-raised/40 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-line">
          <div>
            <h2 className="text-xl font-bold text-ink">Hardware Screen Player Activation</h2>
            <p className="text-sm text-ink-muted mt-1">
              Connect a physical Raspberry Pi player to {store.name}. Generates a secure, 15-minute one-time activation code.
            </p>
          </div>

          <div>
            <button
              type="button"
              onClick={handleGenerateActivationCode}
              disabled={isGeneratingCode || store.status !== 'ACTIVE'}
              title={
                store.status !== 'ACTIVE'
                  ? 'Activate the store first to enable device activation'
                  : undefined
              }
              className={`w-full sm:w-auto inline-flex min-h-[48px] items-center justify-center gap-2.5 rounded-pill px-6 py-2.5 text-sm font-bold shadow-md transition-all ${
                store.status === 'ACTIVE'
                  ? 'bg-ink text-paper-raised hover:bg-ink/85 disabled:opacity-50'
                  : 'bg-paper-raised border border-line text-ink-muted cursor-not-allowed opacity-60'
              }`}
            >
              <Play className="h-4 w-4 fill-current" />
              {isGeneratingCode ? 'Generating Code...' : 'Activate Display Device'}
            </button>
          </div>
        </div>

        {store.status !== 'ACTIVE' && (
          <div className="flex items-center gap-3 rounded-xl border border-state-run/40 bg-state-run/10 p-4 text-sm text-ink">
            <ShieldAlert className="h-5 w-5 text-state-run flex-shrink-0" />
            <p>
              This store is currently <span className="font-bold">{store.status || 'inactive'}</span>. Device activation is only permitted when the store is activated. Click <span className="font-bold">&quot;Activate Store&quot;</span> above to enable device activation.
            </p>
          </div>
        )}


        {/* Live 15-Minute Activation Code Card */}
        {pendingActivation && (
          <div className="card p-6 border-2 border-state-run bg-paper shadow-md space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-state-run/20 text-state-run">
                  <Clock className="h-5 w-5 animate-pulse" />
                </span>
                <div>
                  <h3 className="text-lg font-bold text-ink">Activation Code Live (15 Minutes)</h3>
                  <p className="text-xs text-ink-muted">
                    If unactivated within 15 minutes, this code is automatically deleted and will not show as pending.
                  </p>
                </div>
              </div>

              {/* Countdown Timer Display */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 rounded-pill bg-state-run/15 px-4 py-1.5 border border-state-run/30">
                  <Clock className="h-4 w-4 text-state-run" />
                  <span className="font-mono text-base font-extrabold text-state-run">
                    {formatTimer(timeLeftSeconds)}
                  </span>
                  <span className="text-xs text-state-run font-medium">remaining</span>
                </div>

                <button
                  type="button"
                  onClick={() => handleDeactivateDevice(pendingActivation.deviceId, true)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-state-error hover:bg-state-error/10 px-3 py-1.5 rounded-pill border border-state-error/30 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Deactivate Code
                </button>
              </div>
            </div>

            {/* Countdown Progress Bar */}
            <div className="w-full bg-paper-raised rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-state-run h-full transition-all duration-1000 ease-linear rounded-full"
                style={{ width: `${timerPercent}%` }}
              />
            </div>

            {/* Credentials Display */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-line bg-paper-raised/50 p-4 space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                  Auto-Incremented Device ID
                </span>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-2xl font-extrabold text-ink">
                    #{pendingActivation.deviceId}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(pendingActivation.deviceId, 'dev-id')}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-ink hover:underline"
                  >
                    {copiedKey === 'dev-id' ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-state-ok" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" /> Copy
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-state-run/40 bg-state-run/5 p-4 space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-state-run">
                  One-Time Activation Code
                </span>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-2xl font-extrabold tracking-wider text-state-run">
                    {pendingActivation.activationCode}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(pendingActivation.activationCode, 'act-code')}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-state-run hover:underline"
                  >
                    {copiedKey === 'act-code' ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-state-ok" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" /> Copy Code
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Raspberry Pi curl command instruction */}
            <div className="rounded-xl border border-line bg-paper p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-ink">
                  <Terminal className="h-4 w-4 text-ink-muted" />
                  <h4 className="text-xs font-bold uppercase tracking-wider">
                    Raspberry Pi Hardware Activation Command
                  </h4>
                </div>
                <span className="text-xs text-state-ok font-semibold">
                  Returns: &#123; deviceId, ShortLivedToken (3 days), RefreshToken (1 month) &#125;
                </span>
              </div>

              <pre className="overflow-x-auto rounded-lg bg-ink p-4 font-mono text-xs text-paper-raised leading-relaxed">
{`curl -X POST http://localhost:3000/admin/store/activate \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(
    {
      DeviceId: pendingActivation.deviceId,
      ActivationCode: pendingActivation.activationCode,
    },
    null,
    2,
  )}'`}
              </pre>
            </div>
          </div>
        )}
      </div>

      {/* Registered Devices List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-ink">Screen Devices at {store.name}</h2>
            <span className="rounded-full bg-paper-raised px-3 py-0.5 text-xs font-bold text-ink border border-line">
              {activatedDevices.length} Active
            </span>
          </div>
        </div>

        {devices.length === 0 ? (
          <div className="card p-10 text-center border-dashed border-line bg-paper space-y-3">
            <Tv className="mx-auto h-10 w-10 text-ink-muted/40" />
            <h3 className="text-base font-bold text-ink">No devices registered for this store</h3>
            <p className="text-xs text-ink-muted max-w-sm mx-auto">
              Click &quot;Activate Display Device&quot; above to generate a 15-minute activation code for a Raspberry Pi display player.
            </p>
          </div>
        ) : (
          <div className="card overflow-hidden border border-line bg-paper shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line bg-paper-raised/60 text-xs font-bold uppercase tracking-wider text-ink-muted">
                    <th className="px-6 py-4">Device ID</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Registered Date</th>
                    <th className="px-6 py-4">Tokens Issued</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {devices.map((device) => {
                    const isActivated =
                      device.status === 'Activated' || (device.status as string) === 'ACTIVATED';
                    const isPending =
                      device.status === 'Activation Pending' || (device.status as string) === 'PENDING';

                    return (
                      <tr key={device.id} className="hover:bg-paper-raised/40 transition-colors">
                        <td className="px-6 py-4 font-mono font-bold text-ink">
                          #{device.deviceId}
                        </td>
                        <td className="px-6 py-4">
                          {isActivated ? (
                            <span className="inline-flex items-center gap-1.5 rounded-pill bg-state-ok/15 px-3 py-1 text-xs font-bold text-state-ok">
                              <ShieldCheck className="h-3.5 w-3.5" />
                              Activated
                            </span>
                          ) : isPending ? (
                            <span className="inline-flex items-center gap-1.5 rounded-pill bg-state-run/15 px-3 py-1 text-xs font-bold text-state-run">
                              <Clock className="h-3.5 w-3.5" />
                              Awaiting 15-Min Activation
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-pill bg-paper-raised px-3 py-1 text-xs font-bold text-ink-muted">
                              {device.status}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-xs text-ink-muted">
                          {device.createdAt ? new Date(device.createdAt).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-6 py-4 text-xs text-ink-muted">
                          {isActivated ? (
                            <span className="font-mono text-state-ok">
                              ShortLived (3d) &amp; Refresh (1m)
                            </span>
                          ) : (
                            <span className="text-ink-muted italic">Pending activation</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleDeactivateDevice(device.deviceId, isPending)}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-state-error hover:bg-state-error/10 px-3 py-1.5 rounded-pill border border-state-error/30 transition-colors"
                          >
                            <PowerOff className="h-3 w-3" />
                            {isPending ? 'Delete Code' : 'Deactivate'}
                          </button>
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
