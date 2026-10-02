import type { QueryResultRow } from 'pg';
import type { Executor } from '@/lib/db/pool';
import { uniqueSlug } from '@/lib/db/slug';
import type { Brand, BrandListEntry, BrandStatus } from '@/lib/db/types';

/**
 * Reads and writes on `brands`.
 *
 * A brand is the customer record, not a login: contact details live here rather than on `users` so
 * the same person can run several brands from one account, and so a brand keeps its billing contact
 * even if the user account behind it is closed.
 */

interface BrandRow extends QueryResultRow {
  id: string;
  name: string;
  slug: string;
  website: string | null;
  owner_user_id: string | null;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  status: BrandStatus;
  created_at: Date;
}

const COLUMNS =
  'id, name, slug, website, owner_user_id, contact_name, contact_email, contact_phone, status, created_at';

function toBrand(row: BrandRow): Brand {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
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
  const result = await db.query(`SELECT 1 FROM brands WHERE slug = $1 LIMIT 1`, [slug]);
  return result.rowCount !== null && result.rowCount > 0;
}

export interface CreateBrandInput {
  name: string;
  website: string | null;
  /**
   * Null for a brand an operator recorded by hand in the admin console — such a brand is a customer
   * that exists offline and has no account behind it. The column is nullable for exactly this case.
   */
  ownerUserId: string | null;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  /**
   * Defaults to PENDING_REVIEW in the database, which is right for a self-service submission. An
   * operator adding a brand by hand passes ACTIVE: it did not arrive through a form to be reviewed.
   */
  status?: BrandStatus;
}

/**
 * The `$8::brand_status` cast in the INSERT is required, not decorative.
 *
 * `COALESCE($8, 'PENDING_REVIEW')` leaves both arguments untyped, so PostgreSQL resolves the result
 * as `text` and the insert fails with "column status is of type brand_status but expression is of
 * type text" — for every caller, including the campaign form that passes no status at all. Casting
 * one argument fixes the COALESCE result type, and the other is then coerced.
 */
export async function createBrand(db: Executor, input: CreateBrandInput): Promise<Brand> {
  const slug = await uniqueSlug(input.name, (candidate) => slugIsTaken(db, candidate));

  const result = await db.query<BrandRow>(
    `INSERT INTO brands (name, slug, website, owner_user_id, contact_name, contact_email, contact_phone, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::brand_status, 'PENDING_REVIEW'))
     RETURNING ${COLUMNS}`,
    [
      input.name,
      slug,
      input.website,
      input.ownerUserId,
      input.contactName,
      input.contactEmail.toLowerCase(),
      input.contactPhone,
      input.status ?? null,
    ],
  );

  return toBrand(result.rows[0]);
}

/**
 * Every brand, for the admin console.
 *
 * `campaignCount` is not decoration. `campaigns.brand_id` is ON DELETE CASCADE, so deleting a brand
 * deletes its campaigns and their campaign_videos rows too. The console has to be able to say how
 * many campaigns are about to be destroyed *before* the operator confirms, and counting them here
 * means the figure cannot disagree with the database by the time the delete lands.
 *
 * Counted with a correlated subquery rather than a join so a brand with several campaigns still
 * yields exactly one row — a grouped join would fan out and need a DISTINCT to undo.
 */
export async function listBrands(db: Executor): Promise<BrandListEntry[]> {
  const result = await db.query<BrandRow & { campaign_count: number; owner_email: string | null }>(
    `SELECT b.id, b.name, b.slug, b.website, b.owner_user_id, b.contact_name, b.contact_email,
            b.contact_phone, b.status, b.created_at,
            (SELECT count(*)::int FROM campaigns c WHERE c.brand_id = b.id) AS campaign_count,
            u.email AS owner_email
     FROM brands b
     LEFT JOIN users u ON u.id = b.owner_user_id
     ORDER BY b.created_at DESC`,
  );

  return result.rows.map((row) => ({
    ...toBrand(row),
    campaignCount: row.campaign_count,
    ownerEmail: row.owner_email,
  }));
}

/**
 * Remove a brand. Returns false when the id matched nothing, so the route can answer 404 rather than
 * reporting a success that deleted nothing.
 *
 * Cascade is the database's decision, set in db/migrations/0001, and it is the right one for a
 * customer record whose only dependent is its own campaign history — a brand with campaigns left
 * behind would be worse. The cost is that this is irreversible, so the console states the campaign
 * count first and the route requires an explicit confirmation below.
 */
export async function deleteBrand(db: Executor, id: string): Promise<boolean> {
  const result = await db.query(`DELETE FROM brands WHERE id = $1`, [id]);
  return result.rowCount !== null && result.rowCount > 0;
}

/** How many campaigns a delete would take with it. Used to refuse a delete that was not confirmed. */
export async function countCampaignsForBrand(db: Executor, brandId: string): Promise<number> {
  const result = await db.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM campaigns WHERE brand_id = $1`,
    [brandId],
  );
  return result.rows[0]?.count ?? 0;
}

export async function findBrandById(db: Executor, id: string): Promise<Brand | null> {
  const result = await db.query<BrandRow>(`SELECT ${COLUMNS} FROM brands WHERE id = $1`, [id]);
  return result.rows[0] ? toBrand(result.rows[0]) : null;
}

/**
 * The brand this account already has under this name.
 *
 * This is what stops a brand creating a second campaign from ending up with a second, identical
 * brand row. A brand is a customer record, not a submission: campaign history and reporting hang off
 * it, so two rows for "Café Noir Coffee" would silently split that history in two.
 *
 * Matched on owner plus exact name rather than email domain: one company can legitimately trade
 * under several names, and a domain belongs to whoever registered it, not to every brand on it.
 */
export async function findBrandByOwnerAndName(
  db: Executor,
  ownerUserId: string,
  name: string,
): Promise<Brand | null> {
  const result = await db.query<BrandRow>(
    `SELECT ${COLUMNS} FROM brands
     WHERE owner_user_id = $1 AND name = $2
     ORDER BY created_at ASC
     LIMIT 1`,
    [ownerUserId, name],
  );
  return result.rows[0] ? toBrand(result.rows[0]) : null;
}

export interface UpdateBrandInput {
  website: string | null;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
}

/**
 * Refresh the details the campaign form just collected.
 *
 * Only the mutable contact fields. Name, slug and owner are identity: renaming a brand would orphan
 * the slug in any link already shared, and reparenting it would move a brand between accounts on the
 * strength of one form submission.
 */
export async function updateBrandDetails(
  db: Executor,
  id: string,
  input: UpdateBrandInput,
): Promise<Brand> {
  const result = await db.query<BrandRow>(
    `UPDATE brands
     SET website = $2, contact_name = $3, contact_email = $4, contact_phone = $5
     WHERE id = $1
     RETURNING ${COLUMNS}`,
    [id, input.website, input.contactName, input.contactEmail.toLowerCase(), input.contactPhone],
  );

  return toBrand(result.rows[0]);
}