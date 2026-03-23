-- Fixup: ensure required columns exist on tables that may have been created
-- outside the migration system.  Runs before 001_initial.sql (alphabetical order).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- operators must exist before we can reference it from users
CREATE TABLE IF NOT EXISTS operators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fsp_operator_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  config JSONB DEFAULT '{}',
  feature_flags JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rename hashed_password → password_hash if the old column name was used
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'hashed_password')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'password_hash')
  THEN
    ALTER TABLE users RENAME COLUMN hashed_password TO password_hash;
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'hashed_password')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'password_hash')
  THEN
    -- Both columns exist: copy data from old to new, then drop old
    UPDATE users SET password_hash = hashed_password WHERE password_hash IS NULL OR password_hash = '';
    ALTER TABLE users DROP COLUMN hashed_password;
  END IF;
END $$;

-- If users table exists but lacks operator_id, add it and backfill
DO $$
DECLARE
  default_op_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'operator_id')
  THEN
    INSERT INTO operators (fsp_operator_id, name)
    VALUES ('FSP-001', 'SkyHigh Flight School')
    ON CONFLICT (fsp_operator_id) DO NOTHING;

    SELECT id INTO default_op_id FROM operators WHERE fsp_operator_id = 'FSP-001';

    ALTER TABLE users ADD COLUMN operator_id UUID;
    UPDATE users SET operator_id = default_op_id;
    ALTER TABLE users ALTER COLUMN operator_id SET NOT NULL;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'users_operator_id_fkey'
    ) THEN
      ALTER TABLE users ADD CONSTRAINT users_operator_id_fkey
        FOREIGN KEY (operator_id) REFERENCES operators(id);
    END IF;
  END IF;
END $$;

-- Ensure other required columns exist on users
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'scheduler';
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill NULLs with sensible defaults
UPDATE users SET password_hash = '' WHERE password_hash IS NULL;
UPDATE users SET name = email WHERE name IS NULL;
UPDATE users SET role = 'scheduler' WHERE role IS NULL;
