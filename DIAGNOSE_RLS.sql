-- DIAGNOSE RLS ISSUE
-- Run this to check if RLS is actually working

-- 1. Check if RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename IN ('candidates', 'clients', 'matches')
  AND schemaname = 'public';

-- Expected: All should show rowsecurity = true

-- 2. Check what policies exist
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename IN ('candidates', 'clients', 'matches')
  AND schemaname = 'public';

-- Expected: Should show policies with qual containing 'auth.uid()'

-- 3. Check the actual column structure of candidates table
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'candidates'
  AND column_name LIKE '%user%';

-- Expected: Should show a column like 'user_id' (UUID type)

-- 4. Test query as authenticated user (simulated)
-- This shows what columns exist
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'candidates'
ORDER BY ordinal_position;

-- 5. Check if candidates table actually HAS user_id column
SELECT COUNT(*) as total_candidates,
       COUNT(DISTINCT user_id) as unique_users
FROM candidates;

-- Expected: Should show multiple unique users if multi-tenant

-- 6. Sample data to see structure
SELECT id, user_id, role, added_at
FROM candidates
LIMIT 5;

-- This will show if user_id column exists and has data
