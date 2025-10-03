-- =====================================================
-- CLEAR ALL DATA FROM DATABASE
-- =====================================================
-- This will delete all candidates, clients, and matches
-- so you can start fresh with bulk upload
-- =====================================================

-- STEP 1: Delete all matches first (they depend on candidates and clients)
DELETE FROM matches;

-- STEP 2: Delete all candidates
DELETE FROM candidates;

-- STEP 3: Delete all clients
DELETE FROM clients;

-- =====================================================
-- VERIFY DATA IS CLEARED
-- =====================================================

SELECT
  'matches' AS table_name,
  COUNT(*) AS record_count
FROM matches
UNION ALL
SELECT
  'candidates',
  COUNT(*)
FROM candidates
UNION ALL
SELECT
  'clients',
  COUNT(*)
FROM clients;

-- =====================================================
-- SUCCESS MESSAGE
-- =====================================================

SELECT
  '✅ All data cleared successfully!' AS status,
  '📤 You can now upload your real data using the bulk upload feature' AS next_step,
  '🚀 After uploading, run POST /api/regenerate-matches to create matches' AS final_step;
