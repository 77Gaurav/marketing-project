'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Check,
  Clock,
  Copy,
  Lock,
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
  Compass,
  Save,
} from 'lucide-react';
import type { Store, Device } from '@/lib/db/types';
import StoreCreativeInput from '@/components/store/StoreCreativeInput';
import StoreLocationPicker from '@/components/store/StoreLocationPicker';

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
  const [isSimulatingActivation, setIsSimulatingActivation] = useState(false);
  const [notification, setNotification] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  const [isSavingLocation, setIsSavingLocation] = useState(false);
  const [locationDraft, setLocationDraft] = useState(initialStore.location || '');
  const [latitudeDraft, setLatitudeDraft] = useState<number | null>(initialStore.latitude ?? 12.9716);
  const [longitudeDraft, setLongitudeDraft] = useState<number | null>(initialStore.longitude ?? 77.5946);
  const [locationSavedNotice, setLocationSavedNotice] = useState<string | null>(null);

  async function handleSaveLocationCoordinates() {
    setIsSavingLocation(true);
    setLocationSavedNotice(null);
    try {
      const res = await fetch(`/api/admin/stores/${store.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: locationDraft,
          latitude: latitudeDraft,
          longitude: longitudeDraft,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update store location.');
      }

      const data = await res.json();
      if (data.store) {
        setStore((prev) => ({
          ...prev,
          location: data.store.location,
          latitude: data.store.latitude,
          longitude: data.store.longitude,
          coordinates: data.store.coordinates,
        }));
      }

      setLocationSavedNotice('Location and OpenFreeMap coordinates updated!');
      setTimeout(() => setLocationSavedNotice(null), 4000);
    } catch (err: any) {
      setNotification({
        message: err.message || 'Could not save location.',
        type: 'error',
      });
    } finally {
      setIsSavingLocation(false);
    }
  }

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

  // Change Store status (Active / Pending / Deactivated)
  async function handleChangeStoreStatus(targetStatus: string) {
    setIsActivatingStore(true);
    setNotification(null);

    try {
      const res = await fetch(`/api/admin/stores/${store.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: targetStatus }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update store status');
      }

      setStore(data.store);
      if (targetStatus !== 'ACTIVE') {
        setPendingActivation(null);
      }

      setNotification({
        message: `Store status set to ${
          targetStatus === 'ACTIVE' ? 'Active' : targetStatus === 'PENDING' ? 'Pending' : 'Deactivated'
        }.`,
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

  // Simulate Device Activation via /admin/store/activate
  async function handleSimulateActivation() {
    if (!pendingActivation) return;

    setIsSimulatingActivation(true);
    setNotification(null);

    try {
      const res = await fetch('/admin/store/activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          DeviceId: pendingActivation.deviceId,
          ActivationCode: pendingActivation.activationCode,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Activation failed');
      }

      setNotification({
        message: `Device #${data.deviceID} activated successfully at /admin/store/activate!`,
        type: 'success',
      });
      setPendingActivation(null);
      await refreshData();
    } catch (err: any) {
      setNotification({
        message: err.message || 'Could not activate device.',
        type: 'error',
      });
    } finally {
      setIsSimulatingActivation(false);
    }
  }

  // Delete Device or Pending Code
  async function handleDeleteDevice(deviceId: string, isPending: boolean) {
    const confirmMessage = isPending
      ? 'Are you sure you want to cancel and delete this pending activation code?'
      : `Are you sure you want to delete Device #${deviceId}? This will permanently remove it from the database.`;

    if (!window.confirm(confirmMessage)) return;

    try {
      const res = await fetch('/api/admin/store/devices', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete device');
      }

      if (pendingActivation?.deviceId === deviceId) {
        setPendingActivation(null);
      }

      setNotification({
        message: isPending
          ? `Pending activation code for Device #${deviceId} deleted.`
          : `Device #${deviceId} deleted completely.`,
        type: 'success',
      });

      await refreshData();
    } catch (err: any) {
      setNotification({
        message: err.message || 'Failed to delete device.',
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
                Active
              </span>
            ) : store.status === 'PENDING' || store.status === 'PENDING_REVIEW' ? (
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-state-run/15 px-3 py-1 text-xs font-bold text-state-run">
                <span className="h-1.5 w-1.5 rounded-full bg-state-run" />
                Pending
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-state-error/15 px-3 py-1 text-xs font-bold text-state-error">
                <span className="h-1.5 w-1.5 rounded-full bg-state-error" />
                Deactivated
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
            {store.latitude != null && store.longitude != null && (
              <>
                <span>•</span>
                <div className="flex items-center gap-1.5 font-mono text-xs text-ink-muted">
                  <Compass className="h-3.5 w-3.5 text-state-ok" />
                  <span>
                    BLR: {Number(store.latitude).toFixed(4)}, {Number(store.longitude).toFixed(4)}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Store Status Selection (Active / Pending / Deactivated) */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line-strong bg-paper p-1.5 shadow-xs">
          {[
            {
              value: 'ACTIVE',
              label: 'Active',
              dot: 'bg-state-ok',
              activeClass: 'border-state-ok bg-state-ok/15 text-state-ok font-bold shadow-xs',
              defaultClass: 'border-transparent text-ink-muted hover:text-ink hover:bg-paper-raised',
            },
            {
              value: 'PENDING',
              label: 'Pending',
              dot: 'bg-state-run',
              activeClass: 'border-state-run bg-state-run/15 text-state-run font-bold shadow-xs',
              defaultClass: 'border-transparent text-ink-muted hover:text-ink hover:bg-paper-raised',
            },
            {
              value: 'DEACTIVATED',
              label: 'Deactivated',
              dot: 'bg-state-error',
              activeClass: 'border-state-error bg-state-error/15 text-state-error font-bold shadow-xs',
              defaultClass: 'border-transparent text-ink-muted hover:text-ink hover:bg-paper-raised',
            },
          ].map((item) => {
            const isCurrent =
              store.status === item.value ||
              (item.value === 'PENDING' && store.status === 'PENDING_REVIEW') ||
              (item.value === 'DEACTIVATED' && (store.status === 'PAUSED' || store.status === 'CLOSED'));
            return (
              <button
                key={item.value}
                type="button"
                disabled={isActivatingStore}
                onClick={() => handleChangeStoreStatus(item.value)}
                className={`flex items-center gap-1.5 rounded-lg border px-3.5 py-1.5 text-xs transition-all ${
                  isCurrent ? item.activeClass : item.defaultClass
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${item.dot}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
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
              This store is currently <span className="font-bold">{store.status === 'PENDING' || store.status === 'PENDING_REVIEW' ? 'Pending' : 'Deactivated'}</span>. Device activation is only permitted when the store is activated. Click <span className="font-bold">&quot;Activate Store&quot;</span> above to enable device activation.
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
                  onClick={() => handleDeleteDevice(pendingActivation.deviceId, true)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-state-error hover:bg-state-error/10 px-3 py-1.5 rounded-pill border border-state-error/30 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete Code
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
                <span className="text-xs font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-state-run" />
                  Auto-Incremented Device ID (Read-only)
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
                <p className="text-[11px] text-ink-muted">
                  Auto-generated from database sequence. Locked and non-editable.
                </p>
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
                <p className="text-[11px] text-ink-muted">
                  Expires in 15 minutes. Send to /admin/store/activate to provision player.
                </p>
              </div>
            </div>

            {/* Raspberry Pi curl command instruction & Test Trigger */}
            <div className="rounded-xl border border-line bg-paper p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-ink">
                  <Terminal className="h-4 w-4 text-ink-muted" />
                  <h4 className="text-xs font-bold uppercase tracking-wider">
                    Raspberry Pi Hardware Activation Command
                  </h4>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href="/admin/store/activate"
                    className="text-xs font-semibold text-ink hover:underline"
                  >
                    Open /admin/store/activate &rarr;
                  </Link>
                  <button
                    type="button"
                    onClick={handleSimulateActivation}
                    disabled={isSimulatingActivation}
                    className="inline-flex items-center gap-1.5 rounded-pill bg-ink px-3 py-1 text-xs font-semibold text-paper-raised hover:bg-ink/85 disabled:opacity-50 transition-colors shadow-sm"
                  >
                    {isSimulatingActivation ? (
                      <>
                        <RefreshCw className="h-3 w-3 animate-spin" />
                        Activating...
                      </>
                    ) : (
                      <>
                        <Check className="h-3 w-3" />
                        Simulate Activation
                      </>
                    )}
                  </button>
                </div>
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

      {/* Store Geographic Location & OpenFreeMap Bengaluru */}
      <div className="card p-7 border-line bg-paper-raised/40 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-line">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-ink">Store Location & OpenFreeMap</h2>
              <span className="rounded-full bg-ink/10 px-2.5 py-0.5 text-xs font-bold text-ink">
                Bengaluru Centered
              </span>
            </div>
            <p className="text-sm text-ink-muted mt-1">
              Interactive OpenFreeMap vector map for {store.name}. Convert address to Longitude and Latitude coordinates, or click the map to place the venue pin.
            </p>
          </div>

          <button
            type="button"
            onClick={handleSaveLocationCoordinates}
            disabled={isSavingLocation}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-pill bg-ink px-6 text-sm font-semibold text-paper-raised hover:bg-ink/85 disabled:opacity-50 transition-all shadow-sm"
          >
            {isSavingLocation ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            <span>{isSavingLocation ? 'Saving Coordinates…' : 'Save Coordinates'}</span>
          </button>
        </div>

        {locationSavedNotice && (
          <div className="flex items-center gap-2 rounded-md border border-state-ok/30 bg-state-ok/10 px-4 py-3 text-sm text-state-ok">
            <Check className="h-4 w-4 shrink-0" />
            <span>{locationSavedNotice}</span>
          </div>
        )}

        <StoreLocationPicker
          locationValue={locationDraft}
          latitudeValue={latitudeDraft}
          longitudeValue={longitudeDraft}
          onChangeLocation={setLocationDraft}
          onChangeCoordinates={(lat, lng) => {
            setLatitudeDraft(lat);
            setLongitudeDraft(lng);
          }}
        />
      </div>

      {/* Store Custom Creatives Section */}
      <div className="card p-7 border-line bg-paper-raised/40 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-line">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-ink">Store Creatives</h2>
              <span className="rounded-full bg-accent-wash px-2.5 py-0.5 text-xs font-bold text-accent">
                Venue Media
              </span>
            </div>
            <p className="text-sm text-ink-muted mt-1">
              Ingest custom venue creatives (PNG, JPEG, JPG, MP4, or MKV) for {store.name} screens using direct presigned S3 upload.
            </p>
          </div>
        </div>

        <StoreCreativeInput
          storeId={store.id}
          storeName={store.name}
          initialCreativeUrl={store.creativeUrl || store.videoUrl}
          initialCreativeType={store.creativeType}
          initialCreativeKey={store.creativeKey || store.videoKey}
          onCreativeUpdated={(creative) => {
            setStore((prev) => ({
              ...prev,
              creativeUrl: creative.url,
              creativeKey: creative.key,
              creativeType: creative.mimeType,
              creativeBucket: creative.bucket,
              ...(creative.mimeType.startsWith('video/') || creative.key.endsWith('.mp4') || creative.key.endsWith('.mkv')
                ? {
                    videoUrl: creative.url,
                    videoKey: creative.key,
                    videoBucket: creative.bucket,
                  }
                : {}),
            }));
            setNotification({
              message: 'Store creative ingested and updated successfully!',
              type: 'success',
            });
          }}
          onCreativeDeleted={() => {
            setStore((prev) => ({
              ...prev,
              creativeUrl: null,
              creativeKey: null,
              creativeType: null,
              creativeBucket: null,
              videoUrl: null,
              videoKey: null,
              videoBucket: null,
            }));
            setNotification({
              message: 'Store creative removed successfully.',
              type: 'info',
            });
          }}
        />
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
                            onClick={() => handleDeleteDevice(device.deviceId, isPending)}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-state-error hover:bg-state-error/10 px-3 py-1.5 rounded-pill border border-state-error/30 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {isPending ? 'Delete Code' : 'Delete Device'}
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
