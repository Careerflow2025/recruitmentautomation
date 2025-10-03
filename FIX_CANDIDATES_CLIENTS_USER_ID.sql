-- =====================================================
-- MIGRATION: Add user_id to candidates and clients tables
-- =====================================================
-- Run this in Supabase SQL Editor IMMEDIATELY
-- This is the missing piece preventing matches from displaying
-- =====================================================

-- Step 1: Add user_id to candidates table
DO $$
BEGIN
  -- Add user_id column to candidates if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'candidates' AND column_name = 'user_id'
  ) THEN
    -- Add column as nullable first
    ALTER TABLE candidates ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

    -- Get the first user from auth.users to assign to existing candidates
    -- In production, you'd need to manually assign each candidate to correct user
    UPDATE candidates
    SET user_id = (SELECT id FROM auth.users LIMIT 1)
    WHERE user_id IS NULL;

    -- Make it NOT NULL after populating
    ALTER TABLE candidates ALTER COLUMN user_id SET NOT NULL;

    -- Create index
    CREATE INDEX IF NOT EXISTS idx_candidates_user ON candidates(user_id);

    RAISE NOTICE 'Added user_id to candidates table';
  ELSE
    RAISE NOTICE 'user_id already exists in candidates table';
  END IF;
END $$;

-- Step 2: Add user_id to clients table
DO $$
BEGIN
  -- Add user_id column to clients if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'user_id'
  ) THEN
    -- Add column as nullable first
    ALTER TABLE clients ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

    -- Get the first user from auth.users to assign to existing clients
    UPDATE clients
    SET user_id = (SELECT id FROM auth.users LIMIT 1)
    WHERE user_id IS NULL;

    -- Make it NOT NULL after populating
    ALTER TABLE clients ALTER COLUMN user_id SET NOT NULL;

    -- Create index
    CREATE INDEX IF NOT EXISTS idx_clients_user ON clients(user_id);

    RAISE NOTICE 'Added user_id to clients table';
  ELSE
    RAISE NOTICE 'user_id already exists in clients table';
  END IF;
END $$;

-- Step 3: Drop old RLS policies
DROP POLICY IF EXISTS "Allow all operations on candidates" ON candidates;
DROP POLICY IF EXISTS "Allow all operations on clients" ON clients;

-- Step 4: Create proper RLS policies for candidates
CREATE POLICY "Users can view their own candidates" ON candidates
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own candidates" ON candidates
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own candidates" ON candidates
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own candidates" ON candidates
  FOR DELETE USING (auth.uid() = user_id);

-- Step 5: Create proper RLS policies for clients
CREATE POLICY "Users can view their own clients" ON clients
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own clients" ON clients
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own clients" ON clients
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own clients" ON clients
  FOR DELETE USING (auth.uid() = user_id);

-- Step 6: Verify the fix
SELECT
  'Migration Complete!' as status,
  (SELECT COUNT(*) FROM candidates) as total_candidates,
  (SELECT COUNT(*) FROM clients) as total_clients,
  (SELECT COUNT(*) FROM matches) as total_matches,
  (SELECT COUNT(DISTINCT user_id) FROM candidates) as unique_users_candidates,
  (SELECT COUNT(DISTINCT user_id) FROM clients) as unique_users_clients,
  (SELECT COUNT(DISTINCT user_id) FROM matches) as unique_users_matches;
