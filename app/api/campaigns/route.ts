import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { createCampaignWithBrand } from '@/lib/campaigns/create-campaign';
import { getServerEnv } from '@/lib/env';
import {
  campaignDraftSchema,
  fieldErrorsFrom,
  type CampaignDraft,
} from '@/lib/validation/campaign';

/**
 * POST /api/campaigns — create a brand and its first campaign.
 *
 * The route is responsible for exactly three things: parsing the body, resolving the identity from
 * the request cookie, and turning the service's result into a status code. All of the rules live in
 * `lib/campaigns/create-campaign.ts` and all of the field rules live in `lib/validation/campaign.ts`,
 * the latter shared verbatim with the form.
 */

// Nothing here reads the request body at module scope, so this route is always dynamic.
export const dynamic = 'force-dynamic';

interface ErrorBody {
  error: string;
  /** Per-field messages, present only on a 422. */
  fields?: Record<string, string>;
}

function badRequest(body: ErrorBody, status: number) {
  return NextResponse.json(body, { status });
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return badRequest({ error: 'Request body must be valid JSON.' }, 400);
  }

  const parsed = campaignDraftSchema.safeParse(payload);
  if (!parsed.success) {
    return badRequest(
      { error: 'Some details need fixing.', fields: fieldErrorsFrom(parsed.error) },
      422,
    );
  }

  // Validated output: trimmed, lowercased, website normalised to null or an absolute URL.
  const draft = parsed.data as CampaignDraft;

  let actor;
  try {
    actor = await getSessionUser();
  } catch (error) {
    // A missing or unreachable database is an infrastructure fault, not a bad request.
    console.error('[campaigns] identity resolution failed', error);
    return badRequest({ error: 'Could not verify your session. Try again shortly.' }, 503);
  }

  let result;
  try {
    result = await createCampaignWithBrand(draft, {
      actor,
      allowSignup: getServerEnv().allowUnauthenticatedSignup,
    });
  } catch (error) {
    // Anything unrecognised is logged in full and reported generically: driver messages can contain
    // table names, column values and connection strings.
    console.error('[campaigns] creation failed', error);
    return badRequest({ error: 'We could not save your campaign. Please try again.' }, 500);
  }

  if (!result.ok) {
    return badRequest({ error: result.error }, result.status);
  }

  const { campaign, brand, video } = result.detail;

  return NextResponse.json(
    {
      campaign: {
        id: campaign.id,
        slug: campaign.slug,
        name: campaign.name,
        status: campaign.status,
        createdAt: campaign.createdAt,
      },
      brand: { id: brand.id, slug: brand.slug, name: brand.name },
      video: video ? { id: video.id, status: video.status, fileName: video.sourceFilename } : null,
      createdAccount: result.createdAccount,
    },
    { status: 201 },
  );
}