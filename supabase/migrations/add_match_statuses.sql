-- Create match_statuses table to store recruiter actions on matches
CREATE TABLE IF NOT EXISTS match_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  status TEXT CHECK (status IN ('placed', 'in-progress', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(candidate_id, client_id)
);

-- Create match_notes table to store notes for each match
CREATE TABLE IF NOT EXISTS match_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  note_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (candidate_id, client_id) REFERENCES match_statuses(candidate_id, client_id) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_match_statuses_candidate ON match_statuses(candidate_id);
CREATE INDEX IF NOT EXISTS idx_match_statuses_client ON match_statuses(client_id);
CREATE INDEX IF NOT EXISTS idx_match_statuses_status ON match_statuses(status);
CREATE INDEX IF NOT EXISTS idx_match_notes_match ON match_notes(candidate_id, client_id);
CREATE INDEX IF NOT EXISTS idx_match_notes_created ON match_notes(created_at DESC);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_match_status_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update updated_at
CREATE TRIGGER update_match_statuses_timestamp
  BEFORE UPDATE ON match_statuses
  FOR EACH ROW
  EXECUTE FUNCTION update_match_status_timestamp();

-- Enable Row Level Security (RLS)
ALTER TABLE match_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_notes ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (allow all for now, restrict later with authentication)
CREATE POLICY "Allow all operations on match_statuses" ON match_statuses
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on match_notes" ON match_notes
  FOR ALL USING (true) WITH CHECK (true);

-- Comments for documentation
COMMENT ON TABLE match_statuses IS 'Stores the status of matches (placed, in-progress, rejected) set by recruiters';
COMMENT ON TABLE match_notes IS 'Stores notes added by recruiters for specific matches';
COMMENT ON COLUMN match_statuses.status IS 'Status: placed (green), in-progress (orange), rejected (red)';
COMMENT ON COLUMN match_notes.note_text IS 'Text content of the note added by recruiter';
