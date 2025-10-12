-- =============================================
-- CRITICAL FIX: Create match_generation_status table
-- =============================================
-- This fixes the error: "column match_statuses.completed_at does not exist"
--
-- INSTRUCTIONS:
-- 1. Go to Supabase Dashboard → SQL Editor
-- 2. Copy and paste this ENTIRE file
-- 3. Click "Run" button
-- 4. Refresh your app and try "Regenerate with Google Maps" again

-- Create a separate table for tracking match generation job status
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

-- RLS Policy: Users can only see their own job status
CREATE POLICY "Users can view their own match generation status"
  ON match_generation_status
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policy: Users can insert their own job status
CREATE POLICY "Users can insert their own match generation status"
  ON match_generation_status
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can update their own job status
CREATE POLICY "Users can update their own match generation status"
  ON match_generation_status
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Drop existing trigger/function if they exist
DROP TRIGGER IF EXISTS update_match_generation_status_timestamp ON match_generation_status;
DROP FUNCTION IF EXISTS update_match_generation_status_timestamp();

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_match_generation_status_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_match_generation_status_timestamp
  BEFORE UPDATE ON match_generation_status
  FOR EACH ROW
  EXECUTE FUNCTION update_match_generation_status_timestamp();

-- Verify the table was created
SELECT
  'Table created successfully!' as message,
  COUNT(*) as column_count
FROM information_schema.columns
WHERE table_name = 'match_generation_status';
