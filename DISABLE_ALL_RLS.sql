-- Disable RLS on all tables so match generation works with anon key
ALTER TABLE candidates DISABLE ROW LEVEL SECURITY;
ALTER TABLE clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE matches DISABLE ROW LEVEL SECURITY;

-- Verify all are disabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('candidates', 'clients', 'matches')
ORDER BY tablename;
