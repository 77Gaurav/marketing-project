import { NextResponse } from 'next/server';
import { errorResponse, readJsonBody, withAdmin } from '@/lib/api/admin';
import { getPool } from '@/lib/db/pool';
import { createBrand, listBrands } from '@/lib/db/repositories/brands';
import { adminBrandSchema, fieldErrorsFrom } from '@/lib/validation/admin';

/**
 * GET  /api/admin/brands — every brand, with its campaign count.
 * POST /api/admin/brands — record a brand that exists offline.
 *
 * The create path deliberately does not create an account. An operator typing in a customer they met
 * on a call is recording a fact about the network, not onboarding somebody, and provisioning a login
 * for a person who never asked for one is a surprise with a GDPR tail behind it. The brand keeps
 * `owner_user_id` NULL and is reachable on its contact details, exactly as a brand with no account
 * already is.
 */

export const dynamic = 'force-dynamic';

export async function GET() {
  return withAdmin(async () => {
    try {
      const brands = await listBrands(getPool());
      return NextResponse.json({ brands, total: brands.length });
    } catch (error) {
      console.error('[admin] brand list failed', error);
      return errorResponse({ error: 'Could not load brands. Try again shortly.' }, 500);
    }
  });
}

export async function POST(request: Request) {
  return withAdmin(async () => {
    const body = await readJsonBody(request);
    if (!body.ok) {
      return errorResponse({ error: 'Request body must be valid JSON.' }, 400);
    }

    const parsed = adminBrandSchema.safeParse(body.value);
    if (!parsed.success) {
      return errorResponse(
        { error: 'Some details need fixing.', fields: fieldErrorsFrom(parsed.error) },
        422,
      );
    }

    const draft = parsed.data;

    try {
      const brand = await createBrand(getPool(), {
        name: draft.name,
        website: draft.website,
        ownerUserId: null,
        contactName: draft.contactName,
        contactEmail: draft.contactEmail,
        contactPhone: draft.contactPhone,
        status: draft.status,
      });

      return NextResponse.json({ brand }, { status: 201 });
    } catch (error) {
      console.error('[admin] brand creation failed', error);
      return errorResponse({ error: 'Could not save this brand. Please try again.' }, 500);
    }
  });
}
