-- ============================================
-- ADD BANNED FIELD TO MATCHES TABLE
-- ============================================
-- PURPOSE: Enable soft-delete functionality for matches
-- FEATURE: Users can "ban" matches to hide them from main view
--          Banned matches can be restored from the Bin
--          Match regeneration will skip banned pairs
-- ============================================

-- STEP 1: Add 'banned' column to matches table
-- ============================================
ALTER TABLE matches
ADD COLUMN IF NOT EXISTS banned BOOLEAN DEFAULT false;

-- STEP 2: Add comment for documentation
-- ============================================
COMMENT ON COLUMN matches.banned IS 'Soft-delete flag: true = hidden from main view, false/null = visible';

-- STEP 3: Create index for performance
-- ============================================
-- This index improves query performance when filtering banned/non-banned matches
CREATE INDEX IF NOT EXISTS idx_matches_banned ON matches(user_id, banned);

-- STEP 4: Update RLS policies to allow banned field updates
-- ============================================
-- Users should be able to update the banned field on their own matches
-- (No policy changes needed if existing policies already allow updates)

-- OPTIONAL: Create a view for non-banned matches (for easier querying)
-- ============================================
CREATE OR REPLACE VIEW active_matches AS
SELECT *
FROM matches
WHERE banned IS NULL OR banned = false;

-- Add RLS to the view
ALTER VIEW active_matches SET (security_invoker = true);

-- ============================================
-- ✅ VERIFICATION QUERIES
-- ============================================

-- Check that column was added
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'matches' AND column_name = 'banned';

-- Check current banned matches count (should be 0 after migration)
SELECT
  COUNT(*) FILTER (WHERE banned = true) as banned_count,
  COUNT(*) FILTER (WHERE banned IS NULL OR banned = false) as active_count,
  COUNT(*) as total_count
FROM matches;

-- ============================================
-- 📝 USAGE EXAMPLES
-- ============================================

-- Ban a specific match
-- UPDATE matches
-- SET banned = true
-- WHERE candidate_id = 'U1_CAN5' AND client_id = 'U1_CL10' AND user_id = '<user_id>';

-- Unban (restore) a match
-- UPDATE matches
-- SET banned = false
-- WHERE candidate_id = 'U1_CAN5' AND client_id = 'U1_CL10' AND user_id = '<user_id>';

-- Query only active (non-banned) matches
-- SELECT * FROM matches WHERE user_id = '<user_id>' AND (banned IS NULL OR banned = false);

-- Query only banned matches
-- SELECT * FROM matches WHERE user_id = '<user_id>' AND banned = true;

-- Using the view (automatically filters out banned)
-- SELECT * FROM active_matches WHERE user_id = '<user_id>';

-- ============================================
-- 🎉 MIGRATION COMPLETE!
-- ============================================
