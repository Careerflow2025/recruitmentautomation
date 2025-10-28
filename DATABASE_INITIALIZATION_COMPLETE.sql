-- =====================================================
-- COMPLETE DATABASE INITIALIZATION SCRIPT
-- UK Dental Recruitment Matching System
-- =====================================================
-- This script creates ALL required tables and fixes common issues
--
-- INSTRUCTIONS:
-- 1. Go to Supabase Dashboard: https://supabase.com/dashboard
-- 2. Select your project
-- 3. Go to SQL Editor
-- 4. Create new query
-- 5. Copy and paste this ENTIRE file
-- 6. Click "Run"
-- 7. Refresh your application
-- =====================================================

BEGIN;

-- =====================================================
-- 1. CANDIDATES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS candidates (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  role TEXT NOT NULL,
  postcode TEXT NOT NULL,
  salary TEXT,
  days TEXT,
  experience TEXT,
  notes TEXT,
  added_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_candidates_user ON candidates(user_id);
CREATE INDEX IF NOT EXISTS idx_candidates_role ON candidates(role);
CREATE INDEX IF NOT EXISTS idx_candidates_postcode ON candidates(postcode);
CREATE INDEX IF NOT EXISTS idx_candidates_added_at ON candidates(added_at DESC);

ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own candidates" ON candidates;
DROP POLICY IF EXISTS "Users can insert their own candidates" ON candidates;
DROP POLICY IF EXISTS "Users can update their own candidates" ON candidates;
DROP POLICY IF EXISTS "Users can delete their own candidates" ON candidates;

CREATE POLICY "Users can view their own candidates" ON candidates
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own candidates" ON candidates
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own candidates" ON candidates
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own candidates" ON candidates
  FOR DELETE USING (auth.uid() = user_id);


-- =====================================================
-- 2. CLIENTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  surgery TEXT NOT NULL,
  client_name TEXT,
  client_email TEXT,
  client_phone TEXT,
  role TEXT NOT NULL,
  postcode TEXT NOT NULL,
  budget TEXT,
  requirement TEXT,
  system TEXT,
  notes TEXT,
  added_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clients_user ON clients(user_id);
CREATE INDEX IF NOT EXISTS idx_clients_role ON clients(role);
CREATE INDEX IF NOT EXISTS idx_clients_postcode ON clients(postcode);
CREATE INDEX IF NOT EXISTS idx_clients_added_at ON clients(added_at DESC);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own clients" ON clients;
DROP POLICY IF EXISTS "Users can insert their own clients" ON clients;
DROP POLICY IF EXISTS "Users can update their own clients" ON clients;
DROP POLICY IF EXISTS "Users can delete their own clients" ON clients;

CREATE POLICY "Users can view their own clients" ON clients
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own clients" ON clients
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own clients" ON clients
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own clients" ON clients
  FOR DELETE USING (auth.uid() = user_id);


-- =====================================================
-- 3. MATCHES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  commute_minutes INTEGER,
  commute_display TEXT,
  commute_band TEXT,
  role_match BOOLEAN,
  role_match_display TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, candidate_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_matches_user ON matches(user_id);
CREATE INDEX IF NOT EXISTS idx_matches_candidate ON matches(candidate_id);
CREATE INDEX IF NOT EXISTS idx_matches_client ON matches(client_id);
CREATE INDEX IF NOT EXISTS idx_matches_commute ON matches(commute_minutes);

ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own matches" ON matches;
DROP POLICY IF EXISTS "Users can insert their own matches" ON matches;
DROP POLICY IF EXISTS "Users can update their own matches" ON matches;
DROP POLICY IF EXISTS "Users can delete their own matches" ON matches;

CREATE POLICY "Users can view their own matches" ON matches
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own matches" ON matches
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own matches" ON matches
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own matches" ON matches
  FOR DELETE USING (auth.uid() = user_id);


-- =====================================================
-- 4. MATCH_GENERATION_STATUS TABLE (CRITICAL FOR ASYNC PROCESSING)
-- =====================================================
CREATE TABLE IF NOT EXISTS match_generation_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('processing', 'completed', 'error')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  matches_found INTEGER DEFAULT 0,
  excluded_over_80min INTEGER DEFAULT 0,
  errors INTEGER DEFAULT 0,
  method_used TEXT DEFAULT 'google_maps',
  error_message TEXT,
  percent_complete INTEGER DEFAULT 0 CHECK (percent_complete >= 0 AND percent_complete <= 100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_match_generation_status_user_id ON match_generation_status(user_id);
CREATE INDEX IF NOT EXISTS idx_match_generation_status_status ON match_generation_status(status);
CREATE INDEX IF NOT EXISTS idx_match_generation_status_created ON match_generation_status(created_at DESC);

ALTER TABLE match_generation_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own match generation status" ON match_generation_status;
DROP POLICY IF EXISTS "Users can insert their own match generation status" ON match_generation_status;
DROP POLICY IF EXISTS "Users can update their own match generation status" ON match_generation_status;

CREATE POLICY "Users can view their own match generation status" ON match_generation_status
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own match generation status" ON match_generation_status
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own match generation status" ON match_generation_status
  FOR UPDATE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_match_generation_status_timestamp ON match_generation_status CASCADE;
DROP FUNCTION IF EXISTS update_match_generation_status_timestamp() CASCADE;

CREATE OR REPLACE FUNCTION update_match_generation_status_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_match_generation_status_timestamp
  BEFORE UPDATE ON match_generation_status
  FOR EACH ROW
  EXECUTE FUNCTION update_match_generation_status_timestamp();


-- =====================================================
-- 5. MATCH_STATUSES TABLE (For tracking placed/rejected matches)
-- =====================================================
CREATE TABLE IF NOT EXISTS match_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  status TEXT CHECK (status IN ('placed', 'in-progress', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, candidate_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_match_statuses_user ON match_statuses(user_id);
CREATE INDEX IF NOT EXISTS idx_match_statuses_candidate ON match_statuses(candidate_id);
CREATE INDEX IF NOT EXISTS idx_match_statuses_client ON match_statuses(client_id);
CREATE INDEX IF NOT EXISTS idx_match_statuses_status ON match_statuses(status);

ALTER TABLE match_statuses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own match statuses" ON match_statuses;
DROP POLICY IF EXISTS "Users can insert their own match statuses" ON match_statuses;
DROP POLICY IF EXISTS "Users can update their own match statuses" ON match_statuses;
DROP POLICY IF EXISTS "Users can delete their own match statuses" ON match_statuses;

CREATE POLICY "Users can view their own match statuses" ON match_statuses
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own match statuses" ON match_statuses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own match statuses" ON match_statuses
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own match statuses" ON match_statuses
  FOR DELETE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_match_status_timestamp ON match_statuses CASCADE;
DROP TRIGGER IF EXISTS update_match_statuses_timestamp ON match_statuses CASCADE;
DROP FUNCTION IF EXISTS update_match_status_timestamp() CASCADE;

CREATE OR REPLACE FUNCTION update_match_status_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_match_status_timestamp
  BEFORE UPDATE ON match_statuses
  FOR EACH ROW
  EXECUTE FUNCTION update_match_status_timestamp();


-- =====================================================
-- 6. MATCH_NOTES TABLE (For notes on matches)
-- =====================================================
CREATE TABLE IF NOT EXISTS match_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_match_notes_user ON match_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_match_notes_candidate ON match_notes(candidate_id);
CREATE INDEX IF NOT EXISTS idx_match_notes_client ON match_notes(client_id);
CREATE INDEX IF NOT EXISTS idx_match_notes_created ON match_notes(created_at DESC);

ALTER TABLE match_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own match notes" ON match_notes;
DROP POLICY IF EXISTS "Users can insert their own match notes" ON match_notes;
DROP POLICY IF EXISTS "Users can update their own match notes" ON match_notes;
DROP POLICY IF EXISTS "Users can delete their own match notes" ON match_notes;

CREATE POLICY "Users can view their own match notes" ON match_notes
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own match notes" ON match_notes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own match notes" ON match_notes
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own match notes" ON match_notes
  FOR DELETE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_match_note_timestamp ON match_notes CASCADE;
DROP FUNCTION IF EXISTS update_match_note_timestamp() CASCADE;

CREATE OR REPLACE FUNCTION update_match_note_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_match_note_timestamp
  BEFORE UPDATE ON match_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_match_note_timestamp();


-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================
DO $$
BEGIN
  RAISE NOTICE '=====================================================';
  RAISE NOTICE 'DATABASE INITIALIZATION COMPLETE!';
  RAISE NOTICE '=====================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Tables created:';
  RAISE NOTICE '  ✅ candidates';
  RAISE NOTICE '  ✅ clients';
  RAISE NOTICE '  ✅ matches';
  RAISE NOTICE '  ✅ match_generation_status (CRITICAL FOR ASYNC MATCHING)';
  RAISE NOTICE '  ✅ match_statuses';
  RAISE NOTICE '  ✅ match_notes';
  RAISE NOTICE '';
  RAISE NOTICE 'Row Level Security (RLS) enabled on all tables';
  RAISE NOTICE 'Indexes created for performance optimization';
  RAISE NOTICE 'Triggers configured for auto-updating timestamps';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Refresh your application';
  RAISE NOTICE '  2. Log in with your account';
  RAISE NOTICE '  3. Try "Regenerate with Google Maps" button';
  RAISE NOTICE '  4. System should now work correctly';
  RAISE NOTICE '=====================================================';
END $$;

COMMIT;

-- Verify table creation
SELECT
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE columns.table_name = tables.table_name) as column_count
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
  AND table_name IN ('candidates', 'clients', 'matches', 'match_generation_status', 'match_statuses', 'match_notes')
ORDER BY table_name;
