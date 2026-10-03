-- Google sign-in identity on `users`.
--
-- Two columns rather than a general `identities` table, because there is exactly one external
-- provider today and a table would be a migration away from being needed.
--
-- `google_subject` is the `sub` claim from Google's userinfo endpoint: an opaque, per-account,
-- never-reused identifier. It is the real primary key of a Google identity — `email` is not, because
-- an address can be renamed, and matching an account on its email alone would let whoever acquires
-- that address inherit the account.
--
-- Nullable on purpose. `users` also holds accounts created by the campaign bootstrap and by the
-- admin console, which have no Google identity at all, and a sentinel value would be a lie.
--
-- The unique index is partial because a plain unique index treats every NULL as distinct and so would
-- enforce nothing at all on the rows that matter here. It is also the only index needed: the
-- callback's lookup is `WHERE google_subject = $1`, which this partial unique index serves as well as
-- any dedicated one would, so a second index on the same column would only cost write time.

-- Shown on the brand dashboard. Google's picture URLs are stable per account but are not covered by
-- any guarantee we control, so this is presentation only and the UI must survive it 404ing.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url text;

-- Records when an address was last proven to belong to this person, which is the fact OAuth gives us
-- that a password row never could. Nullable: accounts without a Google identity have nothing to
-- prove.
--
-- Added before the constraint below that references it — the column and its guard are one change, and
-- splitting them would leave a migration that cannot run at all.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;

ALTER TABLE users ADD COLUMN IF NOT EXISTS google_subject text;

CREATE UNIQUE INDEX IF NOT EXISTS users_google_subject_key
  ON users (google_subject)
  WHERE google_subject IS NOT NULL;

-- Guards the invariant the sign-in flow depends on: a Google identity is only ever stored against
-- an account whose email Google has verified. The callback refuses an unverified address, and this
-- constraint means a row carrying a subject can never claim an address that was not verified — not
-- even by a future script or console session that skips the callback.
--
-- NOT VALID is deliberately not used: the check has to hold for existing rows at migration time, and
-- every current row has a NULL subject, so it passes immediately.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_google_subject_verified_chk;
ALTER TABLE users ADD CONSTRAINT users_google_subject_verified_chk CHECK (
  google_subject IS NULL OR email_verified_at IS NOT NULL
);