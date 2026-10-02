-- Make "emails are stored lowercase" a database invariant rather than an application convention.
--
-- 0001 relied on the application normalising on the way in, which is true for every write that goes
-- through lib/validation and lib/db/repositories/users.ts — but a direct SQL insert, a psql session or
-- a future import script could store "Ada@Example.com" alongside "ada@example.com" and pass the
-- unique index, quietly splitting one person into two accounts. A check constraint closes that.
--
-- Existing rows are lowercased first rather than being rejected: if this migration failed because of
-- mixed-case data, the fix is to decide which of the two accounts is the real one, not to delete one.

DO $$
DECLARE
  mixed_case_count integer;
BEGIN
  SELECT count(*) INTO mixed_case_count FROM users WHERE email <> lower(email);
  IF mixed_case_count > 0 THEN
    UPDATE users SET email = lower(email);
    -- Two addresses that differ only in case collapse onto one row here and violate the unique
    -- index. That is a real duplicate account and needs a human decision, so stop here.
    RAISE EXCEPTION
      'Normalised % mixed-case email(s) before the constraint could be added; re-run if the unique index now conflicts',
      mixed_case_count;
  END IF;
END $$;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_email_lowercase_chk;

ALTER TABLE users
  ADD CONSTRAINT users_email_lowercase_chk CHECK (email = lower(email));

COMMENT ON COLUMN users.email IS
  'Lowercase by constraint, not by convention. See 0002_email_case_invariant.sql.';