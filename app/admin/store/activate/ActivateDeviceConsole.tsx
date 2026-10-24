'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Check,
  Copy,
  Database,
  Lock,
  Plus,
  Radio,
  RefreshCw,
  Store as StoreIcon,
  Terminal,
  Tv,
} from 'lucide-react';
import type { StoreListEntry, Device } from '@/lib/db/types';

interface ActivateDeviceConsoleProps {
  admin: { fullName: string; email: string };
  stores: StoreListEntry[];
  initialDevices: (Device & { storeName?: string; storeSlug?: string })[];
}

export default function ActivateDeviceConsole({
  admin,
  stores,
  initialDevices,
}: ActivateDeviceConsoleProps) {
  const [devices, setDevices] = useState(initialDevices);
  const [selectedStoreId, setSelectedStoreId] = useState<string>(
    stores.find((s) => s.status === 'ACTIVE')?.id || stores[0]?.id || '',
  );

  // Pending devices filter
  const pendingDevices = devices.filter(
    (d) => d.status === 'Activation Pending' || d.status === 'PENDING',
  );

  // Selected device for activation
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(
    pendingDevices[0] || null,
  );

  // Manual or prefilled activation code
  const [activationCode, setActivationCode] = useState<string>(
    pendingDevices[0]?.activationCode || '',
  );

  // Loading & status states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [notification, setNotification] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);

  // Activation Result
  const [activationResult, setActivationResult] = useState<{
    deviceID: string;
    status: string;
    shortlived?: string;
    longlived?: string;
  } | null>(null);

  function handleCopy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  // Refresh devices from server
  async function refreshDevices() {
    try {
      const res = await fetch('/api/admin/store/devices');
      if (res.ok) {
        const data = await res.json();
        if (data.devices) setDevices(data.devices);
      }
    } catch (err) {
      console.error('Failed to refresh devices:', err);
    }
  }

  // Generate a new pending code from database sequence
  async function handleGenerateNewCode() {
    if (!selectedStoreId) {
      setNotification({ message: 'Please select an active store first.', type: 'error' });
      return;
    }

    setIsGenerating(true);
    setNotification(null);
    setActivationResult(null);

    try {
      const res = await fetch('/api/admin/store/devices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ storeId: selectedStoreId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to allocate new device code.');
      }

      setNotification({
        message: `Auto-incremented Device #${data.deviceId} created from database sequence! Code: ${data.activationCode}`,
        type: 'success',
      });

      await refreshDevices();

      // Auto-select this newly created device
      const newDev: any = {
        deviceId: String(data.deviceId),
        activationCode: data.activationCode,
        status: data.status,
        storeId: data.storeId,
        expiresAt: data.expiresAt,
      };
      setSelectedDevice(newDev);
      setActivationCode(data.activationCode);
    } catch (err: any) {
      setNotification({
        message: err.message || 'Error generating new device code.',
        type: 'error',
      });
    } finally {
      setIsGenerating(false);
    }
  }

  // Submit activation to /admin/store/activate
  async function handleActivateSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!selectedDevice?.deviceId) {
      setNotification({
        message: 'No device selected. Please select or generate a pending device first.',
        type: 'error',
      });
      return;
    }

    if (!activationCode.trim()) {
      setNotification({
        message: 'Activation code is required.',
        type: 'error',
      });
      return;
    }

    setIsSubmitting(true);
    setNotification(null);
    setActivationResult(null);

    try {
      const res = await fetch('/admin/store/activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          DeviceId: selectedDevice.deviceId,
          ActivationCode: activationCode.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Device activation failed.');
      }

      setActivationResult(data);
      setNotification({
        message: `Device #${data.deviceID} successfully activated at /admin/store/activate!`,
        type: 'success',
      });

      await refreshDevices();
    } catch (err: any) {
      setNotification({
        message: err.message || 'Activation failed. Please check the code.',
        type: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const activeStores = stores.filter((s) => s.status === 'ACTIVE');

  return (
    <div className="space-y-10 max-w-5xl mx-auto">
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
          <Link
            href="/admin/store"
            className="font-medium hover:text-ink transition-colors"
          >
            Stores
          </Link>
          <span className="text-line-strong">/</span>
          <span className="font-semibold text-ink">Device Activation</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-paper border border-line px-3 py-1 text-xs text-ink-muted font-mono">
            POST /admin/store/activate
          </span>
        </div>
      </div>

      {/* Page Title */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5">
          <Radio className="h-4 w-4 text-ink-muted" />
          Hardware Screen Player Activation
        </p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
          Device Activation Console
        </h1>
        <p className="mt-2 text-sm text-ink-muted leading-relaxed max-w-2xl">
          Simulate or execute hardware player activation via{' '}
          <code className="font-mono font-semibold text-ink bg-paper-raised px-1.5 py-0.5 rounded border border-line">
            /admin/store/activate
          </code>
          . Device IDs are auto-incremented by the database sequence and displayed as read-only.
        </p>
      </div>

      {/* Global Notification Banner */}
      {notification && (
        <div
          role="alert"
          className={`flex items-center justify-between rounded-xl p-4 text-xs font-medium border ${
            notification.type === 'success'
              ? 'bg-state-ok/10 border-state-ok/30 text-state-ok'
              : 'bg-state-error/10 border-state-error/30 text-state-error'
          }`}
        >
          <span>{notification.message}</span>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="ml-4 font-bold hover:underline"
          >
            &times;
          </button>
        </div>
      )}

      {/* Step 1: Select or Generate Pending Device */}
      <div className="rounded-2xl border border-line bg-paper-raised p-6 shadow-float space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-line pb-4">
          <div>
            <h2 className="text-base font-bold text-ink flex items-center gap-2">
              <Database className="h-4 w-4 text-ink-muted" />
              1. Database Device Selection
            </h2>
            <p className="text-xs text-ink-muted mt-0.5">
              Select an existing pending activation code or allocate a new auto-incremented ID.
            </p>
          </div>

          {/* Quick Generate Code from Store */}
          <div className="flex items-center gap-2">
            <select
              value={selectedStoreId}
              onChange={(e) => setSelectedStoreId(e.target.value)}
              className="rounded-pill border border-line bg-paper px-3 py-1.5 text-xs font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-ink"
            >
              {activeStores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name} ({store.location})
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleGenerateNewCode}
              disabled={isGenerating || activeStores.length === 0}
              className="inline-flex items-center gap-1.5 rounded-pill bg-ink px-4 py-1.5 text-xs font-semibold text-paper-raised hover:bg-ink/85 disabled:opacity-40 transition-colors shadow-sm shrink-0"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  Allocating...
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" />
                  Allocate Next ID
                </>
              )}
            </button>
          </div>
        </div>

        {/* Pending Devices Picker */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-ink-muted mb-2">
            Pending Hardware Activations ({pendingDevices.length})
          </label>

          {pendingDevices.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line p-6 text-center bg-paper">
              <Tv className="mx-auto h-6 w-6 text-ink-muted/50" />
              <p className="mt-2 text-xs font-semibold text-ink">No pending activation codes in database.</p>
              <p className="mt-0.5 text-xs text-ink-muted">
                Click &ldquo;Allocate Next ID&rdquo; above to generate the next auto-incremented device from an active store.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {pendingDevices.map((dev) => {
                const isSelected = selectedDevice?.deviceId === dev.deviceId;
                return (
                  <button
                    key={dev.deviceId}
                    type="button"
                    onClick={() => {
                      setSelectedDevice(dev);
                      setActivationCode(dev.activationCode || '');
                      setActivationResult(null);
                    }}
                    className={`text-left p-3.5 rounded-xl border transition-all ${
                      isSelected
                        ? 'border-ink bg-paper ring-2 ring-ink/20 shadow-sm'
                        : 'border-line bg-paper hover:border-ink/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-base font-extrabold text-ink">
                        #{dev.deviceId}
                      </span>
                      <span className="rounded-pill bg-state-run/15 text-state-run px-2 py-0.5 text-[10px] font-bold">
                        Pending
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-medium text-ink truncate">
                      {dev.storeName || 'Venue screen'}
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-ink-muted">
                      Code: {dev.activationCode}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Step 2: The Activation Form with Read-Only Device ID */}
      <form
        onSubmit={handleActivateSubmit}
        className="rounded-2xl border border-line bg-paper-raised p-6 shadow-float space-y-6"
      >
        <div className="border-b border-line pb-4">
          <h2 className="text-base font-bold text-ink flex items-center gap-2">
            <Radio className="h-4 w-4 text-ink-muted" />
            2. Send Activation Payload
          </h2>
          <p className="text-xs text-ink-muted mt-0.5">
            Submit credentials to{' '}
            <code className="font-mono font-semibold text-ink bg-paper px-1.5 py-0.5 rounded border border-line">
              POST /admin/store/activate
            </code>
            .
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {/* Read-Only Auto-Incremented Device ID */}
          <div className="space-y-1.5">
            <label className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-ink">
              <span className="flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-state-run" />
                Auto-Incremented Device ID
              </span>
              <span className="text-[11px] font-semibold text-state-run lowercase">
                (read-only &bull; locked)
              </span>
            </label>

            <div className="relative">
              <input
                type="text"
                readOnly
                disabled
                value={selectedDevice ? `#${selectedDevice.deviceId}` : 'No device selected'}
                className="w-full rounded-xl border border-line bg-paper/80 px-4 py-3 font-mono text-base font-extrabold text-ink cursor-not-allowed select-none shadow-inner"
              />
              <div className="absolute right-3 top-3.5 flex items-center gap-1.5 text-xs font-medium text-ink-muted">
                <Lock className="h-3.5 w-3.5 text-ink-muted" />
                <span>Sequence Locked</span>
              </div>
            </div>

            <p className="text-[11px] text-ink-muted leading-relaxed">
              Auto-generated from PostgreSQL sequence <code className="font-mono text-ink">device_id_seq</code>.
              This value cannot be modified.
            </p>
          </div>

          {/* One-Time Activation Code Field */}
          <div className="space-y-1.5">
            <label className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-ink">
              <span>One-Time Activation Code</span>
              <span className="text-[11px] text-ink-muted lowercase">
                (valid 15 mins)
              </span>
            </label>

            <input
              type="text"
              required
              placeholder="e.g. ACT-X79K2P"
              value={activationCode}
              onChange={(e) => setActivationCode(e.target.value.toUpperCase())}
              className="w-full rounded-xl border border-line bg-paper px-4 py-3 font-mono text-base font-extrabold text-ink tracking-wider focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
            />

            <p className="text-[11px] text-ink-muted leading-relaxed">
              The 6-character cryptographic code generated for this hardware player.
            </p>
          </div>
        </div>

        {/* Submit & Simulate Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-line">
          <p className="text-xs text-ink-muted">
            Sends JSON <code className="font-mono text-ink">&#123; DeviceId, ActivationCode &#125;</code> to backend.
          </p>

          <button
            type="submit"
            disabled={isSubmitting || !selectedDevice || !activationCode.trim()}
            className="inline-flex items-center gap-2 rounded-pill bg-ink px-6 py-2.5 text-xs font-semibold text-paper-raised hover:bg-ink/85 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                Activating Player...
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5" />
                Activate Device via /admin/store/activate
              </>
            )}
          </button>
        </div>
      </form>

      {/* Step 3: Activation Result (Tokens) */}
      {activationResult && (
        <div className="rounded-2xl border border-state-ok/40 bg-state-ok/5 p-6 shadow-float space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-state-ok">
              <Check className="h-5 w-5" />
              <h3 className="text-base font-bold">
                Device #{activationResult.deviceID} Activated Successfully
              </h3>
            </div>
            <span className="rounded-pill bg-state-ok px-3 py-1 text-xs font-bold text-paper-raised">
              {activationResult.status}
            </span>
          </div>

          <p className="text-xs text-ink-muted">
            The hardware player has been provisioned with Dual Tokens. Raspberry Pi players use these tokens for polling tasks and refreshing sessions:
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Short-Lived Access Token */}
            <div className="rounded-xl border border-line bg-paper p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                  Short-Lived Access Token (3 Days)
                </span>
                {activationResult.shortlived && (
                  <button
                    type="button"
                    onClick={() => handleCopy(activationResult.shortlived!, 'res-short')}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-ink hover:underline"
                  >
                    {copiedKey === 'res-short' ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-state-ok" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" /> Copy
                      </>
                    )}
                  </button>
                )}
              </div>
              <p className="font-mono text-xs text-ink bg-paper-raised p-2 rounded border border-line break-all">
                {activationResult.shortlived || 'Issued'}
              </p>
            </div>

            {/* Long-Lived Refresh Token */}
            <div className="rounded-xl border border-line bg-paper p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                  Long-Lived Refresh Token (1 Month)
                </span>
                {activationResult.longlived && (
                  <button
                    type="button"
                    onClick={() => handleCopy(activationResult.longlived!, 'res-long')}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-ink hover:underline"
                  >
                    {copiedKey === 'res-long' ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-state-ok" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" /> Copy
                      </>
                    )}
                  </button>
                )}
              </div>
              <p className="font-mono text-xs text-ink bg-paper-raised p-2 rounded border border-line break-all">
                {activationResult.longlived || 'Issued'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Terminal Command for Raspberry Pi */}
      <div className="rounded-2xl border border-line bg-paper p-6 shadow-float space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-ink">
            <Terminal className="h-4 w-4 text-ink-muted" />
            <h3 className="text-xs font-bold uppercase tracking-wider">
              Raspberry Pi Terminal Activation Command
            </h3>
          </div>
          <span className="text-xs text-ink-muted font-mono">
            POST /admin/store/activate
          </span>
        </div>

        <p className="text-xs text-ink-muted leading-relaxed">
          To simulate the activation directly from the Raspberry Pi hardware player terminal, run:
        </p>

        <pre className="overflow-x-auto rounded-xl bg-ink p-4 font-mono text-xs text-paper-raised leading-relaxed">
{`curl -X POST http://localhost:3000/admin/store/activate \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(
    {
      DeviceId: selectedDevice?.deviceId || '1',
      ActivationCode: activationCode || 'ACT-XXXXXX',
    },
    null,
    2,
  )}'`}
        </pre>
      </div>
    </div>
  );
}
