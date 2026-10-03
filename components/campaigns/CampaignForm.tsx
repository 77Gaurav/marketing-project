'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, Check, Loader2, RotateCcw } from 'lucide-react';
import { Field, TextArea, TextInput } from '@/components/ui/Field';
import VideoDropzone, { type SelectedVideo } from '@/components/campaigns/VideoDropzone';
import {
  campaignDraftSchema,
  fieldErrorsFrom,
  type CampaignDraft,
} from '@/lib/validation/campaign';

/**
 * The campaign form.
 *
 * Validated with the same zod schema the API route uses, imported from `lib/validation/campaign`.
 * Client-side validation here exists to tell the user which box to fix before they lose a round trip
 * — it is never the thing that decides whether the input is acceptable. The server revalidates the
 * same payload and has the final word.
 *
 * Uploads nothing. The dropzone hands back three properties of a File; see that component for why.
 */

interface CreatedCampaign {
  campaign: { id: string; slug: string; name: string; status: string; createdAt: string };
  brand: { id: string; slug: string; name: string };
  video: { id: string; status: string; fileName: string } | null;
  createdAccount: boolean;
}

const EMPTY_VALUES = {
  brandName: '',
  contactName: '',
  email: '',
  phone: '',
  website: '',
  campaignName: '',
  campaignDescription: '',
};

type FormValues = typeof EMPTY_VALUES;

/** Order matters: the first invalid field in document order is the one that gets focus. */
const FIELD_ORDER = [
  'brandName',
  'contactName',
  'email',
  'phone',
  'website',
  'campaignName',
  'campaignDescription',
  'video',
] as const;

type SubmitState = 'idle' | 'submitting' | 'success';

/**
 * Build the request body and validate it in one step.
 *
 * `video` is flattened from three loose fields into the nested shape the schema expects, which is
 * also the shape the future presigned upload will fill in with real bytes.
 */
function buildPayload(values: FormValues, video: SelectedVideo | null): unknown {
  return {
    ...values,
    video: video ? { fileName: video.name, mimeType: video.type, bytes: video.size } : null,
  };
}

function validate(values: FormValues, video: SelectedVideo | null) {
  const parsed = campaignDraftSchema.safeParse(buildPayload(values, video));
  return parsed.success
    ? { data: parsed.data as CampaignDraft, errors: {} as Record<string, string> }
    : { data: null, errors: fieldErrorsFrom(parsed.error) };
}

