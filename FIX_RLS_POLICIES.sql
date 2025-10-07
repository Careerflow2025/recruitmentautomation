-- FIX: Enable RLS on all main tables and add user isolation policies
-- This ensures each user ONLY sees their own data

-- Enable RLS on all tables
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_notes ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (to avoid conflicts)
DROP POLICY IF EXISTS "Users see only their candidates" ON candidates;
DROP POLICY IF EXISTS "Users see only their clients" ON clients;
DROP POLICY IF EXISTS "Users see only their matches" ON matches;
DROP POLICY IF EXISTS "Users see only their match statuses" ON match_statuses;
DROP POLICY IF EXISTS "Users see only their match notes" ON match_notes;

-- CANDIDATES: Users can only see/manage their own candidates
CREATE POLICY "Users see only their candidates"
  ON candidates
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- CLIENTS: Users can only see/manage their own clients
CREATE POLICY "Users see only their clients"
  ON clients
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- MATCHES: Users can only see matches for their own candidates/clients
CREATE POLICY "Users see only their matches"
  ON matches
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- MATCH STATUSES: Users can only see/update statuses for their matches
CREATE POLICY "Users see only their match statuses"
  ON match_statuses
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- MATCH NOTES: Users can only see/manage notes for their matches
CREATE POLICY "Users see only their match notes"
  ON match_notes
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Verify RLS is enabled (should return 5 rows)
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename IN ('candidates', 'clients', 'matches', 'match_statuses', 'match_notes')
  AND schemaname = 'public';
