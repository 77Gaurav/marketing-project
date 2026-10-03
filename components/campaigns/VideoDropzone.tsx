'use client';

import { useRef, useState, type DragEvent } from 'react';
import { Check, FileVideo, Trash2, Upload } from 'lucide-react';
import {
  ACCEPTED_VIDEO_LABEL,
  formatBytes,
  isAcceptedVideoType,
  MAX_VIDEO_BYTES,
} from '@/lib/validation/campaign';

/**
 * Video picker. Selects a file and reads three properties off it — nothing more.
 *
 * What this component does NOT do, deliberately: it never calls `fetch`, `XMLHttpRequest` or any
 * upload endpoint, never reads the bytes with `FileReader` or `arrayBuffer`, and never produces an
 * object URL. The only thing that leaves this component is `{ name, type, size }`, which travels with
 * the campaign as metadata and lands on a `campaign_videos` row in state AWAITING_UPLOAD.
 *
 * The shape of this component is chosen so the real pipeline drops in without a redesign: the file
 * becomes a `SelectedVideo`, that becomes the request body, and the moment the presigned upload
 * exists this is where `PUT <presigned url>` happens — between selection and `onChange`.
 */

export interface SelectedVideo {
  name: string;
  type: string;
  size: number;
}

interface VideoDropzoneProps {
  video: SelectedVideo | null;
  /**
   * Single exit point. Exactly one of `video` or `problem` is set: a rejected file clears the
   * selection and carries the reason instead, so the control can never show a file it refused.
   */
  onChange: (video: SelectedVideo | null, problem: string | null) => void;
  /** Validation message owned by the form, from the shared zod schema. */
  error?: string;
  disabled?: boolean;
  /**
   * Id on the primary control. The form focuses this after a failed submit so the first invalid
   * field is the one the user lands on — without it, focusing the dropzone silently does nothing.
   */
  buttonId?: string;
}

export default function VideoDropzone({
  video,
  onChange,
  error,
  disabled = false,
  buttonId,
}: VideoDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const message = problem ?? error;

  const accept = (file: File | undefined) => {
    if (!file) return;

    if (!isAcceptedVideoType(file)) {
      onChange(null, `Choose a ${ACCEPTED_VIDEO_LABEL} file.`);
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      onChange(null, `That file is ${formatBytes(file.size)}. The limit is 500 MB.`);
      return;
    }

    // Read metadata only. The File itself is dropped on the floor — it is never uploaded, stored or
    // serialised anywhere.
    setProblem(null);
    onChange({ name: file.name, type: file.type, size: file.size }, null);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    accept(event.dataTransfer.files?.[0]);
  };

  return (
    <div>
      {/* The visible zone is a button so it is reachable by keyboard and announced as an action;
          the file input itself is hidden from AT to avoid a duplicate, focusless stop in the tab
          order. `click()` on the input is what opens the picker. */}
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-lg border border-dashed bg-paper px-6 py-8 transition-colors duration-fast ease-out ${
          message ? 'border-state-error' : dragging ? 'border-accent bg-accent-wash' : 'border-line-strong'
        }`}
      >
        <input
          id={buttonId}
          ref={inputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/x-m4v,video/webm,.mp4,.mov,.m4v,.webm"
          onChange={(event) => {
            accept(event.target.files?.[0]);
            // Reset so picking the same file twice in a row still fires onChange.
            event.target.value = '';
          }}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          disabled={disabled}
        />

        {video ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <Check className="h-7 w-7 text-state-ok" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-[length:var(--type-body)] font-medium text-ink">{video.name}</p>
            <p className="text-[length:var(--type-small)] text-ink-muted">
              {formatBytes(video.size)} · {video.type || 'video file'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={disabled}
                className="btn-secondary min-h-[44px] px-5 text-[length:var(--type-small)]"
              >
                Choose a different file
              </button>
              <button
                type="button"
                onClick={() => {
                  setProblem(null);
                  onChange(null, null);
                }}
                disabled={disabled}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-pill px-4 text-[length:var(--type-small)] text-ink-muted transition-colors duration-fast ease-out hover:text-ink disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-center">
            <FileVideo className="h-7 w-7 text-ink-muted" strokeWidth={1.5} aria-hidden="true" />
            <button
              id={buttonId}
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={disabled}
              className="btn-primary min-h-[44px] px-6 text-[length:var(--type-small)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Upload className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              Upload video
            </button>
            <p className="text-[length:var(--type-small)] text-ink-muted">
              or drag and drop · {ACCEPTED_VIDEO_LABEL} · up to 500 MB
            </p>
          </div>
        )}
      </div>

      {message && (
        <p className="mt-2 text-[length:var(--type-small)] text-state-error">{message}</p>
      )}
    </div>
  );
}