export default function CampaignForm() {
  const [values, setValues] = useState<FormValues>(EMPTY_VALUES);
  const [video, setVideo] = useState<SelectedVideo | null>(null);
  const [videoProblem, setVideoProblem] = useState<string | null>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Partial<Record<(typeof FIELD_ORDER)[number], boolean>>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const [state, setState] = useState<SubmitState>('idle');
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedCampaign | null>(null);

  /**
   * Element to focus, applied after React commits.
   *
   * Focus cannot be moved inside the submit handler: at that moment the controls are still
   * `disabled` by the in-flight request, and a disabled element silently refuses focus, so the error
   * would be announced by nothing. A nonce is carried alongside the id so asking for the same target
   * twice in a row is still a state change and still re-runs the effect.
   */
  const [focusRequest, setFocusRequest] = useState<{ id: string; nonce: number } | null>(null);
  const requestFocus = (id: string) =>
    setFocusRequest((current) => ({ id, nonce: (current?.nonce ?? 0) + 1 }));

  useEffect(() => {
    if (!focusRequest) return;
    document.getElementById(focusRequest.id)?.focus();
  }, [focusRequest]);

  const submitting = state === 'submitting';

  const setField = (field: keyof FormValues, value: string) => {
    const next = { ...values, [field]: value };
    setValues(next);
    // Revalidate as the user types so a message clears the moment it is fixed. Display is still
    // gated on `touched`, so nothing appears before a field has been visited or submitted.
    setErrors(validate(next, video).errors);
  };

  const markTouched = (field: (typeof FIELD_ORDER)[number]) => {
    setTouched((current) => ({ ...current, [field]: true }));
  };

  /** An error is shown once its field has been visited, or once submit has been attempted. */
  const errorFor = (field: (typeof FIELD_ORDER)[number]) =>
    submitAttempted || touched[field] ? errors[field] : undefined;

  /** Id of the alert that carries a server-level failure. */
const FORM_ERROR_ID = 'campaign-form-error';

/** Id of the control each field's errors belong to. Most follow `campaign-<field>`; video does not. */
const FIELD_CONTROL_IDS: Record<(typeof FIELD_ORDER)[number], string> = {
  brandName: 'campaign-brandName',
  contactName: 'campaign-contactName',
  email: 'campaign-email',
  phone: 'campaign-phone',
  website: 'campaign-website',
  campaignName: 'campaign-campaignName',
  campaignDescription: 'campaign-campaignDescription',
  video: 'campaign-video-input',
};

/** Focus the first invalid control in document order, or the alert when nothing is invalid. */
  const focusFirstInvalid = (fieldErrors: Record<string, string>) => {
    const first = FIELD_ORDER.find((field) => fieldErrors[field]);
    requestFocus(first ? FIELD_CONTROL_IDS[first] : FORM_ERROR_ID);
  };

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setSubmitAttempted(true);
    setFormError(null);

    const { data, errors: fieldErrors } = validate(values, video);
    setErrors(fieldErrors);

    if (!data) {
      focusFirstInvalid(fieldErrors);
      return;
    }

    setState('submitting');

    try {
      const response = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data),
      });

      const body = (await response.json().catch(() => null)) as
        | (CreatedCampaign & { error?: string; fields?: Record<string, string> })
        | null;

      if (!response.ok) {
        // Field errors from the server win over the local ones: they are authoritative, and the
        // client may have been running an older copy of the schema.
        if (response.status === 422 && body?.fields) {
          setErrors(body.fields);
          focusFirstInvalid(body.fields);
        }
        setFormError(body?.error ?? 'We could not create your campaign. Please try again.');
        setState('idle');
        if (!body?.fields) requestFocus(FORM_ERROR_ID);
        return;
      }

      const createdResult = body as CreatedCampaign;
      
      // If there's a video, upload it to S3 using presigned URL
      if (video && createdResult.video) {
        try {
          const uploadUrlResponse = await fetch('/api/videos/upload-url', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              campaignId: createdResult.campaign.id,
              fileName: video.name,
              mimeType: video.type,
              fileSize: video.size,
            }),
          });

          const uploadUrlData = await uploadUrlResponse.json();
          if (!uploadUrlResponse.ok) {
            throw new Error(uploadUrlData.error || 'Failed to get upload URL');
          }

          // Upload directly to S3
          const file = (document.querySelector('#campaign-video-input') as HTMLInputElement)?.files?.[0];
          if (!file) {
            throw new Error('Video file not found');
          }

          const s3Upload = await fetch(uploadUrlData.uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': video.type },
            body: file,
          });

          if (!s3Upload.ok) {
            throw new Error('Failed to upload video to S3');
          }

          // Complete the upload
          await fetch(`/api/videos/${createdResult.video.id}/complete`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              key: uploadUrlData.key,
              bucket: uploadUrlData.bucket,
            }),
          });

          // Update the brand record with video info
          await fetch(`/api/brands/${createdResult.brand.id}/video`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              videoUrl: uploadUrlData.objectUrl,
              videoKey: uploadUrlData.key,
              bucket: uploadUrlData.bucket,
            }),
          });
        } catch (uploadError) {
          console.error('Video upload failed:', uploadError);
          setFormError(uploadError instanceof Error ? uploadError.message : 'Video upload failed. Campaign was created but video upload failed.');
          setState('idle');
          requestFocus(FORM_ERROR_ID);
          return;
        }
      }

      setCreated(createdResult);
      setState('success');
    } catch {
      setFormError('We could not reach the server. Check your connection and try again.');
      setState('idle');
      requestFocus(FORM_ERROR_ID);
    }
  }

  function reset() {
    setValues(EMPTY_VALUES);
    setVideo(null);
    setVideoProblem(null);
    setErrors({});
    setTouched({});
    setSubmitAttempted(false);
    setFormError(null);
    setCreated(null);
    setState('idle');
  }

  // ---------------------------------------------------------------- success

  if (state === 'success' && created) {
    return (
      <div className="card p-7 sm:p-10">
        <Check className="h-9 w-9 text-state-ok" strokeWidth={1.5} aria-hidden="true" />
        <h2 className="type-display mt-5 text-[length:var(--type-h3)] text-ink">
          Campaign created
        </h2>
        <p className="type-lead mt-4">
          <span className="font-semibold text-ink">{created.campaign.name}</span> is live on
          our side for{' '}
          <span className="font-semibold text-ink">{created.brand.name}</span>. We will be in
          touch about venues and audience matching.
        </p>

        <dl className="mt-8 overflow-hidden rounded-md border border-line">
          {[
            { label: 'Campaign reference', value: created.campaign.id },
            { label: 'Status', value: created.campaign.status.replace(/_/g, ' ').toLowerCase() },
            {
              label: 'Video',
              value: created.video ? `${created.video.fileName} · pending upload` : 'Not attached yet',
            },
          ].map((row) => (
            <div
              key={row.label}
              className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line px-4 py-3 last:border-b-0"
            >
              <dt className="shrink-0 text-[length:var(--type-small)] text-ink-muted">{row.label}</dt>
              <dd className="text-[length:var(--type-small)] font-medium text-ink">{row.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href={`/campaigns/${created.campaign.id}`}
            className="btn-primary flex-1 sm:flex-none"
          >
            <span>View campaign</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <button type="button" onClick={reset} className="btn-secondary">
            <RotateCcw className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            Create another
          </button>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------- form

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      {/*
        Server-level failures land here. `tabIndex={-1}` makes it programmatically focusable so a
        screen reader announces it the moment the request comes back — without it, a submit error
        is silent for anyone not watching the button.
      */}
      {formError && (
        <div
          id={FORM_ERROR_ID}
          tabIndex={-1}
          role="alert"
          className="rounded-md border border-state-error bg-paper px-5 py-4 text-[length:var(--type-body)] text-state-error"
        >
          {formError}
        </div>
      )}

      {/* Brand ------------------------------------------------------------- */}
      <fieldset className="card p-6 sm:p-8">
        <legend className="type-display px-1 text-[length:var(--type-h3)] text-ink">
          Brand information
        </legend>
        <p className="type-small mt-2 text-ink-muted">
          Who we should talk to about this campaign.
        </p>

        <div className="mt-7 grid gap-5 sm:grid-cols-2">
          <Field id="campaign-brandName" label="Brand name" error={errorFor('brandName')}>
            {({ describedBy, invalid }) => (
              <TextInput
                id="campaign-brandName"
                name="brandName"
                type="text"
                autoComplete="organization"
                placeholder="String Theory Coffee"
                value={values.brandName}
                onChange={(event) => setField('brandName', event.target.value)}
                onBlur={() => markTouched('brandName')}
                disabled={submitting}
                required
                describedBy={describedBy}
                invalid={invalid}
              />
            )}
          </Field>

          <Field id="campaign-contactName" label="Contact person" error={errorFor('contactName')}>
            {({ describedBy, invalid }) => (
              <TextInput
                id="campaign-contactName"
                name="contactName"
                type="text"
                autoComplete="name"
                placeholder="Ada Lovelace"
                value={values.contactName}
                onChange={(event) => setField('contactName', event.target.value)}
                onBlur={() => markTouched('contactName')}
                disabled={submitting}
                required
                describedBy={describedBy}
                invalid={invalid}
              />
            )}
          </Field>

          <Field
            id="campaign-email"
            label="Email"
            hint="Where your campaign updates go."
            error={errorFor('email')}
          >
            {({ describedBy, invalid }) => (
              <TextInput
                id="campaign-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="ada@stringtheory.com"
                value={values.email}
                onChange={(event) => setField('email', event.target.value)}
                onBlur={() => markTouched('email')}
                disabled={submitting}
                required
                describedBy={describedBy}
                invalid={invalid}
              />
            )}
          </Field>

          <Field id="campaign-phone" label="Phone number" error={errorFor('phone')}>
            {({ describedBy, invalid }) => (
              <TextInput
                id="campaign-phone"
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+44 20 7946 0000"
                value={values.phone}
                onChange={(event) => setField('phone', event.target.value)}
                onBlur={() => markTouched('phone')}
                disabled={submitting}
                required
                describedBy={describedBy}
                invalid={invalid}
              />
            )}
          </Field>

          <Field
            id="campaign-website"
            label="Website"
            optional
            hint="We add https:// if you leave it off."
            error={errorFor('website')}
          >
            {({ describedBy, invalid }) => (
              <TextInput
                id="campaign-website"
                name="website"
                type="text"
                inputMode="url"
                autoComplete="url"
                placeholder="stringtheory.com"
                value={values.website}
                onChange={(event) => setField('website', event.target.value)}
                onBlur={() => markTouched('website')}
                disabled={submitting}
                describedBy={describedBy}
                invalid={invalid}
              />
            )}
          </Field>
        </div>
      </fieldset>

      {/* Campaign ---------------------------------------------------------- */}
      <fieldset className="card p-6 sm:p-8">
        <legend className="type-display px-1 text-[length:var(--type-h3)] text-ink">
          Campaign
        </legend>
        <p className="type-small mt-2 text-ink-muted">
          What you want to run, and who it is for.
        </p>

        <div className="mt-7 grid gap-5 sm:grid-cols-2">
          <Field
            id="campaign-campaignName"
            label="Campaign name"
            error={errorFor('campaignName')}
          >
            {({ describedBy, invalid }) => (
              <TextInput
                id="campaign-campaignName"
                name="campaignName"
                type="text"
                placeholder="Summer cold brew launch"
                value={values.campaignName}
                onChange={(event) => setField('campaignName', event.target.value)}
                onBlur={() => markTouched('campaignName')}
                disabled={submitting}
                required
                describedBy={describedBy}
                invalid={invalid}
              />
            )}
          </Field>

          <div className="flex items-end">
            <p className="measure pb-1 text-[length:var(--type-small)] leading-relaxed text-ink-muted">
              We match venues on audience first. You pick the screens after this.
            </p>
          </div>

          <Field
            id="campaign-campaignDescription"
            label="Description"
            optional
            error={errorFor('campaignDescription')}
          >
            {({ describedBy, invalid }) => (
              <TextArea
                id="campaign-campaignDescription"
                name="campaignDescription"
                placeholder="What the video says, who it is for, and anything we should know about timing."
                value={values.campaignDescription}
                onChange={(event) => setField('campaignDescription', event.target.value)}
                onBlur={() => markTouched('campaignDescription')}
                disabled={submitting}
                describedBy={describedBy}
                invalid={invalid}
              />
            )}
          </Field>
        </div>
      </fieldset>

      {/* Creative ---------------------------------------------------------- */}
      <fieldset className="card p-6 sm:p-8">
        <legend className="type-display px-1 text-[length:var(--type-h3)] text-ink">
          Video
        </legend>
        <p className="type-small mt-2 text-ink-muted">
          The creative that runs on the screens. You can attach this now or add it from your campaign
          page later.
        </p>

        <div className="mt-7">
          <VideoDropzone
            video={video}
            error={errorFor('video') ?? videoProblem ?? undefined}
            disabled={submitting}
            buttonId="campaign-video-input"
            onChange={(nextVideo, problem) => {
              setVideo(nextVideo);
              setVideoProblem(problem);
              setErrors(validate(values, nextVideo).errors);
              if (nextVideo) markTouched('video');
            }}
          />
        </div>
      </fieldset>

      {/* Submit ------------------------------------------------------------ */}
      <div className="flex flex-col gap-5 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <button type="submit" disabled={submitting} className="btn-primary disabled:opacity-60">
          {submitting ? (
            <>
              <Loader2
                className="h-4 w-4 motion-safe:animate-spin"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <span>Creating campaign…</span>
            </>
          ) : (
            <>
              <span>Create campaign</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </>
          )}
        </button>

        {/* Button label changes are announced here too, so the state is not colour- or
            text-in-the-button-only for someone tabbing away mid-submit. */}
        <p
          role="status"
          aria-live="polite"
          className="text-[length:var(--type-small)] text-ink-muted"
        >
          {submitting ? 'Saving your campaign and brand details.' : 'Nothing is charged at this step.'}
        </p>
      </div>
    </form>
  );
}