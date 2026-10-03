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
  google_subject: string | null;
  avatar_url: string | null;
  email_verified_at: Date | null;
}

const COLUMNS =
  'id, email, full_name, role, phone, created_at, google_subject, avatar_url, email_verified_at';

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    phone: row.phone,
    createdAt: row.created_at.toISOString(),
    googleSubject: row.google_subject,
    avatarUrl: row.avatar_url,
    emailVerifiedAt: row.email_verified_at?.toISOString() ?? null,
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

/** The account a Google `sub` is already attached to. The first lookup of every sign-in. */
export async function findUserByGoogleSubject(
  db: Executor,
  subject: string,
): Promise<User | null> {
  const result = await db.query<UserRow>(`SELECT ${COLUMNS} FROM users WHERE google_subject = $1`, [
    subject,
  ]);
  return result.rows[0] ? toUser(result.rows[0]) : null;
}

export interface GoogleSignInInput {
  /** The `sub` claim. Stable and unique per Google account. */
  subject: string;
  /** Already lowercased and already proven verified by the caller. */
  email: string;
  /** Google's display name, or empty. Never null: see the guard in {@link upsertGoogleUser}. */
  name: string;
  avatarUrl: string | null;
}

export interface GoogleSignInResult {
  user: User;
  /** True when this sign-in created the account rather than opening an existing one. */
  created: boolean;
  /**
   * True when the account existed but had no Google identity, so this sign-in attached one.
   *
   * Distinct from `created`, and worth surfacing: it is the "register an existing contact" case,
   * where someone submitted a campaign form before sign-in existed and is now connecting the account
   * that already holds their brand and campaigns.
   */
  linked: boolean;
}

/**
 * Resolve a verified Google identity to a local account, creating or linking one as needed.
 *
 * The two-step lookup is the whole design, and the order matters:
 *
 *   1. by `google_subject` — the same Google account signing in again returns the same local account,
 *      even if the address on the Google profile has since changed.
 *   2. by `email` — a first-time sign-in from an address that already has an account *links* to it,
 *      which is what stops a brand with existing campaigns from acquiring a second empty account.
 *
 * Two invariants this refuses to break:
 *
 *   * **The role of an existing account is never changed.** An ADMIN whose address signs in with
 *     Google stays an ADMIN. Assigning `BRAND` here would silently demote them, and assigning
 *     `ADMIN` would let anyone who can create a Google account with a matching address promote
 *     themselves.
 *   * **An unverified address never reaches this function.** The `google_subject_verified_chk`
 *     constraint makes that a database error rather than a convention, so a future caller that
 *     forgets to verify cannot create a half-trusted account.
 */
export async function upsertGoogleUser(
  db: Executor,
  input: GoogleSignInInput,
): Promise<GoogleSignInResult> {
  // `users.full_name` is NOT NULL, and a display name is the one field here that can legitimately be
  // absent — Google lets an account have no name at all. Falling back to the local part of the address
  // gives a heading on the dashboard and keeps a NOT NULL violation from surfacing as a 500 at the one
  // moment a person is trying to sign in.
  const name = input.name.trim() || input.email.split('@')[0] || 'Brand account';

  const bySubject = await findUserByGoogleSubject(db, input.subject);
  if (bySubject) {
    // Same Google account, but the profile may have been renamed or given an avatar since last time.
    // Email is deliberately NOT refreshed here: it is the account key elsewhere, and rewriting it
    // from a profile field would move a brand's billing contact on the strength of a rename.
    const refreshed = await db.query<UserRow>(
      `UPDATE users
          SET full_name = $2,
              avatar_url = COALESCE($3, avatar_url),
              email_verified_at = now()
        WHERE id = $1
        RETURNING ${COLUMNS}`,
      [bySubject.id, name, input.avatarUrl],
    );
    return { user: toUser(refreshed.rows[0]), created: false, linked: false };
  }

  const byEmail = await findUserByEmail(db, input.email);
  if (byEmail) {
    if (byEmail.googleSubject && byEmail.googleSubject !== input.subject) {
      // Two different Google accounts claiming one address. Attaching this one would silently
      // unattach the other, handing the account to whoever arrived last. Refused instead.
      throw new GoogleIdentityConflictError(input.email);
    }

    const linked = await db.query<UserRow>(
      `UPDATE users
          SET google_subject = $2,
              avatar_url = COALESCE($3, avatar_url),
              email_verified_at = now()
        WHERE id = $1
        RETURNING ${COLUMNS}`,
      [byEmail.id, input.subject, input.avatarUrl],
    );
    return { user: toUser(linked.rows[0]), created: false, linked: true };
  }

  // First sign-in for this address. `ON CONFLICT (email) DO NOTHING` plus a re-read rather than a
  // bare insert, because two people completing sign-in at the same moment both see no row here and
  // the loser should get the winner's account rather than a unique-violation 500.
  const inserted = await db.query<{ id: string }>(
    `INSERT INTO users (email, full_name, role, google_subject, avatar_url, email_verified_at)
     VALUES ($1, $2, 'BRAND', $3, $4, now())
     ON CONFLICT (email) DO NOTHING
     RETURNING id`,
    [input.email.toLowerCase(), name, input.subject, input.avatarUrl],
  );

  if (inserted.rows[0]) {
    const user = await findUserById(db, inserted.rows[0].id);
    if (!user) throw new Error('User row vanished immediately after insert.');
    return { user, created: true, linked: false };
  }

  const existing = await findUserByEmail(db, input.email);
  if (!existing) throw new Error('User conflict was reported but no row could be read back.');

  // Lost the race. If that row is already linked to this same subject, the sign-in is simply done.
  if (existing.googleSubject === input.subject) {
    return { user: existing, created: false, linked: false };
  }
  if (existing.googleSubject) throw new GoogleIdentityConflictError(input.email);

  const linked = await db.query<UserRow>(
    `UPDATE users
        SET google_subject = $2,
            avatar_url = COALESCE($3, avatar_url),
            email_verified_at = now()
      WHERE id = $1
      RETURNING ${COLUMNS}`,
    [existing.id, input.subject, input.avatarUrl],
  );
  return { user: toUser(linked.rows[0]), created: false, linked: true };
}

/**
 * Two Google accounts claiming one local address.
 *
 * An exception rather than a result variant because the callback has no correct action to take
 * beyond refusing, and a `null` return here would be easy to mistake for "no such user" and answered
 * by creating a second account.
 */
export class GoogleIdentityConflictError extends Error {
  // Declared rather than a constructor parameter property, so this module stays loadable by the
  // repo's type-stripping scripts (`db:check` runs with `--experimental-strip-types`, which cannot
  // erase parameter properties).
  readonly email: string;

  constructor(email: string) {
    super(`Two Google accounts are claiming ${email}.`);
    this.name = 'GoogleIdentityConflictError';
    this.email = email;
  }
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