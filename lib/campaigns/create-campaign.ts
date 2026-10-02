import { can } from '@/lib/auth/permissions';
import { withTransaction } from '@/lib/db/pool';
import { createBrand, findBrandByOwnerAndName, updateBrandDetails } from '@/lib/db/repositories/brands';
import { createCampaign, recordPendingVideo } from '@/lib/db/repositories/campaigns';
import { ensureBrandUser } from '@/lib/db/repositories/users';
import type { CampaignDetail, User } from '@/lib/db/types';
import type { CampaignDraft } from '@/lib/validation/campaign';

/**
 * Campaign creation.
 *
 * The transaction lives here rather than in the route handler: HTTP concerns (status codes, JSON
 * shape, reading the session cookie) stay in `app/api`, and the write that has to be all-or-nothing
 * stays in the service that owns it. A campaign with no brand behind it, or a brand with no account
 * that can be billed, is not a state the database should ever hold.
 *
 * Note what is *not* here: no upload, no S3 client, no encode job. A video arrives as metadata and is
 * recorded as pending.
 */

export type CreateCampaignFailure = {
  ok: false;
  status: 401 | 403;
  /** Safe to show a user. Never a message from PostgreSQL or the driver. */
  error: string;
};

export type CreateCampaignSuccess = {
  ok: true;
  detail: CampaignDetail;
  /** True when this call also had to provision the BRAND account behind the brand. */
  createdAccount: boolean;
};

export type CreateCampaignResult = CreateCampaignSuccess | CreateCampaignFailure;

/**
 * Thrown to abandon a transaction. Expected outcomes of a business rule are not exceptions; this one
 * has to be, because the rule is only knowable *after* a write that has already opened the
 * transaction, and `withTransaction` rolls back on a throw but commits on a return.
 */
class BrandAccountRequiredError extends Error {
  constructor(readonly role: User['role']) {
    super(`Role ${role} cannot create campaigns`);
    this.name = 'BrandAccountRequiredError';
  }
}

export interface CreateCampaignOptions {
  /**
   * The signed-in user, or null when the request carries no session. Resolved by the route from the
   * request cookie; passed in so this module stays free of Next's request context and can be called
   * from a script or a test.
   */
  actor: User | null;
  /** Allows provisioning a BRAND account from the submitted contact email. Off in production. */
  allowSignup: boolean;
}

export async function createCampaignWithBrand(
  draft: CampaignDraft,
  options: CreateCampaignOptions,
): Promise<CreateCampaignResult> {
  const { actor, allowSignup } = options;

  // An authenticated caller is authorising themselves, so the check happens before any write.
  if (actor && !can(actor.role, 'campaign:create')) {
    return { ok: false, status: 403, error: roleRefusal(actor.role) };
  }

  if (!actor && !allowSignup) {
    return { ok: false, status: 401, error: 'Sign in to create a campaign.' };
  }

  try {
    return await withTransaction(async (db) => {
      let ownerUserId: string;
      let createdAccount = false;

      if (actor) {
        ownerUserId = actor.id;
      } else {
        // Bootstrap: the contact email becomes the identity until real auth exists.
        const ensured = await ensureBrandUser(db, {
          email: draft.email,
          fullName: draft.contactName,
          phone: draft.phone,
        });

        // The bootstrap path can still land on a pre-existing account that is not allowed to create
        // campaigns — most often a STORE that registered with an address someone later used as a
        // brand contact.
        if (!can(ensured.user.role, 'campaign:create')) {
          throw new BrandAccountRequiredError(ensured.user.role);
        }

        ownerUserId = ensured.user.id;
        createdAccount = ensured.created;
      }

      const brandContact = {
        name: draft.brandName,
        website: draft.website,
        contactName: draft.contactName,
        contactEmail: draft.email,
        contactPhone: draft.phone,
      };

      // A brand is a customer record, not a submission. Someone returning to create a second
      // campaign should land on the brand they already have, with its history intact, rather than
      // growing a duplicate row each time.
      const existingBrand = await findBrandByOwnerAndName(db, ownerUserId, draft.brandName);
      const brand = existingBrand
        ? await updateBrandDetails(db, existingBrand.id, brandContact)
        : await createBrand(db, { ...brandContact, ownerUserId });

      const campaign = await createCampaign(db, {
        brandId: brand.id,
        name: draft.campaignName,
        description: draft.campaignDescription === '' ? null : draft.campaignDescription,
        createdBy: ownerUserId,
      });

      // Video is metadata only. No bytes are read, no object is written, no key is stored.
      const video = draft.video
        ? await recordPendingVideo(db, {
            campaignId: campaign.id,
            fileName: draft.video.fileName,
            mimeType: draft.video.mimeType === '' ? null : draft.video.mimeType,
            bytes: draft.video.bytes,
          })
        : null;

      return {
        ok: true,
        createdAccount,
        detail: { campaign, brand, video },
      };
    });
  } catch (error) {
    if (error instanceof BrandAccountRequiredError) {
      return { ok: false, status: 403, error: roleRefusal(error.role) };
    }
    throw error;
  }
}

function roleRefusal(role: User['role']): string {
  return role === 'STORE'
    ? 'That account manages screens rather than campaigns. Ask an administrator for a brand account.'
    : 'This account is not allowed to create campaigns.';
}