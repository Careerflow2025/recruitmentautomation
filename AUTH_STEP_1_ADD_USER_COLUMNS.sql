-- =====================================================
-- AUTHENTICATION STEP 1: Add user_id columns to all tables
-- =====================================================
-- Run this FIRST in Supabase SQL Editor
-- =====================================================

-- Add user_id column to candidates table
ALTER TABLE candidates
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id column to clients table
ALTER TABLE clients
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id column to match_statuses table
ALTER TABLE match_statuses
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id column to match_notes table
ALTER TABLE match_notes
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create indexes for performance (user-based queries)
CREATE INDEX IF NOT EXISTS idx_candidates_user_id ON candidates(user_id);
CREATE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id);
CREATE INDEX IF NOT EXISTS idx_match_statuses_user_id ON match_statuses(user_id);
CREATE INDEX IF NOT EXISTS idx_match_notes_user_id ON match_notes(user_id);

-- =====================================================
-- RESULT: All tables now have user_id column
-- Next: Run AUTH_STEP_2_ENABLE_RLS.sql
-- =====================================================
