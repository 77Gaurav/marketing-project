/**
 * Domain types.
 *
 * These are the shapes the rest of the application works with. Database rows use snake_case; the
 * repositories in this directory are the only place that converts between the two, so no query
 * result and no component ever has to remember which convention it is holding.
 *
 * The string unions mirror the PostgreSQL enums in `db/migrations/0001_init.sql`. If a value is
 * added there, TypeScript will fail to compile at the mapping site rather than letting an unknown
 * state leak through a route.
 */

export const USER_ROLES = ['BRAND', 'STORE', 'ADMIN'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const BRAND_STATUSES = ['PENDING_REVIEW', 'ACTIVE', 'SUSPENDED'] as const;
export type BrandStatus = (typeof BRAND_STATUSES)[number];

export const STORE_STATUSES = ['PENDING_REVIEW', 'ACTIVE', 'PAUSED', 'CLOSED'] as const;
export type StoreStatus = (typeof STORE_STATUSES)[number];

export const CAMPAIGN_STATUSES = [
  'DRAFT',
  'IN_REVIEW',
  'SCHEDULED',
  'LIVE',
  'PAUSED',
  'COMPLETED',
  'CANCELLED',
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const VIDEO_STATUSES = [
  'AWAITING_UPLOAD',
  'UPLOADING',
  'UPLOADED',
  'PROCESSING',
  'ENCODING',
  'RETRYING',
  'READY',
  'FAILED',
] as const;
export type VideoStatus = (typeof VIDEO_STATUSES)[number];

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  phone: string | null;
  createdAt: string;
  /**
   * Google's `sub` claim, or null for an account with no Google identity.
   *
   * Present so the dashboard can show "connected to Google" and so support can tell a signup from a
   * link. It is never the basis of a lookup on its own here, because {@link google} resolves by it
   * first and then confirms the address.
   */
  googleSubject: string | null;
  /** Avatar for the dashboard. Presentation only — Google may stop serving it at any time. */
  avatarUrl: string | null;
  /**
   * When this address was last proven to belong to this person.
   *
   * Non-null for any account with a Google identity, which the `users_google_subject_verified_chk`
   * constraint enforces in the database rather than trusting this module to remember.
   */
  emailVerifiedAt: string | null;
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  website: string | null;
  ownerUserId: string | null;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  status: BrandStatus;
  createdAt: string;
  videoUrl?: string | null;
  videoKey?: string | null;
  videoBucket?: string | null;
}

/**
 * A venue that supplies screens.
 *
 * `location` is free text because venues are described by "third floor, by the escalators" as often
 * as by a postcode; `screenCount` is a declared inventory figure rather than a count of rows, since
 * there is no `screens` table yet. Both arrived in db/migrations/0003.
 */
export interface Store {
  id: string;
  name: string;
  slug: string;
  location: string;
  screenCount: number;
  website: string | null;
  ownerUserId: string | null;
  contactName: string | null;
  contactEmail: string;
  contactPhone: string | null;
  status: StoreStatus;
  createdAt: string;
}

export interface Campaign {
  id: string;
  brandId: string;
  slug: string;
  name: string;
  description: string | null;
  status: CampaignStatus;
  startsOn: string | null;
  endsOn: string | null;
  createdBy: string | null;
  createdAt: string;
}

/**
 * The creative attached to a campaign.
 *
 * Today the only populated fields are the ones the browser volunteered (`sourceFilename` and
 * friends) plus a status of AWAITING_UPLOAD. The S3 and encoder fields exist so the upload pipeline
 * has somewhere to write; nothing here uploads, encodes or stores bytes.
 */
export interface CampaignVideo {
  id: string;
  campaignId: string;
  sourceFilename: string;
  sourceMimeType: string | null;
  sourceBytes: number | null;
  status: VideoStatus;
  originalBucket: string | null;
  originalKey: string | null;
  encodedBucket: string | null;
  encodedKey: string | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  codec: string | null;
  attemptCount: number;
  lastError: string | null;
}

export interface CampaignDetail {
  campaign: Campaign;
  brand: Brand;
  video: CampaignVideo | null;
}

/**
 * A brand as the admin console lists it.
 *
 * `campaignCount` is the number that has to be on screen *before* a delete is confirmed, because
 * `campaigns.brand_id` is ON DELETE CASCADE — removing a brand removes its campaigns and their
 * creative rows with it. `ownerEmail` is null for a brand recorded by an operator, which has no
 * account behind it.
 */
export interface BrandListEntry extends Brand {
  campaignCount: number;
  ownerEmail: string | null;
}

/** A store as the admin console lists it. `ownerEmail` is null for an operator-added venue. */
export interface StoreListEntry extends Store {
  ownerEmail: string | null;
}

/**
 * One row of a signed-in brand's campaign list.
 *
 * A projection rather than a `Campaign`, because the dashboard needs the brand name and the creative's
 * state beside each campaign, and hanging those off `Campaign` would put brand-scoped and
 * campaign-scoped data in one type. `videoStatus` is null when no creative was ever offered, which is
 * a different thing from a creative still waiting to be uploaded.
 */
export interface CampaignSummary {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: CampaignStatus;
  createdAt: string;
  brandId: string;
  brandName: string;
  brandSlug: string;
  videoStatus: VideoStatus | null;
  videoFileName: string | null;
}
