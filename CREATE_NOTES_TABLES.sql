-- ============================================
-- CREATE NOTES TABLES FOR CANDIDATES AND CLIENTS
-- ============================================
-- Run this in Supabase SQL Editor
-- Creates timestamped multi-note system for both candidates and clients
-- ============================================

-- CANDIDATE NOTES TABLE
CREATE TABLE IF NOT EXISTS candidate_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- CLIENT NOTES TABLE
CREATE TABLE IF NOT EXISTS client_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- CREATE INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_candidate_notes_candidate_id ON candidate_notes(candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_notes_user_id ON candidate_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_candidate_notes_created_at ON candidate_notes(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_client_notes_client_id ON client_notes(client_id);
CREATE INDEX IF NOT EXISTS idx_client_notes_user_id ON client_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_client_notes_created_at ON client_notes(created_at DESC);

-- ENABLE ROW LEVEL SECURITY
ALTER TABLE candidate_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_notes ENABLE ROW LEVEL SECURITY;

-- RLS POLICIES FOR CANDIDATE NOTES
CREATE POLICY "Users can view their own candidate notes"
  ON candidate_notes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own candidate notes"
  ON candidate_notes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own candidate notes"
  ON candidate_notes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own candidate notes"
  ON candidate_notes FOR DELETE
  USING (auth.uid() = user_id);

-- RLS POLICIES FOR CLIENT NOTES
CREATE POLICY "Users can view their own client notes"
  ON client_notes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own client notes"
  ON client_notes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own client notes"
  ON client_notes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own client notes"
  ON client_notes FOR DELETE
  USING (auth.uid() = user_id);

-- UPDATE TRIGGER FOR updated_at
CREATE OR REPLACE FUNCTION update_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_candidate_notes_updated_at
  BEFORE UPDATE ON candidate_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_notes_updated_at();

CREATE TRIGGER update_client_notes_updated_at
  BEFORE UPDATE ON client_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_notes_updated_at();

-- ============================================
-- ✅ DONE! Notes tables created with:
-- - UUID primary keys
-- - Foreign keys to candidates/clients
-- - user_id for ownership
-- - Timestamps (created_at, updated_at)
-- - RLS policies for security
-- - Indexes for performance
-- ============================================

SELECT 'Notes tables created successfully!' AS status;
SELECT 'candidate_notes' AS table_name, COUNT(*) AS row_count FROM candidate_notes
UNION ALL
SELECT 'client_notes', COUNT(*) FROM client_notes;
