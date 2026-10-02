'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, FileVideo } from 'lucide-react';
import Modal from '@/components/ui/Modal';

const STEPS = ['Audience', 'Creative', 'Review'] as const;

const AUDIENCES = [
  'Coffee lovers & professionals',
  'Fitness & health enthusiasts',
  'Fashion & retail shoppers',
  'Students & researchers',
];

interface CampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CampaignModal({ isOpen, onClose }: CampaignModalProps) {
  const [step, setStep] = useState(0);
  const [brand, setBrand] = useState('String Theory');
  const [audience, setAudience] = useState(AUDIENCES[0]);
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'done'>('idle');
  const [brandError, setBrandError] = useState<string | null>(null);

  // Pending timers must not fire after the dialog closes or the step changes.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  useEffect(() => {
    if (!isOpen) {
      setStep(0);
      setUploadState('idle');
      setBrandError(null);
    }
  }, [isOpen]);

  const startUpload = () => {
    setUploadState('uploading');
    timer.current = setTimeout(() => setUploadState('done'), 1600);
  };

  const next = () => {
    if (!brand.trim()) {
      setBrandError('Enter a brand name to continue.');
      return;
    }
    setBrandError(null);
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Start a new campaign"
      description={`Step ${step + 1} of ${STEPS.length} — ${STEPS[step]}`}
    >
      {/* Step indicator. Not colour-only: the current step is named as well as filled. */}
      <ol className="flex items-center gap-2" aria-label="Campaign steps">
        {STEPS.map((label, index) => {
          const isDone = index < step;
          const isCurrent = index === step;
          return (
            <li key={label} className="flex flex-1 flex-col gap-2">
              <span
                className={`h-0.5 rounded-pill transition-colors duration-base ease-out ${
                  isDone || isCurrent ? 'bg-accent' : 'bg-line'
                }`}
                aria-hidden="true"
              />
              <span
                className={`text-[length:var(--type-small)] ${isCurrent ? 'font-semibold text-ink' : 'text-ink-muted'}`}
                aria-current={isCurrent ? 'step' : undefined}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>

      {step === 0 && (
        <div className="mt-7 flex flex-col gap-5">
          <div>
            <label htmlFor="campaign-brand" className="block text-[length:var(--type-small)] font-semibold text-ink">
              Brand name
            </label>
            <input
              id="campaign-brand"
              type="text"
              value={brand}
              onChange={(event) => setBrand(event.target.value)}
              aria-invalid={brandError ? true : undefined}
              aria-describedby={brandError ? 'campaign-brand-error' : undefined}
              className="mt-2 min-h-[48px] w-full rounded-md border border-line-strong bg-paper-raised px-4 text-[length:var(--type-body)] text-ink placeholder:text-ink-muted focus:border-accent"
              placeholder="Your brand"
            />
            {brandError && (
              <p id="campaign-brand-error" className="mt-2 text-[length:var(--type-small)] text-state-error">
                {brandError}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="campaign-audience" className="block text-[length:var(--type-small)] font-semibold text-ink">
              Target audience
            </label>
            <select
              id="campaign-audience"
              value={audience}
              onChange={(event) => setAudience(event.target.value)}
              className="mt-2 min-h-[48px] w-full rounded-md border border-line-strong bg-paper-raised px-4 text-[length:var(--type-body)] text-ink focus:border-accent"
            >
              {AUDIENCES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <p className="rounded-md border border-line bg-paper px-5 py-4 text-[length:var(--type-small)] leading-relaxed text-ink-muted">
            We will surface verified venues whose audience profile fits the one you choose.
          </p>

          <button type="button" onClick={next} className="btn-primary w-full">
            <span>Continue to creative</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="mt-7 flex flex-col gap-5">
          <p className="text-[length:var(--type-small)] font-semibold text-ink">Campaign video</p>

          <button
            type="button"
            onClick={startUpload}
            disabled={uploadState === 'uploading'}
            className="flex min-h-[200px] w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-line-strong bg-paper px-6 py-8 text-center transition-colors duration-fast ease-out hover:border-accent disabled:cursor-not-allowed disabled:opacity-70"
          >
            {uploadState === 'done' ? (
              <>
                <Check className="h-8 w-8 text-state-ok" strokeWidth={1.75} aria-hidden="true" />
                <span className="text-[length:var(--type-body)] font-medium text-ink">
                  summer_drink_30s.mp4
                </span>
                <span className="text-[length:var(--type-small)] font-medium text-state-ok">
                  Approved for every screen
                </span>
              </>
            ) : uploadState === 'uploading' ? (
              <>
                <span
                  className="h-7 w-7 rounded-pill border-2 border-accent border-t-transparent motion-safe:animate-spin"
                  aria-hidden="true"
                />
                <span className="text-[length:var(--type-body)] font-medium text-ink" role="status">
                  Preparing your creative…
                </span>
              </>
            ) : (
              <>
                <FileVideo className="h-8 w-8 text-ink-muted" strokeWidth={1.5} aria-hidden="true" />
                <span className="text-[length:var(--type-body)] font-medium text-ink">
                  Choose a video to upload
                </span>
                <span className="text-[length:var(--type-small)] text-ink-muted">
                  MP4 or MOV · up to 500 MB
                </span>
              </>
            )}
          </button>

          <div className="flex gap-3">
            <button type="button" onClick={() => setStep(0)} className="btn-secondary flex-1">
              Back
            </button>
            <button
              type="button"
              onClick={next}
              disabled={uploadState !== 'done'}
              className="btn-primary flex-[2] disabled:cursor-not-allowed disabled:opacity-45"
            >
              Review campaign
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="mt-7 flex flex-col gap-5">
          <dl className="overflow-hidden rounded-md border border-line">
            {[
              { label: 'Brand', value: brand },
              { label: 'Audience', value: audience },
              { label: 'Video', value: 'Approved for every screen' },
              { label: 'Locations', value: 'Pending selection' },
            ].map((row) => (
              <div
                key={row.label}
                className="flex items-baseline justify-between gap-6 border-b border-line px-4 py-3 last:border-b-0"
              >
                <dt className="shrink-0 text-[length:var(--type-small)] text-ink-muted">{row.label}</dt>
                <dd className="text-right text-[length:var(--type-small)] font-medium text-ink">{row.value}</dd>
              </div>
            ))}
          </dl>

          <p className="text-[length:var(--type-small)] leading-relaxed text-ink-muted">
            This is a product walkthrough. No campaign is created and nothing is charged.
          </p>

          <div className="flex gap-3">
            <button type="button" onClick={() => setStep(1)} className="btn-secondary flex-1">
              Back
            </button>
            <button
              type="button"
              onClick={onClose}
              className="btn-primary flex-[2]"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}