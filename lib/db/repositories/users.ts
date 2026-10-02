import type { QueryResultRow } from 'pg';
import type { Executor } from '@/lib/db/pool';
import type { User, UserRole } from '@/lib/db/types';

/**
 * Reads and writes on `users`.
 *
 * Emails are stored lowercase (the campaign form lowercases before submitting, and the repository
 * lowercases again) so the unique index on `users.email` behaves case-insensitively without needing
 * the citext extension.
 */

interface UserRow extends QueryResultRow {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  phone: string | null;
  created_at: Date;
}

const COLUMNS = 'id, email, full_name, role, phone, created_at';

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    phone: row.phone,
    createdAt: row.created_at.toISOString(),
  };
}

export async function findUserById(db: Executor, id: string): Promise<User | null> {
  const result = await db.query<UserRow>(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [id]);
  return result.rows[0] ? toUser(result.rows[0]) : null;
}

export async function findUserByEmail(db: Executor, email: string): Promise<User | null> {
  const result = await db.query<UserRow>(`SELECT ${COLUMNS} FROM users WHERE email = $1`, [
    email.toLowerCase(),
  ]);
  return result.rows[0] ? toUser(result.rows[0]) : null;
}

export interface CreateUserInput {
  email: string;
  fullName: string;
  phone: string | null;
  role: UserRole;
}

export async function createUser(db: Executor, input: CreateUserInput): Promise<User> {
  const result = await db.query<UserRow>(
    `INSERT INTO users (email, full_name, phone, role)
     VALUES ($1, $2, $3, $4)
     RETURNING ${COLUMNS}`,
    [input.email.toLowerCase(), input.fullName, input.phone, input.role],
  );
  return toUser(result.rows[0]);
}

export interface EnsureBrandUserInput {
  email: string;
  fullName: string;
  phone: string | null;
}

/**
 * Return the account for this email, creating a BRAND account if there is none.
 *
 * The role of an *existing* account is never changed. An ADMIN who also happens to be the contact
 * for a new brand must stay an ADMIN; silently demoting them because they filled in a campaign form
 * would quietly remove their access to the whole network. Callers get the real role back and decide
 * what to do with it.
 *
 * Racy by nature — two simultaneous signups for the same address both see no row — so the insert is
 * `ON CONFLICT DO NOTHING` followed by a select. The loser of the race gets the winner's row instead
 * of a 500.
 */
export async function ensureBrandUser(
  db: Executor,
  input: EnsureBrandUserInput,
): Promise<{ user: User; created: boolean }> {
  const email = input.email.toLowerCase();

  const inserted = await db.query<{ id: string }>(
    `INSERT INTO users (email, full_name, phone, role)
     VALUES ($1, $2, $3, 'BRAND')
     ON CONFLICT (email) DO NOTHING
     RETURNING id`,
    [email, input.fullName, input.phone],
  );

  if (inserted.rows[0]) {
    const user = await findUserById(db, inserted.rows[0].id);
    if (!user) throw new Error('User row vanished immediately after insert.');
    return { user, created: true };
  }

  const existing = await findUserByEmail(db, email);
  if (!existing) throw new Error('User conflict was reported but no row could be read back.');
  return { user: existing, created: false };
}