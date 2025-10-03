-- =====================================================
-- IMMEDIATE AUTHENTICATION FIX
-- =====================================================
-- Run this in Supabase SQL Editor to fix authentication issues
-- =====================================================

-- Step 1: Clean up any corrupted auth data
-- =====================================================
BEGIN;

-- Delete all existing auth data to start fresh
DELETE FROM auth.identities;
DELETE FROM auth.sessions;
DELETE FROM auth.refresh_tokens;
DELETE FROM auth.users;

-- Verify cleanup
SELECT COUNT(*) as user_count FROM auth.users;

COMMIT;

-- Step 2: Check RLS policies are set correctly
-- =====================================================

-- First, check if RLS is enabled
SELECT
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('candidates', 'clients', 'matches', 'match_statuses', 'match_notes')
ORDER BY tablename;

-- Step 3: Fix RLS policies to use auth.uid() correctly
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own candidates" ON candidates;
DROP POLICY IF EXISTS "Users can insert their own candidates" ON candidates;
DROP POLICY IF EXISTS "Users can update their own candidates" ON candidates;
DROP POLICY IF EXISTS "Users can delete their own candidates" ON candidates;

DROP POLICY IF EXISTS "Users can view their own clients" ON clients;
DROP POLICY IF EXISTS "Users can insert their own clients" ON clients;
DROP POLICY IF EXISTS "Users can update their own clients" ON clients;
DROP POLICY IF EXISTS "Users can delete their own clients" ON clients;

DROP POLICY IF EXISTS "Users can view matches from their own data" ON matches;
DROP POLICY IF EXISTS "Users can insert matches from their own data" ON matches;
DROP POLICY IF EXISTS "Users can delete their own matches" ON matches;

DROP POLICY IF EXISTS "Users can view their own match statuses" ON match_statuses;
DROP POLICY IF EXISTS "Users can insert their own match statuses" ON match_statuses;
DROP POLICY IF EXISTS "Users can update their own match statuses" ON match_statuses;
DROP POLICY IF EXISTS "Users can delete their own match statuses" ON match_statuses;

DROP POLICY IF EXISTS "Users can view their own match notes" ON match_notes;
DROP POLICY IF EXISTS "Users can insert their own match notes" ON match_notes;
DROP POLICY IF EXISTS "Users can delete their own match notes" ON match_notes;

-- Create new simplified RLS policies for CANDIDATES
CREATE POLICY "Enable all for authenticated users own candidates"
ON candidates
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create new simplified RLS policies for CLIENTS
CREATE POLICY "Enable all for authenticated users own clients"
ON clients
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create new simplified RLS policies for MATCHES
CREATE POLICY "Enable all for authenticated users own matches"
ON matches
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create new simplified RLS policies for MATCH_STATUSES
CREATE POLICY "Enable all for authenticated users own match_statuses"
ON match_statuses
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create new simplified RLS policies for MATCH_NOTES
CREATE POLICY "Enable all for authenticated users own match_notes"
ON match_notes
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Step 4: Verify the policies
-- =====================================================

SELECT
  schemaname,
  tablename,
  policyname,
  cmd as operation
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd;

-- =====================================================
-- IMPORTANT: After running this SQL
-- =====================================================
-- 1. Go to Supabase Dashboard → Authentication → Providers → Email
-- 2. Make sure these settings are correct:
--    - Enable Email provider: ON
--    - Confirm email: OFF (for easier testing)
--    - Minimum password length: 6
--
-- 3. Create a new user via the SIGNUP page (NOT SQL!):
--    - Go to http://localhost:3007/signup (or whatever port)
--    - Email: admin@test.com
--    - Password: test123
--
-- 4. Then login at http://localhost:3007/login
--
-- DO NOT create users via SQL - it breaks the auth schema!
-- =====================================================