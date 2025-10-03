-- Disable RLS on match_statuses and match_notes tables
ALTER TABLE match_statuses DISABLE ROW LEVEL SECURITY;
ALTER TABLE match_notes DISABLE ROW LEVEL SECURITY;

-- Verify all tables have RLS disabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('candidates', 'clients', 'matches', 'match_statuses', 'match_notes')
ORDER BY tablename;
