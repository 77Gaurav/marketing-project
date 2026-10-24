import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { getPool } from '@/lib/db/pool';
import { findStoreByIdOrSlug } from '@/device_backend';
import {
  updateStoreCreative,
  listStoreCreatives,
  deleteStoreCreative,
} from '@/lib/db/repositories/stores';
import { getServerEnv } from '@/lib/env';
import { buildObjectUrl } from '@/lib/aws/s3';
import { resolveCreativeMimeType } from '@/lib/validation/store-creative';

export const dynamic = 'force-dynamic';

function badRequest(body: { error: string }, status: number) {
  return NextResponse.json(body, { status });
}

export async function GET(
  request: Request,
  { params }: { params: { storeId: string } },
) {
  const storeIdentifier = params.storeId;
  const db = getPool();
  const store = await findStoreByIdOrSlug(db, storeIdentifier);
  if (!store) {
    return badRequest({ error: 'Store not found.' }, 404);
  }

  const creatives = await listStoreCreatives(db, store.id);

  return NextResponse.json({
    storeId: store.id,
    storeName: store.name,
    creativeUrl: store.creativeUrl || store.videoUrl || null,
    creativeKey: store.creativeKey || store.videoKey || null,
    creativeBucket: store.creativeBucket || store.videoBucket || null,
    creativeType: store.creativeType || null,
    creatives,
  });
}

export async function PUT(
  request: Request,
  { params }: { params: { storeId: string } },
) {
  return handleSaveCreative(request, params.storeId);
}

export async function POST(
  request: Request,
  { params }: { params: { storeId: string } },
) {
  return handleSaveCreative(request, params.storeId);
}

async function handleSaveCreative(request: Request, storeIdentifier: string) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return badRequest({ error: 'Request body must be valid JSON.' }, 400);
  }

  const body = payload as any;
  const creativeUrl = body?.creativeUrl || body?.objectUrl || body?.videoUrl;
  const creativeKey = body?.creativeKey || body?.originalKey || body?.key || body?.videoKey;
  const bucket = body?.bucket || body?.creativeBucket;
  const fileName = body?.fileName || body?.name || (creativeKey ? creativeKey.split('/').pop() : 'store-creative');
  const mimeType = body?.mimeType || body?.creativeType || resolveCreativeMimeType(fileName);
  const fileSize = typeof body?.fileSize === 'number' ? body.fileSize : undefined;

  if (!creativeUrl && !creativeKey) {
    return badRequest({ error: 'creativeUrl or creativeKey is required.' }, 400);
  }

  let actor = null;
  try {
    actor = await getSessionUser();
  } catch (error) {
    const env = getServerEnv();
    if (env.devAuthEmail) {
      const { findUserByEmail } = await import('@/lib/db/repositories/users');
      actor = await findUserByEmail(getPool(), env.devAuthEmail).catch(() => null);
    }
  }

  const db = getPool();
  const store = await findStoreByIdOrSlug(db, storeIdentifier);
  if (!store) {
    return badRequest({ error: 'Store not found.' }, 404);
  }

  if (actor) {
    const isAdmin = can(actor.role, 'user:manage');
    if (!isAdmin && store.ownerUserId && store.ownerUserId !== actor.id) {
      return badRequest({ error: 'You do not have permission to update this store.' }, 403);
    }
  }

  const env = getServerEnv();
  const targetBucket = bucket || env.s3OriginalBucket;
  const finalUrl = creativeUrl || buildObjectUrl(targetBucket, creativeKey, env.awsRegion);

  try {
    const result = await updateStoreCreative(db, store.id, {
      creativeUrl: finalUrl,
      creativeKey,
      creativeBucket: targetBucket,
      creativeType: mimeType,
      name: fileName,
      fileSize,
    });

    return NextResponse.json({
      success: true,
      store: result.store,
      creative: result.creative,
    });
  } catch (error) {
    console.error('[stores/creative] update failed', error);
    return badRequest({ error: 'Could not update store creative.' }, 500);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { storeId: string } },
) {
  let actor = null;
  try {
    actor = await getSessionUser();
  } catch (error) {
    const env = getServerEnv();
    if (env.devAuthEmail) {
      const { findUserByEmail } = await import('@/lib/db/repositories/users');
      actor = await findUserByEmail(getPool(), env.devAuthEmail).catch(() => null);
    }
  }

  const db = getPool();
  const store = await findStoreByIdOrSlug(db, params.storeId);
  if (!store) {
    return badRequest({ error: 'Store not found.' }, 404);
  }

  if (actor) {
    const isAdmin = can(actor.role, 'user:manage');
    if (!isAdmin && store.ownerUserId && store.ownerUserId !== actor.id) {
      return badRequest({ error: 'You do not have permission to update this store.' }, 403);
    }
  }

  const url = new URL(request.url);
  const creativeId = url.searchParams.get('creativeId') || undefined;

  try {
    await deleteStoreCreative(db, store.id, creativeId);
    return NextResponse.json({ success: true, storeId: store.id });
  } catch (error) {
    console.error('[stores/creative] delete failed', error);
    return badRequest({ error: 'Could not delete store creative.' }, 500);
  }
}
