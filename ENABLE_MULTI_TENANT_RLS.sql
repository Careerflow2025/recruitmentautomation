-- =====================================================
-- MULTI-TENANT RLS MIGRATION
-- =====================================================
-- This migration adds user_id columns and RLS policies
-- to ensure complete data isolation between users
-- =====================================================

-- Step 1: Add user_id columns to all tables
-- =====================================================

-- Add user_id to candidates table
ALTER TABLE candidates
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id to clients table
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id to matches table
ALTER TABLE matches
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id to match_statuses table
ALTER TABLE match_statuses
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id to match_notes table
ALTER TABLE match_notes
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Step 2: Update existing records with current user's ID
-- =====================================================
-- IMPORTANT: Run this with YOUR user ID
-- To find your user ID, run: SELECT id FROM auth.users WHERE email = 'your-email@example.com';

-- Uncomment and replace YOUR_USER_ID_HERE with your actual user ID:
-- UPDATE candidates SET user_id = 'YOUR_USER_ID_HERE' WHERE user_id IS NULL;
-- UPDATE clients SET user_id = 'YOUR_USER_ID_HERE' WHERE user_id IS NULL;
-- UPDATE matches SET user_id = 'YOUR_USER_ID_HERE' WHERE user_id IS NULL;
-- UPDATE match_statuses SET user_id = 'YOUR_USER_ID_HERE' WHERE user_id IS NULL;
-- UPDATE match_notes SET user_id = 'YOUR_USER_ID_HERE' WHERE user_id IS NULL;

-- Step 3: Make user_id NOT NULL (after updating existing data)
-- =====================================================
-- Uncomment after updating existing records:
-- ALTER TABLE candidates ALTER COLUMN user_id SET NOT NULL;
-- ALTER TABLE clients ALTER COLUMN user_id SET NOT NULL;
-- ALTER TABLE matches ALTER COLUMN user_id SET NOT NULL;
-- ALTER TABLE match_statuses ALTER COLUMN user_id SET NOT NULL;
-- ALTER TABLE match_notes ALTER COLUMN user_id SET NOT NULL;

-- Step 4: Create indexes for performance
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_candidates_user_id ON candidates(user_id);
CREATE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id);
CREATE INDEX IF NOT EXISTS idx_matches_user_id ON matches(user_id);
CREATE INDEX IF NOT EXISTS idx_match_statuses_user_id ON match_statuses(user_id);
CREATE INDEX IF NOT EXISTS idx_match_notes_user_id ON match_notes(user_id);

-- Step 5: Enable RLS on all tables
-- =====================================================

ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_notes ENABLE ROW LEVEL SECURITY;

-- Step 6: Drop any existing policies (clean slate)
-- =====================================================

DROP POLICY IF EXISTS "candidates_select_policy" ON candidates;
DROP POLICY IF EXISTS "candidates_insert_policy" ON candidates;
DROP POLICY IF EXISTS "candidates_update_policy" ON candidates;
DROP POLICY IF EXISTS "candidates_delete_policy" ON candidates;

DROP POLICY IF EXISTS "clients_select_policy" ON clients;
DROP POLICY IF EXISTS "clients_insert_policy" ON clients;
DROP POLICY IF EXISTS "clients_update_policy" ON clients;
DROP POLICY IF EXISTS "clients_delete_policy" ON clients;

DROP POLICY IF EXISTS "matches_select_policy" ON matches;
DROP POLICY IF EXISTS "matches_insert_policy" ON matches;
DROP POLICY IF EXISTS "matches_update_policy" ON matches;
DROP POLICY IF EXISTS "matches_delete_policy" ON matches;

DROP POLICY IF EXISTS "match_statuses_select_policy" ON match_statuses;
DROP POLICY IF EXISTS "match_statuses_insert_policy" ON match_statuses;
DROP POLICY IF EXISTS "match_statuses_update_policy" ON match_statuses;
DROP POLICY IF EXISTS "match_statuses_delete_policy" ON match_statuses;

DROP POLICY IF EXISTS "match_notes_select_policy" ON match_notes;
DROP POLICY IF EXISTS "match_notes_insert_policy" ON match_notes;
DROP POLICY IF EXISTS "match_notes_update_policy" ON match_notes;
DROP POLICY IF EXISTS "match_notes_delete_policy" ON match_notes;

