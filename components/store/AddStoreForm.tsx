'use client';

import { useState, useRef, type FormEvent, type ChangeEvent, type DragEvent } from 'react';
import {
  Upload,
  Image as ImageIcon,
  Film,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Tv,
} from 'lucide-react';
import { Field, TextInput, Select } from '@/components/ui/Field';
import { adminStoreSchema, fieldErrorsFrom } from '@/lib/validation/admin';
import {
  isAcceptedStoreCreative,
  isVideoCreative,
  isImageCreative,
  resolveCreativeMimeType,
  formatBytes,
  MAX_STORE_CREATIVE_BYTES,
  ACCEPTED_STORE_CREATIVE_LABEL,
} from '@/lib/validation/store-creative';
import { STORE_STATUSES } from '@/lib/db/types';
import StoreLocationPicker from './StoreLocationPicker';

interface AddStoreFormProps {
  onSaved: (name: string, storeId?: string) => Promise<void> | void;
  onCancel: () => void;
  onError: (message: string) => void;
}

interface SelectedFile {
  file: File;
  previewUrl: string;
  name: string;
  size: number;
  mimeType: string;
}

export default function AddStoreForm({ onSaved, onCancel, onError }: AddStoreFormProps) {
  const [values, setValues] = useState<{
    name: string;
    location: string;
    latitude: number | null;
    longitude: number | null;
    screenCount: string;
    website: string;
    contactName: string;
    contactEmail: string;
    contactPhone: string;
    status: string;
  }>({
    name: '',
    location: '',
    latitude: 12.9716,
    longitude: 77.5946,
    screenCount: '1',
    website: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    status: 'ACTIVE',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [busyMessage, setBusyMessage] = useState<string>('');

  // Selected media creative files
  const [imageFile, setImageFile] = useState<SelectedFile | null>(null);
  const [videoFile, setVideoFile] = useState<SelectedFile | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const set = (key: keyof typeof values) => (value: any) =>
    setValues((current) => ({ ...current, [key]: value }));

  // Handle image selection
  function handleImageSelected(file: File | undefined) {
    if (!file) return;
    setMediaError(null);

    if (!isImageCreative(file.name, file.type)) {
      setMediaError(`Image file must be PNG, JPEG, or JPG.`);
      return;
    }
    if (file.size > MAX_STORE_CREATIVE_BYTES) {
      setMediaError(`Image size is ${formatBytes(file.size)}. Maximum allowed is 500 MB.`);
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setImageFile({
      file,
      previewUrl,
      name: file.name,
      size: file.size,
      mimeType: resolveCreativeMimeType(file.name, file.type),
    });
  }

  // Handle video selection
  function handleVideoSelected(file: File | undefined) {
    if (!file) return;
    setMediaError(null);

    if (!isVideoCreative(file.name, file.type)) {
      setMediaError(`Video file must be MP4 or MKV.`);
      return;
    }
    if (file.size > MAX_STORE_CREATIVE_BYTES) {
      setMediaError(`Video size is ${formatBytes(file.size)}. Maximum allowed is 500 MB.`);
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setVideoFile({
      file,
      previewUrl,
      name: file.name,
      size: file.size,
      mimeType: resolveCreativeMimeType(file.name, file.type),
    });
  }

  function removeImage() {
    if (imageFile) {
      URL.revokeObjectURL(imageFile.previewUrl);
      setImageFile(null);
    }
    if (imageInputRef.current) imageInputRef.current.value = '';
  }

  function removeVideo() {
    if (videoFile) {
      URL.revokeObjectURL(videoFile.previewUrl);
      setVideoFile(null);
    }
    if (videoInputRef.current) videoInputRef.current.value = '';
  }

  // Upload single creative to S3 and save to store record
  async function uploadCreativeToStore(storeId: string, item: SelectedFile, label: string) {
    setBusyMessage(`Requesting presigned upload URL for ${label} under store ${storeId}…`);

    const presignRes = await fetch(`/api/stores/${storeId}/creative/upload-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: item.name,
        mimeType: item.mimeType,
        fileSize: item.size,
      }),
    });

    const presignData = await presignRes.json();
    if (!presignRes.ok) {
      throw new Error(presignData.error || `Failed to generate S3 upload URL for ${label}.`);
    }

    setBusyMessage(`Uploading ${label} to S3 under store ID ${storeId}…`);

    if (presignData.uploadUrl.includes('mock=true')) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    } else {
      const s3Res = await fetch(presignData.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': item.mimeType },
        body: item.file,
      });

      if (!s3Res.ok) {
        throw new Error(`S3 direct upload for ${label} failed with status ${s3Res.status}.`);
      }
    }

    setBusyMessage(`Linking ${label} to store record…`);

    const saveRes = await fetch(`/api/stores/${storeId}/creative`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creativeUrl: presignData.objectUrl,
        creativeKey: presignData.key,
        bucket: presignData.bucket,
        fileName: item.name,
        mimeType: item.mimeType,
        fileSize: item.size,
      }),
    });

    const saveData = await saveRes.json();
    if (!saveRes.ok) {
      throw new Error(saveData.error || `Failed to record ${label} for store.`);
    }

    return saveData;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = adminStoreSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrorsFrom(parsed.error));
      return;
    }

    setErrors({});
    setMediaError(null);
    setBusy(true);
    setBusyMessage('Saving store details…');

    try {
      // 1. Create the store record (Admin only)
      const response = await fetch('/api/admin/stores', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (body.fields) setErrors(body.fields);
        else onError(body.error ?? 'Could not save this store.');
        setBusy(false);
        setBusyMessage('');
        return;
      }

      const createdStore = body.store;
      const storeId = createdStore?.id;

      // 2. Upload Image creative under storeId if provided
      if (imageFile && storeId) {
        try {
          await uploadCreativeToStore(storeId, imageFile, 'store image');
        } catch (uploadErr) {
          console.error('[AddStoreForm] Store image upload failed:', uploadErr);
          onError(
            uploadErr instanceof Error
              ? `Store was created, but image upload failed: ${uploadErr.message}`
              : 'Store was created, but image upload failed.',
          );
        }
      }

      // 3. Upload Video creative under storeId if provided
      if (videoFile && storeId) {
        try {
          await uploadCreativeToStore(storeId, videoFile, 'store video');
        } catch (uploadErr) {
          console.error('[AddStoreForm] Store video upload failed:', uploadErr);
          onError(
            uploadErr instanceof Error
              ? `Store was created, but video upload failed: ${uploadErr.message}`
              : 'Store was created, but video upload failed.',
          );
        }
      }

      // Clean up object URLs
      if (imageFile) URL.revokeObjectURL(imageFile.previewUrl);
      if (videoFile) URL.revokeObjectURL(videoFile.previewUrl);

      await onSaved(parsed.data.name, storeId);
    } catch {
      onError('We could not reach the server. Check your connection and try again.');
      setBusy(false);
      setBusyMessage('');
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="card mt-6 p-6 lg:p-7 space-y-8">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="type-display text-xl font-bold text-ink">Add a Store</h3>
          <span className="rounded-full bg-ink/10 px-2.5 py-0.5 text-xs font-bold text-ink">
            Admin Only
          </span>
        </div>
        <p className="mt-2 text-sm text-ink-muted">
          Register a venue that supplies screens to the network. Creative assets can be uploaded
          directly into S3 partitioned under the generated store ID.
        </p>
      </div>

      {/* Basic Store Information */}
      <div className="grid gap-6 sm:grid-cols-2">
        <Field id="store-name" label="Store name" error={errors.name}>
          {({ describedBy, invalid }) => (
            <TextInput
              id="store-name"
              value={values.name}
              disabled={busy}
              placeholder="e.g. Flagship Store Downtown"
              required
              invalid={invalid}
              describedBy={describedBy}
              onChange={(e) => set('name')(e.target.value)}
            />
          )}
        </Field>

        <div className="sm:col-span-2">
          <StoreLocationPicker
            locationValue={values.location}
            latitudeValue={values.latitude}
            longitudeValue={values.longitude}
            onChangeLocation={(loc) => set('location')(loc)}
            onChangeCoordinates={(lat, lng) => {
              setValues((c) => ({ ...c, latitude: lat, longitude: lng }));
            }}
            disabled={busy}
            error={errors.location}
          />
        </div>

        <Field id="store-screenCount" label="Number of screens" error={errors.screenCount}>
          {({ describedBy, invalid }) => (
            <TextInput
              id="store-screenCount"
              type="number"
              inputMode="numeric"
              min={0}
              max={100000}
              step={1}
              value={values.screenCount}
              disabled={busy}
              required
              invalid={invalid}
              describedBy={describedBy}
              onChange={(e) => set('screenCount')(e.target.value)}
            />
          )}
        </Field>

        <Field id="store-website" label="Website" optional error={errors.website}>
          {({ describedBy, invalid }) => (
            <TextInput
              id="store-website"
              value={values.website}
              disabled={busy}
              placeholder="example.com"
              invalid={invalid}
              describedBy={describedBy}
              onChange={(e) => set('website')(e.target.value)}
            />
          )}
        </Field>

        <Field id="store-contactName" label="Contact name" optional error={errors.contactName}>
          {({ describedBy, invalid }) => (
            <TextInput
              id="store-contactName"
              value={values.contactName}
              disabled={busy}
              placeholder="Store manager or lead contact"
              invalid={invalid}
              describedBy={describedBy}
              onChange={(e) => set('contactName')(e.target.value)}
            />
          )}
        </Field>

        <Field id="store-contactEmail" label="Contact email" error={errors.contactEmail}>
          {({ describedBy, invalid }) => (
            <TextInput
              id="store-contactEmail"
              type="email"
              value={values.contactEmail}
              disabled={busy}
              placeholder="manager@store.com"
              required
              invalid={invalid}
              describedBy={describedBy}
              onChange={(e) => set('contactEmail')(e.target.value)}
            />
          )}
        </Field>

        <Field id="store-contactPhone" label="Contact phone" optional error={errors.contactPhone}>
          {({ describedBy, invalid }) => (
            <TextInput
              id="store-contactPhone"
              type="tel"
              value={values.contactPhone}
              disabled={busy}
              placeholder="+1 555-0199"
              invalid={invalid}
              describedBy={describedBy}
              onChange={(e) => set('contactPhone')(e.target.value)}
            />
          )}
        </Field>

        <div className="space-y-1.5">
          <label htmlFor="store-status" className="block text-sm font-semibold text-ink">
            Store Status
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
                onClick={() => set('status')(option.value)}
                className={`flex min-h-[46px] items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs transition-all ${
                  values.status === option.value ? option.activeClass : option.defaultClass
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${option.dot}`} />
                <span>{option.label}</span>
              </button>
            ))}
          </div>
          {errors.status && <p className="text-xs text-state-error">{errors.status}</p>}
        </div>
      </div>

      {/* Store Creatives Upload Section */}
      <div className="border-t border-line pt-6 space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="type-display text-base font-bold text-ink">Store Creatives</h4>
            <span className="rounded-full bg-accent-wash px-2.5 py-0.5 text-xs font-bold text-accent">
              Image & Video Upload
            </span>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-ink-muted">
            Upload custom image (PNG, JPG, JPEG) or video (MP4, MKV) files for this venue. Files are
            uploaded via S3 presigned PUT URLs directly under{' '}
            <code className="rounded bg-paper-raised px-1 py-0.5 font-mono text-xs border border-line">
              store-creatives/&lt;store-id&gt;/
            </code>
            .
          </p>
        </div>

        {mediaError && (
          <div className="flex items-center gap-2 rounded-md border border-state-error/30 bg-state-error/10 p-3 text-xs text-state-error">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{mediaError}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* 1. Store Image Upload Box */}
          <div className="rounded-xl border border-line bg-paper p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <ImageIcon className="h-4 w-4 text-accent" />
                <span>Store Image (Photo / Banner)</span>
              </div>
              <span className="text-xs text-ink-muted">Optional</span>
            </div>

            {imageFile ? (
              <div className="space-y-3">
                <div className="relative overflow-hidden rounded-lg border border-line bg-paper-raised aspect-video flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageFile.previewUrl}
                    alt="Store Creative Preview"
                    className="max-h-full max-w-full object-contain"
                  />
                  <div className="absolute top-2 right-2">
                    <button
                      type="button"
                      onClick={removeImage}
                      disabled={busy}
                      className="inline-flex items-center justify-center rounded-full bg-paper/90 p-1.5 text-ink hover:bg-state-error hover:text-paper-raised transition-colors shadow-sm"
                      title="Remove image"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-ink-muted">
                  <span className="font-mono truncate max-w-[200px]">{imageFile.name}</span>
                  <span className="font-medium">{formatBytes(imageFile.size)}</span>
                </div>
              </div>
            ) : (
              <div
                onClick={() => imageInputRef.current?.click()}
                className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-line p-6 text-center hover:border-ink/40 hover:bg-paper-raised/40 transition-all cursor-pointer group"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-paper-raised text-ink-muted group-hover:text-ink transition-colors">
                  <Upload className="h-5 w-5" />
                </div>
                <p className="mt-2 text-xs font-semibold text-ink">
                  Click to select a store image
                </p>
                <p className="mt-1 text-[11px] text-ink-muted">PNG, JPG, or JPEG up to 500 MB</p>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg"
                  className="hidden"
                  disabled={busy}
                  onChange={(e) => handleImageSelected(e.target.files?.[0])}
                />
              </div>
            )}
          </div>

          {/* 2. Store Video Upload Box */}
          <div className="rounded-xl border border-line bg-paper p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Film className="h-4 w-4 text-accent" />
                <span>Store Video (Screen Creative)</span>
              </div>
              <span className="text-xs text-ink-muted">Optional</span>
            </div>

            {videoFile ? (
              <div className="space-y-3">
                <div className="relative overflow-hidden rounded-lg border border-line bg-black aspect-video flex items-center justify-center">
                  <video
                    src={videoFile.previewUrl}
                    controls
                    className="max-h-full max-w-full"
                  />
                  <div className="absolute top-2 right-2">
                    <button
                      type="button"
                      onClick={removeVideo}
                      disabled={busy}
                      className="inline-flex items-center justify-center rounded-full bg-paper/90 p-1.5 text-ink hover:bg-state-error hover:text-paper-raised transition-colors shadow-sm"
                      title="Remove video"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-ink-muted">
                  <span className="font-mono truncate max-w-[200px]">{videoFile.name}</span>
                  <span className="font-medium">{formatBytes(videoFile.size)}</span>
                </div>
              </div>
            ) : (
              <div
                onClick={() => videoInputRef.current?.click()}
                className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-line p-6 text-center hover:border-ink/40 hover:bg-paper-raised/40 transition-all cursor-pointer group"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-paper-raised text-ink-muted group-hover:text-ink transition-colors">
                  <Upload className="h-5 w-5" />
                </div>
                <p className="mt-2 text-xs font-semibold text-ink">
                  Click to select a store video
                </p>
                <p className="mt-1 text-[11px] text-ink-muted">MP4 or MKV up to 500 MB</p>
                <input
                  ref={videoInputRef}
                  type="file"
                  accept="video/mp4,video/x-matroska,.mp4,.mkv"
                  className="hidden"
                  disabled={busy}
                  onChange={(e) => handleVideoSelected(e.target.files?.[0])}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Progress Message */}
      {busy && busyMessage && (
        <div className="flex items-center gap-3 rounded-lg border border-accent/20 bg-accent-wash/30 p-3.5 text-xs text-accent">
          <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
          <span className="font-medium">{busyMessage}</span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-pill bg-ink px-7 text-sm font-semibold text-paper-raised transition-all hover:bg-ink/85 disabled:cursor-not-allowed disabled:opacity-60 shadow-sm"
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Saving Store…</span>
            </>
          ) : (
            'Add store'
          )}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="inline-flex min-h-[44px] items-center justify-center rounded-pill border border-line-strong px-7 text-sm font-medium text-ink-muted transition-all hover:border-ink/30 hover:text-ink disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
