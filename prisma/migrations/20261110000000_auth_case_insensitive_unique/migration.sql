-- Prevent concurrent writes while checking legacy data and building normalized indexes.
LOCK TABLE "User" IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "User"
    GROUP BY LOWER(BTRIM("email"))
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce normalized email uniqueness: duplicate email groups exist. Resolve affected accounts without deleting users, then retry this migration.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "User"
    WHERE "username" IS NOT NULL AND BTRIM("username") <> ''
    GROUP BY LOWER(BTRIM("username"))
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce normalized username uniqueness: duplicate username groups exist. Resolve affected accounts without deleting users, then retry this migration.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "User_email_normalized_key"
  ON "User" (LOWER(BTRIM("email")));

CREATE UNIQUE INDEX IF NOT EXISTS "User_username_normalized_key"
  ON "User" (LOWER(BTRIM("username")))
  WHERE "username" IS NOT NULL AND BTRIM("username") <> '';
