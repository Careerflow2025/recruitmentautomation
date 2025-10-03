-- =====================================================
-- MIGRATION: Fix Matches Table for Multi-Tenant Support
-- =====================================================
-- Run this in your Supabase SQL Editor to fix the matches table
-- This adds user_id and commute_band columns, and updates RLS policies
-- =====================================================

-- Step 1: Drop old policies
DROP POLICY IF EXISTS "Allow all operations on matches" ON matches;

-- Step 2: Add missing columns if they don't exist
DO $$
BEGIN
  -- Add user_id column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'matches' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE matches ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

    -- Populate user_id for existing matches by joining with candidates
    UPDATE matches m
    SET user_id = c.user_id
    FROM candidates c
    WHERE m.candidate_id = c.id AND m.user_id IS NULL;

    -- Make user_id NOT NULL after populating
    ALTER TABLE matches ALTER COLUMN user_id SET NOT NULL;
  END IF;

  -- Add commute_band column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'matches' AND column_name = 'commute_band'
  ) THEN
    ALTER TABLE matches ADD COLUMN commute_band TEXT;

    -- Populate commute_band based on commute_minutes
    UPDATE matches
    SET commute_band = CASE
      WHEN commute_minutes <= 20 THEN '🟢🟢🟢 0-20min'
      WHEN commute_minutes <= 40 THEN '🟢🟢 21-40min'
      WHEN commute_minutes <= 55 THEN '🟢 41-55min'
      WHEN commute_minutes <= 80 THEN '🟡 56-80min'
      ELSE '❌ 81+ min'
    END
    WHERE commute_band IS NULL;
  END IF;
END $$;

-- Step 3: Update UNIQUE constraint to include user_id
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_candidate_id_client_id_key;
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_user_id_candidate_id_client_id_key;
ALTER TABLE matches ADD CONSTRAINT matches_user_id_candidate_id_client_id_key
  UNIQUE(user_id, candidate_id, client_id);

-- Step 4: Create index on user_id for performance
CREATE INDEX IF NOT EXISTS idx_matches_user ON matches(user_id);

-- Step 5: Create proper RLS policies for user isolation
CREATE POLICY "Users can view their own matches" ON matches
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own matches" ON matches
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own matches" ON matches
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own matches" ON matches
  FOR DELETE USING (auth.uid() = user_id);

-- Step 6: Clean up matches that don't belong to any user (orphaned data)
DELETE FROM matches WHERE user_id IS NULL;

-- Step 7: Verify the fix
SELECT
  'Migration Complete!' as status,
  COUNT(*) as total_matches,
  COUNT(DISTINCT user_id) as unique_users
FROM matches;
