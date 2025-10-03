-- TEMPORARY FIX: Disable RLS on matches table
-- This allows match generation to work
-- We can re-enable it later with proper policies

-- Disable RLS on matches table
ALTER TABLE matches DISABLE ROW LEVEL SECURITY;

-- Verify RLS is disabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND tablename = 'matches';

-- Expected result: rowsecurity = false
