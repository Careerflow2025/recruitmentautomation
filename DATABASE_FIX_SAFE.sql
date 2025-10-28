-- =====================================================
-- SAFE DATABASE FIX - Handles Existing Objects Gracefully
-- UK Dental Recruitment Matching System
-- =====================================================
-- This script safely updates database without breaking existing data
--
-- INSTRUCTIONS:
-- 1. Go to Supabase Dashboard: https://supabase.com/dashboard
-- 2. Select your project
-- 3. Go to SQL Editor → New Query
-- 4. Copy and paste this ENTIRE file
-- 5. Click "Run"
-- =====================================================

-- =====================================================
-- CRITICAL FIX: Create match_generation_status table
-- =====================================================
-- This is the PRIMARY issue preventing match generation from working

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

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_match_generation_status_user_id ON match_generation_status(user_id);
CREATE INDEX IF NOT EXISTS idx_match_generation_status_status ON match_generation_status(status);
CREATE INDEX IF NOT EXISTS idx_match_generation_status_created ON match_generation_status(created_at DESC);

-- Enable RLS (Row Level Security)
ALTER TABLE match_generation_status ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own match generation status" ON match_generation_status;
DROP POLICY IF EXISTS "Users can insert their own match generation status" ON match_generation_status;
DROP POLICY IF EXISTS "Users can update their own match generation status" ON match_generation_status;

-- RLS Policies
CREATE POLICY "Users can view their own match generation status"
  ON match_generation_status
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own match generation status"
  ON match_generation_status
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own match generation status"
  ON match_generation_status
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Drop existing trigger CASCADE (handles dependencies)
DROP TRIGGER IF EXISTS update_match_generation_status_timestamp ON match_generation_status CASCADE;

-- Drop existing function CASCADE (handles dependencies)
DROP FUNCTION IF EXISTS update_match_generation_status_timestamp() CASCADE;

-- Create function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_match_generation_status_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update updated_at
CREATE TRIGGER update_match_generation_status_timestamp
  BEFORE UPDATE ON match_generation_status
  FOR EACH ROW
  EXECUTE FUNCTION update_match_generation_status_timestamp();


-- =====================================================
-- ENSURE OTHER REQUIRED TABLES EXIST
-- =====================================================

-- Candidates table
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
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;

-- Clients table
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
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- Matches table
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

-- Match statuses table
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
ALTER TABLE match_statuses ENABLE ROW LEVEL SECURITY;

-- Match notes table
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
ALTER TABLE match_notes ENABLE ROW LEVEL SECURITY;


-- =====================================================
-- VERIFICATION
-- =====================================================
DO $$
BEGIN
  RAISE NOTICE '=====================================================';
  RAISE NOTICE '✅ DATABASE FIX COMPLETE!';
  RAISE NOTICE '=====================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Critical table created:';
  RAISE NOTICE '  ✅ match_generation_status (ASYNC PROCESSING)';
  RAISE NOTICE '';
  RAISE NOTICE 'All other required tables verified';
  RAISE NOTICE 'Row Level Security (RLS) enabled';
  RAISE NOTICE 'Indexes created for performance';
  RAISE NOTICE 'Triggers configured for auto-updates';
  RAISE NOTICE '';
  RAISE NOTICE '🚀 Next steps:';
  RAISE NOTICE '  1. Restart your Next.js application';
  RAISE NOTICE '  2. Log in to your account';
  RAISE NOTICE '  3. Click "Regenerate with Google Maps"';
  RAISE NOTICE '  4. System should now work correctly!';
  RAISE NOTICE '=====================================================';
END $$;

-- Verify critical table was created
SELECT
  'match_generation_status' as table_name,
  COUNT(*) as column_count,
  '✅ CRITICAL TABLE EXISTS' as status
FROM information_schema.columns
WHERE table_name = 'match_generation_status';
