-- =====================================================
-- USER PREFERENCES TABLE FOR PERSISTENT COLUMN LAYOUTS
-- =====================================================
-- Run this in your Supabase SQL Editor to create the user_preferences table
-- This will store persistent column layout preferences for each user

-- Create user_preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  preference_key TEXT NOT NULL,
  preference_value JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint to ensure one preference per user per key
  UNIQUE(user_id, preference_key)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_key ON user_preferences(preference_key);
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_key ON user_preferences(user_id, preference_key);

-- Enable RLS on user_preferences
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_preferences (user isolation)
CREATE POLICY "Users can view their own preferences" ON user_preferences
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own preferences" ON user_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences" ON user_preferences
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own preferences" ON user_preferences
  FOR DELETE USING (auth.uid() = user_id);

-- Function to update timestamps automatically
CREATE OR REPLACE FUNCTION update_user_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update the updated_at column
CREATE TRIGGER update_user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_user_preferences_updated_at();

-- Insert initial preference keys (optional - helps with consistency)
-- These will be used to store column layouts for different tables
COMMENT ON TABLE user_preferences IS 'Stores user-specific preferences like column layouts, UI settings, etc.';
COMMENT ON COLUMN user_preferences.preference_key IS 'Key identifying the preference type (e.g., candidates-table-column-widths, clients-table-column-widths)';
COMMENT ON COLUMN user_preferences.preference_value IS 'JSON value storing the preference data (e.g., column widths, lock state)';

-- Example of preference keys that will be used:
-- 'candidates-table-column-widths' -> stores column width percentages
-- 'candidates-table-column-locked' -> stores lock state (boolean)
-- 'clients-table-column-widths' -> stores column width percentages
-- 'clients-table-column-locked' -> stores lock state (boolean)