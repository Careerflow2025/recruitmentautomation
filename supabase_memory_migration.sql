-- AI Memory System for Unlimited Conversations
-- Handles 100+ turns without context overflow

-- AI Summary (running compressed history)
CREATE TABLE IF NOT EXISTS ai_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  summary TEXT NOT NULL, -- Compressed history (300-600 tokens)
  turn_count INT NOT NULL DEFAULT 0, -- How many turns compressed
  last_updated TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, session_id)
);

-- AI Facts (durable key-value facts)
CREATE TABLE IF NOT EXISTS ai_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  fact_key TEXT NOT NULL, -- e.g., "preferred_role", "mary_phone", "last_placement_date"
  fact_value TEXT NOT NULL, -- e.g., "Dental Nurse", "07123456789", "2025-01-15"
  source_turn INT, -- Which turn this fact came from
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, session_id, fact_key)
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_ai_summary_user_session ON ai_summary(user_id, session_id);
CREATE INDEX IF NOT EXISTS idx_ai_facts_user_session ON ai_facts(user_id, session_id);
CREATE INDEX IF NOT EXISTS idx_ai_facts_key ON ai_facts(fact_key);

-- RLS Policies
ALTER TABLE ai_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_facts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own summaries"
  ON ai_summary FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their own facts"
  ON ai_facts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_ai_facts_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ai_facts_updated_at
  BEFORE UPDATE ON ai_facts
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_facts_timestamp();
