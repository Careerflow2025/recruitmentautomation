-- =====================================================
-- COMPLETE DATABASE SETUP FOR DENTAL RECRUITMENT MATCHER
-- =====================================================
-- Run this ONCE in your Supabase SQL Editor
-- Go to: https://supabase.com/dashboard → Your Project → SQL Editor → New Query
-- Paste this entire file and click RUN
-- =====================================================

-- 1. CREATE CANDIDATES TABLE
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

-- Create indexes for candidates
CREATE INDEX IF NOT EXISTS idx_candidates_user ON candidates(user_id);
CREATE INDEX IF NOT EXISTS idx_candidates_role ON candidates(role);
CREATE INDEX IF NOT EXISTS idx_candidates_postcode ON candidates(postcode);
CREATE INDEX IF NOT EXISTS idx_candidates_added_at ON candidates(added_at DESC);

-- Enable RLS on candidates
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for candidates (user isolation)
CREATE POLICY "Users can view their own candidates" ON candidates
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own candidates" ON candidates
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own candidates" ON candidates
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own candidates" ON candidates
  FOR DELETE USING (auth.uid() = user_id);


-- 2. CREATE CLIENTS TABLE
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

-- Create indexes for clients
CREATE INDEX IF NOT EXISTS idx_clients_user ON clients(user_id);
CREATE INDEX IF NOT EXISTS idx_clients_role ON clients(role);
CREATE INDEX IF NOT EXISTS idx_clients_postcode ON clients(postcode);
CREATE INDEX IF NOT EXISTS idx_clients_added_at ON clients(added_at DESC);

-- Enable RLS on clients
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- RLS Policies for clients (user isolation)
CREATE POLICY "Users can view their own clients" ON clients
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own clients" ON clients
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own clients" ON clients
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own clients" ON clients
  FOR DELETE USING (auth.uid() = user_id);


-- 3. CREATE MATCHES TABLE (Computed View)
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

-- Create indexes for matches
CREATE INDEX IF NOT EXISTS idx_matches_user ON matches(user_id);
CREATE INDEX IF NOT EXISTS idx_matches_candidate ON matches(candidate_id);
CREATE INDEX IF NOT EXISTS idx_matches_client ON matches(client_id);
CREATE INDEX IF NOT EXISTS idx_matches_commute ON matches(commute_minutes);

-- Enable RLS on matches
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

-- RLS Policies for matches (user isolation)
CREATE POLICY "Users can view their own matches" ON matches
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own matches" ON matches
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own matches" ON matches
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own matches" ON matches
  FOR DELETE USING (auth.uid() = user_id);


-- 4. CREATE MATCH_STATUSES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS match_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  status TEXT CHECK (status IN ('placed', 'in-progress', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(candidate_id, client_id)
);

-- Create indexes for match_statuses
CREATE INDEX IF NOT EXISTS idx_match_statuses_candidate ON match_statuses(candidate_id);
CREATE INDEX IF NOT EXISTS idx_match_statuses_client ON match_statuses(client_id);
CREATE INDEX IF NOT EXISTS idx_match_statuses_status ON match_statuses(status);

-- Create function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_match_status_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_match_statuses_timestamp ON match_statuses;
CREATE TRIGGER update_match_statuses_timestamp
  BEFORE UPDATE ON match_statuses
  FOR EACH ROW
  EXECUTE FUNCTION update_match_status_timestamp();

-- Enable RLS on match_statuses
ALTER TABLE match_statuses ENABLE ROW LEVEL SECURITY;

-- Allow all operations for now
DROP POLICY IF EXISTS "Allow all operations on match_statuses" ON match_statuses;
CREATE POLICY "Allow all operations on match_statuses" ON match_statuses
  FOR ALL USING (true) WITH CHECK (true);


-- 5. CREATE MATCH_NOTES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS match_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  note_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (candidate_id, client_id) REFERENCES match_statuses(candidate_id, client_id) ON DELETE CASCADE
);

-- Create indexes for match_notes
CREATE INDEX IF NOT EXISTS idx_match_notes_match ON match_notes(candidate_id, client_id);
CREATE INDEX IF NOT EXISTS idx_match_notes_created ON match_notes(created_at DESC);

-- Enable RLS on match_notes
ALTER TABLE match_notes ENABLE ROW LEVEL SECURITY;

-- Allow all operations for now
DROP POLICY IF EXISTS "Allow all operations on match_notes" ON match_notes;
CREATE POLICY "Allow all operations on match_notes" ON match_notes
  FOR ALL USING (true) WITH CHECK (true);


-- 6. ADD COMMENTS FOR DOCUMENTATION
-- =====================================================
COMMENT ON TABLE candidates IS 'Stores all candidate (job seeker) information';
COMMENT ON TABLE clients IS 'Stores all client (dental surgery) information';
COMMENT ON TABLE matches IS 'Stores computed matches between candidates and clients with commute data';
COMMENT ON TABLE match_statuses IS 'Stores the status of matches (placed, in-progress, rejected) set by recruiters';
COMMENT ON TABLE match_notes IS 'Stores notes added by recruiters for specific matches';

COMMENT ON COLUMN match_statuses.status IS 'Status: placed (green), in-progress (orange), rejected (red)';
COMMENT ON COLUMN match_notes.note_text IS 'Text content of the note added by recruiter';


-- =====================================================
-- SETUP COMPLETE!
-- =====================================================
-- You should now have 5 tables:
-- 1. candidates
-- 2. clients
-- 3. matches
-- 4. match_statuses
-- 5. match_notes
--
-- All tables have:
-- ✅ Proper indexes for performance
-- ✅ Row Level Security enabled (allow all for now)
-- ✅ Proper constraints and relationships
-- ✅ Ready for authentication (will add user_id later)
--
-- Next steps:
-- 1. Verify tables exist in Supabase Dashboard → Database → Tables
-- 2. Test your app - all features should work
-- 3. When ready, add authentication (separate migration)
-- =====================================================
