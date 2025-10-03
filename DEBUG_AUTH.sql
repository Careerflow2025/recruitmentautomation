-- =====================================================
-- DEBUG AUTH SYSTEM
-- =====================================================

-- 1. Check if users exist
SELECT
  id,
  email,
  email_confirmed_at,
  created_at,
  last_sign_in_at
FROM auth.users
ORDER BY created_at DESC;

-- 2. Check RLS is enabled on all tables
SELECT
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('candidates', 'clients', 'matches', 'match_statuses', 'match_notes')
ORDER BY tablename;

-- 3. Check all RLS policies exist
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd as operation,
  qual as using_clause
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 4. Check if candidates/clients have user_id column
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('candidates', 'clients', 'matches')
  AND column_name = 'user_id';

-- 5. Test if current logged-in user can see data
-- (Run this while logged into the app)
SELECT
  'candidates' as table_name,
  COUNT(*) as total_rows,
  COUNT(user_id) as rows_with_user_id
FROM candidates
UNION ALL
SELECT
  'clients',
  COUNT(*),
  COUNT(user_id)
FROM clients
UNION ALL
SELECT
  'matches',
  COUNT(*),
  COUNT(user_id)
FROM matches;

-- 6. Check Supabase auth configuration
-- Go to Supabase Dashboard > Authentication > Settings
-- Verify:
-- - Email confirmations: DISABLED (or you must confirm emails)
-- - Email templates are configured
-- - Site URL is set to http://localhost:3010
