-- =====================================================
-- DENTAL RECRUITMENT MATCHER - CLEAN MIGRATION
-- =====================================================
-- This migration:
-- 1. Deletes ALL old mock data
-- 2. Removes mock commute functions
-- 3. Keeps only real Google Maps API integration
-- 4. Does NOT auto-generate matches (they will be created via API only)
-- =====================================================

-- =====================================================
-- STEP 1: DELETE ALL OLD DATA
-- =====================================================

-- Delete all matches (mock data)
DELETE FROM matches;

-- Delete all candidates (mock data)
DELETE FROM candidates;

-- Delete all clients (mock data)
DELETE FROM clients;

-- Delete commute cache
DELETE FROM commute_cache;

-- =====================================================
-- STEP 2: DROP OLD MOCK FUNCTIONS
-- =====================================================

-- Drop the mock commute calculation function
DROP FUNCTION IF EXISTS calculate_mock_commute(TEXT, TEXT);

-- Drop old triggers that auto-generate matches with mock data
DROP TRIGGER IF EXISTS trigger_regenerate_matches_on_candidate_insert ON candidates;
DROP TRIGGER IF EXISTS trigger_regenerate_matches_on_candidate_update ON candidates;
DROP TRIGGER IF EXISTS trigger_regenerate_matches_on_client_insert ON clients;
DROP TRIGGER IF EXISTS trigger_regenerate_matches_on_client_update ON clients;

-- Drop the old match generation functions
DROP FUNCTION IF EXISTS regenerate_matches_for_candidate(TEXT);
DROP FUNCTION IF EXISTS regenerate_matches_for_client(TEXT);
DROP FUNCTION IF EXISTS regenerate_all_matches();

-- =====================================================
-- STEP 3: VERIFY CLEAN STATE
-- =====================================================

-- Show counts (should all be 0)
SELECT
  'candidates' AS table_name,
  COUNT(*) AS record_count
FROM candidates
UNION ALL
SELECT
  'clients',
  COUNT(*)
FROM clients
UNION ALL
SELECT
  'matches',
  COUNT(*)
FROM matches
UNION ALL
SELECT
  'commute_cache',
  COUNT(*)
FROM commute_cache;

-- =====================================================
-- STEP 4: KEEP ONLY HELPER FUNCTIONS (NO MOCK DATA)
-- =====================================================

-- These functions are still useful and don't generate mock data:
-- - normalize_role() - for role matching
-- - is_new_item() - for 48-hour new indicator
-- - get_commute_band() - for emoji bands
-- - format_commute_time() - for display formatting

-- All of these work with REAL data from Google Maps API

-- =====================================================
-- COMPLETED!
-- =====================================================
-- The database is now clean and ready for REAL data only
-- Matches will ONLY be generated via:
--   POST /api/regenerate-matches (uses Google Maps API)
--
-- NO automatic triggers, NO mock data, NO fake calculations
-- =====================================================

SELECT 'Migration complete! Database cleaned. Ready for Google Maps API data.' AS status;
