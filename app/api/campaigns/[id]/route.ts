import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { getPool } from '@/lib/db/pool';
import { findCampaignDetail } from '@/lib/db/repositories/campaigns';

export const dynamic = 'force-dynamic';

/**
 * GET /api/campaigns/[id] — read one campaign.
 *
 * Only the read endpoint that exists so far, and it exists so the campaign detail page is not the
 * only thing that can show a campaign. Authorisation is deliberately coarse: any signed-in account
 * can read, while `campaign:read:any` is the permission a future ADMIN-only view will gate on. Once
 * real auth lands this becomes a brand-ownership check rather than a role check.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  let actor;
  try {
    actor = await getSessionUser();
  } catch (error) {
    console.error('[campaigns/:id] identity resolution failed', error);
    return NextResponse.json({ error: 'Could not verify your session.' }, { status: 503 });
  }

  if (!actor) {
    return NextResponse.json({ error: 'Sign in to view this campaign.' }, { status: 401 });
  }

  // A UUID is the only id this route accepts; anything else is a bad request, not a 404.
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.id);
  if (!isUuid) {
    return NextResponse.json({ error: 'Not a valid campaign id.' }, { status: 400 });
  }

  try {
    const detail = await findCampaignDetail(getPool(), params.id);
    if (!detail) {
      return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
    }

    return NextResponse.json({
      ...detail,
      // Declared so a future admin-only surface has an obvious gate to reuse.
      canManage: can(actor.role, 'campaign:read:any'),
    });
  } catch (error) {
    console.error('[campaigns/:id] read failed', error);
    return NextResponse.json({ error: 'Could not load this campaign.' }, { status: 500 });
  }
}