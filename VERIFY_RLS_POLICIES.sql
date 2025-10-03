-- =====================================================
-- VERIFY RLS POLICIES - Check All Policies Are Active
-- =====================================================

-- Check if RLS is enabled on all tables
SELECT
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('candidates', 'clients', 'matches', 'match_statuses', 'match_notes')
ORDER BY tablename;

-- List all RLS policies
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
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- If RLS is NOT enabled (rls_enabled = false), you need to enable it:
-- ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE match_statuses ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE match_notes ENABLE ROW LEVEL SECURITY;