-- Step 7: Create RLS Policies for CANDIDATES table
-- =====================================================

-- Users can only SELECT their own candidates
CREATE POLICY "candidates_select_policy"
ON candidates FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Users can only INSERT candidates with their own user_id
CREATE POLICY "candidates_insert_policy"
ON candidates FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Users can only UPDATE their own candidates
CREATE POLICY "candidates_update_policy"
ON candidates FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Users can only DELETE their own candidates
CREATE POLICY "candidates_delete_policy"
ON candidates FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- Step 8: Create RLS Policies for CLIENTS table
-- =====================================================

-- Users can only SELECT their own clients
CREATE POLICY "clients_select_policy"
ON clients FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Users can only INSERT clients with their own user_id
CREATE POLICY "clients_insert_policy"
ON clients FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Users can only UPDATE their own clients
CREATE POLICY "clients_update_policy"
ON clients FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Users can only DELETE their own clients
CREATE POLICY "clients_delete_policy"
ON clients FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- Step 9: Create RLS Policies for MATCHES table
-- =====================================================

-- Users can only SELECT their own matches
CREATE POLICY "matches_select_policy"
ON matches FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Users can only INSERT matches with their own user_id
CREATE POLICY "matches_insert_policy"
ON matches FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Users can only UPDATE their own matches
CREATE POLICY "matches_update_policy"
ON matches FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Users can only DELETE their own matches
CREATE POLICY "matches_delete_policy"
ON matches FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- Step 10: Create RLS Policies for MATCH_STATUSES table
-- =====================================================

-- Users can only SELECT their own match statuses
CREATE POLICY "match_statuses_select_policy"
ON match_statuses FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Users can only INSERT match statuses with their own user_id
CREATE POLICY "match_statuses_insert_policy"
ON match_statuses FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Users can only UPDATE their own match statuses
CREATE POLICY "match_statuses_update_policy"
ON match_statuses FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Users can only DELETE their own match statuses
CREATE POLICY "match_statuses_delete_policy"
ON match_statuses FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- Step 11: Create RLS Policies for MATCH_NOTES table
-- =====================================================

-- Users can only SELECT their own match notes
CREATE POLICY "match_notes_select_policy"
ON match_notes FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Users can only INSERT match notes with their own user_id
CREATE POLICY "match_notes_insert_policy"
ON match_notes FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Users can only UPDATE their own match notes
CREATE POLICY "match_notes_update_policy"
ON match_notes FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Users can only DELETE their own match notes
CREATE POLICY "match_notes_delete_policy"
ON match_notes FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================
-- Run these after migration to verify everything works:

-- Check that RLS is enabled on all tables
SELECT
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('candidates', 'clients', 'matches', 'match_statuses', 'match_notes')
ORDER BY tablename;

-- Check all policies
SELECT
  schemaname,
  tablename,
  policyname,
  cmd as operation,
  CASE
    WHEN roles = '{authenticated}' THEN 'authenticated users'
    ELSE roles::text
  END as applies_to
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd;

-- Count records per user
SELECT
  'candidates' as table_name,
  user_id,
  COUNT(*) as record_count
FROM candidates
GROUP BY user_id
UNION ALL
SELECT
  'clients' as table_name,
  user_id,
  COUNT(*) as record_count
FROM clients
GROUP BY user_id
UNION ALL
SELECT
  'matches' as table_name,
  user_id,
  COUNT(*) as record_count
FROM matches
GROUP BY user_id
ORDER BY table_name, user_id;

-- =====================================================
-- NOTES FOR EXECUTION
-- =====================================================
-- 1. First, find your user ID:
--    SELECT id, email FROM auth.users;
--
-- 2. Uncomment the UPDATE statements in Step 2 and replace YOUR_USER_ID_HERE
--
-- 3. Run the entire script
--
-- 4. Uncomment the ALTER COLUMN statements in Step 3 and run them
--
-- 5. Run the verification queries at the end
--
-- 6. Test by creating a new account and verifying data isolation
-- =====================================================
