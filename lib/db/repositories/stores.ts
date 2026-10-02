import type { QueryResultRow } from 'pg';
import type { Executor } from '@/lib/db/pool';
import { uniqueSlug } from '@/lib/db/slug';
import type { Store, StoreListEntry, StoreStatus } from '@/lib/db/types';

/**
 * Reads and writes on `stores`.
 *
 * A store is a venue that supplies screens. Nothing in the campaign flow touches this table — an
 * operator adds venues through the admin console — but it has existed since db/migrations/0001 so
 * that role-based access and the discovery flow had a target.
 *
 * `location` and `screen_count` are the two facts an operator needs at a glance, and they arrived in
 * db/migrations/0003.
 */

interface StoreRow extends QueryResultRow {
  id: string;
  name: string;
  slug: string;
  location: string;
  screen_count: number;
  website: string | null;
  owner_user_id: string | null;
  contact_name: string | null;
  contact_email: string;
  contact_phone: string | null;
  status: StoreStatus;
  created_at: Date;
}

const COLUMNS =
  'id, name, slug, location, screen_count, website, owner_user_id, contact_name, contact_email, contact_phone, status, created_at';

/** The same list, table-qualified, for queries that join. */
const COLUMNS_JOINED =
  's.id, s.name, s.slug, s.location, s.screen_count, s.website, s.owner_user_id, s.contact_name, s.contact_email, s.contact_phone, s.status, s.created_at';

function toStore(row: StoreRow): Store {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    location: row.location,
    screenCount: row.screen_count,
    website: row.website,
    ownerUserId: row.owner_user_id,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  };
}

async function slugIsTaken(db: Executor, slug: string): Promise<boolean> {
  const result = await db.query(`SELECT 1 FROM stores WHERE slug = $1 LIMIT 1`, [slug]);
  return result.rowCount !== null && result.rowCount > 0;
}

/**
 * Every venue, largest inventory first.
 *
 * Ordered by screen count rather than alphabetically because the console's first question is "how big
 * is this network" and the answer is the top of this list. Ties break on name so the order is stable
 * across page loads — an operator scrolling back up should not find rows they already read reordered.
 * The owner email is joined in so a venue with an account behind it can be traced back to one without
 * a second request per row.
 */
export async function listStores(db: Executor): Promise<StoreListEntry[]> {
  const result = await db.query<StoreRow & { owner_email: string | null }>(
    `SELECT ${COLUMNS_JOINED}, u.email AS owner_email
     FROM stores s
     LEFT JOIN users u ON u.id = s.owner_user_id
     ORDER BY s.screen_count DESC, s.name ASC`,
  );

  return result.rows.map((row) => ({ ...toStore(row), ownerEmail: row.owner_email }));
}

export interface CreateStoreInput {
  name: string;
  location: string;
  screenCount: number;
  website: string | null;
  /** Null for a venue an operator recorded by hand — there is no account behind it. */
  ownerUserId: string | null;
  contactName: string | null;
  contactEmail: string;
  contactPhone: string | null;
  status: StoreStatus;
}

export async function createStore(db: Executor, input: CreateStoreInput): Promise<Store> {
  const slug = await uniqueSlug(input.name, (candidate) => slugIsTaken(db, candidate));

  const result = await db.query<StoreRow>(
    `INSERT INTO stores (
       name, slug, location, screen_count, website, owner_user_id,
       contact_name, contact_email, contact_phone, status
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING ${COLUMNS}`,
    [
      input.name,
      slug,
      input.location,
      input.screenCount,
      input.website,
      input.ownerUserId,
      input.contactName,
      input.contactEmail.toLowerCase(),
      input.contactPhone,
      input.status,
    ],
  );

  return toStore(result.rows[0]);
}

export async function findStoreById(db: Executor, id: string): Promise<Store | null> {
  const result = await db.query<StoreRow>(`SELECT ${COLUMNS} FROM stores WHERE id = $1`, [id]);
  return result.rows[0] ? toStore(result.rows[0]) : null;
}

/**
 * Remove a venue. Returns false when the id matched nothing, so the route can answer 404 instead of
 * reporting a success that deleted nothing.
 *
 * A plain DELETE rather than a soft delete because nothing references a store yet — no campaign is
 * allocated to a venue, because allocation is a later phase. When `campaign_allocations` exists this
 * becomes a decision rather than a convenience: either refuse to delete a venue with history, or keep
 * the row and set a status of CLOSED, which `store_status` already allows for.
 */
export async function deleteStore(db: Executor, id: string): Promise<boolean> {
  const result = await db.query(`DELETE FROM stores WHERE id = $1`, [id]);
  return result.rowCount !== null && result.rowCount > 0;
}