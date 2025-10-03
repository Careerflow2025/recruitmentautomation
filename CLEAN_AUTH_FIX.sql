-- =====================================================
-- CLEAN AUTHENTICATION FIX - RUN THIS ONE!
-- =====================================================
-- This properly drops ALL existing policies before creating new ones
-- =====================================================

-- Step 1: Clean up auth data
-- =====================================================
BEGIN;

-- Delete all existing auth data to start fresh
DELETE FROM auth.identities WHERE user_id IN (SELECT id FROM auth.users);
DELETE FROM auth.sessions;
DELETE FROM auth.refresh_tokens;
DELETE FROM auth.users;

COMMIT;

-- Verify cleanup
SELECT COUNT(*) as user_count FROM auth.users;

-- Step 2: Drop ALL existing policies (including the ones causing errors)
-- =====================================================

-- Drop ALL policies on candidates table
DROP POLICY IF EXISTS "Enable all for authenticated users own candidates" ON candidates;
DROP POLICY IF EXISTS "Users can view their own candidates" ON candidates;
DROP POLICY IF EXISTS "Users can insert their own candidates" ON candidates;
DROP POLICY IF EXISTS "Users can update their own candidates" ON candidates;
DROP POLICY IF EXISTS "Users can delete their own candidates" ON candidates;
DROP POLICY IF EXISTS "candidates_select_policy" ON candidates;
DROP POLICY IF EXISTS "candidates_insert_policy" ON candidates;
DROP POLICY IF EXISTS "candidates_update_policy" ON candidates;
DROP POLICY IF EXISTS "candidates_delete_policy" ON candidates;
DROP POLICY IF EXISTS "Allow all operations on candidates" ON candidates;

-- Drop ALL policies on clients table
DROP POLICY IF EXISTS "Enable all for authenticated users own clients" ON clients;
DROP POLICY IF EXISTS "Users can view their own clients" ON clients;
DROP POLICY IF EXISTS "Users can insert their own clients" ON clients;
DROP POLICY IF EXISTS "Users can update their own clients" ON clients;
DROP POLICY IF EXISTS "Users can delete their own clients" ON clients;
DROP POLICY IF EXISTS "clients_select_policy" ON clients;
DROP POLICY IF EXISTS "clients_insert_policy" ON clients;
DROP POLICY IF EXISTS "clients_update_policy" ON clients;
DROP POLICY IF EXISTS "clients_delete_policy" ON clients;
DROP POLICY IF EXISTS "Allow all operations on clients" ON clients;

-- Drop ALL policies on matches table
DROP POLICY IF EXISTS "Enable all for authenticated users own matches" ON matches;
DROP POLICY IF EXISTS "Users can view matches from their own data" ON matches;
DROP POLICY IF EXISTS "Users can insert matches from their own data" ON matches;
DROP POLICY IF EXISTS "Users can delete their own matches" ON matches;
DROP POLICY IF EXISTS "matches_select_policy" ON matches;
DROP POLICY IF EXISTS "matches_insert_policy" ON matches;
DROP POLICY IF EXISTS "matches_update_policy" ON matches;
DROP POLICY IF EXISTS "matches_delete_policy" ON matches;
DROP POLICY IF EXISTS "Allow all operations on matches" ON matches;

-- Drop ALL policies on match_statuses table
DROP POLICY IF EXISTS "Enable all for authenticated users own match_statuses" ON match_statuses;
DROP POLICY IF EXISTS "Users can view their own match statuses" ON match_statuses;
DROP POLICY IF EXISTS "Users can insert their own match statuses" ON match_statuses;
DROP POLICY IF EXISTS "Users can update their own match statuses" ON match_statuses;
DROP POLICY IF EXISTS "Users can delete their own match statuses" ON match_statuses;
DROP POLICY IF EXISTS "match_statuses_select_policy" ON match_statuses;
DROP POLICY IF EXISTS "match_statuses_insert_policy" ON match_statuses;
DROP POLICY IF EXISTS "match_statuses_update_policy" ON match_statuses;
DROP POLICY IF EXISTS "match_statuses_delete_policy" ON match_statuses;
DROP POLICY IF EXISTS "Allow all operations on match_statuses" ON match_statuses;

-- Drop ALL policies on match_notes table
DROP POLICY IF EXISTS "Enable all for authenticated users own match_notes" ON match_notes;
DROP POLICY IF EXISTS "Users can view their own match notes" ON match_notes;
DROP POLICY IF EXISTS "Users can insert their own match notes" ON match_notes;
DROP POLICY IF EXISTS "Users can delete their own match notes" ON match_notes;
DROP POLICY IF EXISTS "match_notes_select_policy" ON match_notes;
DROP POLICY IF EXISTS "match_notes_insert_policy" ON match_notes;
DROP POLICY IF EXISTS "match_notes_update_policy" ON match_notes;
DROP POLICY IF EXISTS "match_notes_delete_policy" ON match_notes;
DROP POLICY IF EXISTS "Allow all operations on match_notes" ON match_notes;

-- Step 3: Create clean, simple RLS policies
-- =====================================================

-- CANDIDATES: Simple policy for authenticated users
CREATE POLICY "candidates_authenticated_users_policy"
ON candidates
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- CLIENTS: Simple policy for authenticated users
CREATE POLICY "clients_authenticated_users_policy"
ON clients
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- MATCHES: Simple policy for authenticated users
CREATE POLICY "matches_authenticated_users_policy"
ON matches
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- MATCH_STATUSES: Simple policy for authenticated users
CREATE POLICY "match_statuses_authenticated_users_policy"
ON match_statuses
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- MATCH_NOTES: Simple policy for authenticated users
CREATE POLICY "match_notes_authenticated_users_policy"
ON match_notes
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Step 4: Verify RLS is enabled on all tables
-- =====================================================

-- Make sure RLS is enabled
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_notes ENABLE ROW LEVEL SECURITY;

-- Step 5: Verify everything is set up correctly
-- =====================================================

-- Check RLS is enabled
SELECT
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('candidates', 'clients', 'matches', 'match_statuses', 'match_notes')
ORDER BY tablename;

-- Check policies exist
SELECT
  tablename,
  policyname
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename;

-- Check user_id columns exist
SELECT
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'user_id'
ORDER BY table_name;

-- =====================================================
-- NEXT STEPS - VERY IMPORTANT!
-- =====================================================
--
-- 1. After running this SQL successfully...
--
-- 2. Go to Supabase Dashboard:
--    Authentication → Providers → Email
--    - Enable Email provider: ON
--    - Confirm email: OFF ← TURN THIS OFF!
--    - Save
--
-- 3. Create a NEW user via SIGNUP page (NOT SQL!):
--    http://localhost:3007/signup
--    Email: admin@test.com
--    Password: test123
--
-- 4. Login at:
--    http://localhost:3007/login
--
-- NEVER create users via SQL - always use signup page!
-- =====================================================