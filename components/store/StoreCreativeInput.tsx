'use client';

import { useState, useRef, type DragEvent } from 'react';
import {
  Upload,
  Check,
  Trash2,
  FileVideo,
  FileImage,
  RefreshCw,
  ExternalLink,
  AlertCircle,
  Film,
  Sparkles,
} from 'lucide-react';
import {
  ACCEPTED_STORE_CREATIVE_LABEL,
  formatBytes,
  getFileExtension,
  isAcceptedStoreCreative,
  isVideoCreative,
  MAX_STORE_CREATIVE_BYTES,
  resolveCreativeMimeType,
} from '@/lib/validation/store-creative';

export interface StoreCreativeInputProps {
  storeId: string;
  storeName?: string;
  initialCreativeUrl?: string | null;
  initialCreativeType?: string | null;
  initialCreativeKey?: string | null;
  onCreativeUpdated?: (creative: {
    url: string;
    key: string;
    mimeType: string;
    bucket: string;
  }) => void;
  onCreativeDeleted?: () => void;
  disabled?: boolean;
}

type UploadState = 'idle' | 'requesting-url' | 'uploading-s3' | 'saving' | 'success' | 'error';

export default function StoreCreativeInput({
  storeId,
  storeName,
  initialCreativeUrl,
  initialCreativeType,
  initialCreativeKey,
  onCreativeUpdated,
  onCreativeDeleted,
  disabled = false,
}: StoreCreativeInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Current active creative state
  const [creativeUrl, setCreativeUrl] = useState<string | null>(initialCreativeUrl ?? null);
  const [creativeType, setCreativeType] = useState<string | null>(initialCreativeType ?? null);
  const [creativeKey, setCreativeKey] = useState<string | null>(initialCreativeKey ?? null);
  const [fileName, setFileName] = useState<string | null>(
    initialCreativeKey ? initialCreativeKey.split('/').pop() ?? null : null,
  );

  const isCurrentVideo = creativeType?.startsWith('video/') ||
    creativeKey?.endsWith('.mp4') ||
    creativeKey?.endsWith('.mkv') ||
    (creativeUrl && (creativeUrl.includes('.mp4') || creativeUrl.includes('.mkv')));

  // Direct upload flow: S3 Presigned PUT
  const handleFileChosen = async (file: File | undefined) => {
    if (!file) return;

    if (!isAcceptedStoreCreative(file.name, file.type)) {
      setErrorMessage(`Please select a ${ACCEPTED_STORE_CREATIVE_LABEL} file.`);
      return;
    }

    if (file.size > MAX_STORE_CREATIVE_BYTES) {
      setErrorMessage(`File size is ${formatBytes(file.size)}. Maximum allowed is 500 MB.`);
      return;
    }

    setErrorMessage(null);
    setUploadState('requesting-url');
    setUploadProgress(15);

    const resolvedMime = resolveCreativeMimeType(file.name, file.type);

    try {
      // 1. Request presigned upload PUT URL from backend
      const presignResponse = await fetch(`/api/stores/${storeId}/creative/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: resolvedMime,
          fileSize: file.size,
        }),
      });

      const presignData = await presignResponse.json();
      if (!presignResponse.ok) {
        throw new Error(presignData.error || 'Failed to generate S3 upload URL.');
      }

      setUploadState('uploading-s3');
      setUploadProgress(40);

      // 2. Upload file directly to S3 via presigned PUT URL
      if (presignData.uploadUrl.includes('mock=true')) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      } else {
        const s3Response = await fetch(presignData.uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': resolvedMime,
          },
          body: file,
        });

        if (!s3Response.ok) {
          throw new Error(`S3 upload failed with status ${s3Response.status}`);
        }
      }

      setUploadState('saving');
      setUploadProgress(85);

      // 3. Persist creative record in PostgreSQL
      const saveResponse = await fetch(`/api/stores/${storeId}/creative`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creativeUrl: presignData.objectUrl,
          creativeKey: presignData.key,
          bucket: presignData.bucket,
          fileName: file.name,
          mimeType: resolvedMime,
          fileSize: file.size,
        }),
      });

      const saveData = await saveResponse.json();
      if (!saveResponse.ok) {
        throw new Error(saveData.error || 'Failed to update store creative record.');
      }

      setUploadProgress(100);
      setUploadState('success');
      setCreativeUrl(presignData.objectUrl);
      setCreativeKey(presignData.key);
      setCreativeType(resolvedMime);
      setFileName(file.name);

      if (onCreativeUpdated) {
        onCreativeUpdated({
          url: presignData.objectUrl,
          key: presignData.key,
          mimeType: resolvedMime,
          bucket: presignData.bucket,
        });
      }

      setTimeout(() => {
        setUploadState('idle');
      }, 2000);
    } catch (err: any) {
      console.error('[StoreCreativeInput] Upload pipeline error:', err);
      setUploadState('error');
      setErrorMessage(err.message || 'Creative ingestion failed. Please try again.');
    }
  };

  const handleRemoveCreative = async () => {
    if (!creativeUrl && !creativeKey) return;
    const confirmed = window.confirm('Are you sure you want to remove this store creative?');
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/stores/${storeId}/creative`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to remove creative.');
      }

      setCreativeUrl(null);
      setCreativeKey(null);
      setCreativeType(null);
      setFileName(null);
      setErrorMessage(null);

      if (onCreativeDeleted) {
        onCreativeDeleted();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Could not delete creative.');
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (disabled || uploadState !== 'idle') return;
    handleFileChosen(event.dataTransfer.files?.[0]);
  };

  const isBusy = uploadState === 'requesting-url' || uploadState === 'uploading-s3' || uploadState === 'saving';

  return (
    <div className="space-y-4">
      {/* Hidden file input supporting PNG, JPEG, JPG, MP4, MKV */}
      <input
        id="store-creative-input"
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,video/mp4,video/x-matroska,video/mkv,.png,.jpg,.jpeg,.mp4,.mkv"
        onChange={(event) => {
          handleFileChosen(event.target.files?.[0]);
          event.target.value = '';
        }}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        disabled={disabled || isBusy}
      />

      {/* Uploading progress overlay */}
      {isBusy && (
        <div className="rounded-xl border border-line bg-paper-raised p-6 shadow-sm space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 font-semibold text-ink">
              <RefreshCw className="h-4 w-4 animate-spin text-accent" />
              {uploadState === 'requesting-url' && 'Generating S3 Presigned URL…'}
              {uploadState === 'uploading-s3' && 'Uploading creative directly to S3…'}
              {uploadState === 'saving' && 'Saving store creative metadata…'}
            </span>
            <span className="font-mono text-xs text-ink-muted">{uploadProgress}%</span>
          </div>

          <div className="h-2 w-full rounded-full bg-paper overflow-hidden border border-line">
            <div
              className="h-full bg-accent transition-all duration-300 ease-out"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Active Creative Display Card */}
      {creativeUrl && !isBusy ? (
        <div className="rounded-xl border border-line bg-paper p-5 space-y-4 transition-all hover:border-line-strong">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-wash text-accent">
                {isCurrentVideo ? (
                  <Film className="h-5 w-5" strokeWidth={1.75} />
                ) : (
                  <FileImage className="h-5 w-5" strokeWidth={1.75} />
                )}
              </span>
              <div>
                <h4 className="text-sm font-bold text-ink">
                  {fileName || 'Ingested Store Creative'}
                </h4>
                <p className="text-xs font-mono text-ink-muted">
                  {creativeType || (isCurrentVideo ? 'video' : 'image')} · Active Custom Creative
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-state-ok/15 px-3 py-1 text-xs font-bold text-state-ok">
                <span className="h-1.5 w-1.5 rounded-full bg-state-ok" />
                Live on Screens
              </span>
            </div>
          </div>

          {/* Media Preview Box */}
          <div className="overflow-hidden rounded-lg border border-line bg-ink/5 max-h-[320px] flex items-center justify-center">
            {isCurrentVideo ? (
              <video
                src={creativeUrl}
                controls
                playsInline
                className="max-h-[300px] w-full rounded-md object-contain bg-black"
              >
                Your browser does not support the video tag.
              </video>
            ) : (
              <img
                src={creativeUrl}
                alt={fileName || 'Store Creative'}
                className="max-h-[300px] w-auto max-w-full rounded-md object-contain"
              />
            )}
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-line">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={disabled || isBusy}
                className="inline-flex min-h-[38px] items-center gap-2 rounded-pill border border-line bg-paper px-4 py-1.5 text-xs font-semibold text-ink hover:border-ink hover:bg-paper-raised transition-all disabled:opacity-50"
              >
                <Upload className="h-3.5 w-3.5" />
                Replace Creative
              </button>

              <button
                type="button"
                onClick={handleRemoveCreative}
                disabled={disabled || isBusy}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-pill border border-state-error/30 bg-paper px-3.5 py-1.5 text-xs font-semibold text-state-error hover:bg-state-error/10 transition-colors disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove
              </button>
            </div>

            <a
              href={creativeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted hover:text-ink transition-colors"
            >
              <span>View S3 Master</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      ) : !isBusy ? (
        /* Dropzone / Upload Input */
        <div
          onDragOver={(event) => {
            event.preventDefault();
            if (!disabled) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`relative rounded-xl border border-dashed bg-paper px-6 py-9 text-center transition-all duration-fast ${
            errorMessage
              ? 'border-state-error bg-state-error/5'
              : dragging
              ? 'border-accent bg-accent-wash/60'
              : 'border-line-strong hover:border-ink'
          }`}
        >
          <div className="flex flex-col items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-paper-raised border border-line text-ink-muted">
              <Upload className="h-5 w-5" strokeWidth={1.75} />
            </span>

            <div>
              <p className="text-sm font-bold text-ink">
                Ingest Store Creative
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                Drag and drop your file here, or browse from device
              </p>
            </div>

            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={disabled || isBusy}
              className="mt-1 inline-flex min-h-[42px] items-center gap-2 rounded-pill bg-ink px-6 py-2 text-xs font-bold text-paper-raised hover:bg-ink/85 transition-all shadow-sm disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              <span>Select Creative File</span>
            </button>

            <p className="text-[11px] text-ink-muted">
              Supports <strong className="text-ink">PNG, JPEG, JPG, MP4, MKV</strong> · Presigned S3 Ingestion · Up to 500 MB
            </p>
          </div>
        </div>
      ) : null}

      {/* Error notification */}
      {errorMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-state-error/40 bg-state-error/10 p-3 text-xs text-state-error">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
}
