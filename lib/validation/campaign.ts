import { z } from 'zod';
import {
  DESCRIPTION_LIMIT,
  emailField,
  fieldErrorsFrom,
  nameField,
  phoneField,
  websiteField,
} from '@/lib/validation/fields';

/**
 * The campaign form contract.
 *
 * Imported by both the client form and the API route, so a field cannot be valid in the browser and
 * invalid on the server, or the reverse. That is the whole reason this file exists instead of a
 * regex in a component and a different regex in a route handler.
 *
 * The individual field validators live in `lib/validation/fields.ts` because the admin console
 * validates the same underlying facts against the same database columns and the two sets of rules
 * must not drift apart.
 *
 * Safe to import from `'use client'` — no server-only modules below this line.
 */

/** Advertised on the dropzone. Matches the limit the future presigned upload will enforce. */
export const MAX_VIDEO_BYTES = 500 * 1024 * 1024;

/**
 * Video as the browser describes it. No bytes, no upload, no storage.
 *
 * Only the metadata a file input already knows about. When the real pipeline lands these three
 * fields become the client-side half of a presigned POST — the file itself never travels through
 * this schema.
 */
const videoField = z.object({
  // Strip any directory component. A browser gives a bare name, but a hand-written request does not,
  // and a filename is stored in a column that ends up in a Content-Disposition header.
  fileName: z
    .string()
    .trim()
    .min(1, 'Choose a file to upload')
    .max(255, 'File name is too long')
    .transform((value) => value.split(/[\\/]/).pop() ?? value)
    .pipe(z.string().min(1, 'Choose a file to upload')),
  mimeType: z.string().trim().max(120, 'File type is too long'),
  bytes: z
    .number({ error: 'Could not read the size of that file' })
    .int()
    .nonnegative()
    .max(MAX_VIDEO_BYTES, 'Video must be 500 MB or smaller'),
});

export const campaignDraftSchema = z.object({
  brandName: nameField('Brand name'),
  contactName: nameField('Contact name'),
  email: emailField,
  phone: phoneField,
  website: websiteField,
  campaignName: nameField('Campaign name'),
  // `.default('')` rather than `.optional()`: optional in the sense that the key may be missing, but
  // the service reads it as a string and a `string | undefined` here would mean a fallback at every
  // call site. Empty stays empty — a column that means "not provided" should be null, and the
  // service is where that decision belongs.
  campaignDescription: z
    .string()
    .trim()
    .max(DESCRIPTION_LIMIT, `Description must be ${DESCRIPTION_LIMIT} characters or fewer`)
    .default(''),
  // Optional. A campaign is valid without creative attached — the video is picked up in a later
  // step of the flow, and the row stays in AWAITING_UPLOAD until the pipeline exists.
  video: videoField.nullable().default(null),
});

export type CampaignDraftInput = z.input<typeof campaignDraftSchema>;
export type CampaignDraft = z.output<typeof campaignDraftSchema>;

/** Accepts a MIME type or a bare extension; browsers report `video/mp4` but sometimes `''`. */
export function isAcceptedVideoType(file: { type: string; name: string }): boolean {
  const mime = file.type.toLowerCase();
  if (mime === 'video/mp4' || mime === 'video/quicktime' || mime === 'video/x-m4v') return true;
  return /\.(mp4|mov|m4v|webm)$/i.test(file.name);
}

export const ACCEPTED_VIDEO_LABEL = 'MP4, MOV or WebM';

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

// Re-exported so callers that only care about the campaign contract have one import to make.
export { fieldErrorsFrom };
