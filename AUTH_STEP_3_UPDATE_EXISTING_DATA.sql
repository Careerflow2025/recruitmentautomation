-- =====================================================
-- AUTHENTICATION STEP 3: Update Existing Data (OPTIONAL)
-- =====================================================
-- ONLY run this if you have existing test data and want to keep it
-- This assigns all existing data to a specific user
-- =====================================================

-- IMPORTANT: Replace 'YOUR_USER_ID_HERE' with actual user ID
-- To get your user ID:
-- 1. Sign up/login to your app
-- 2. Run this query in Supabase SQL Editor:
--    SELECT id, email FROM auth.users;
-- 3. Copy your user UUID and replace below

-- Example: UPDATE candidates SET user_id = 'abc123-def456-ghi789' WHERE user_id IS NULL;

-- Update candidates
-- UPDATE candidates
-- SET user_id = 'YOUR_USER_ID_HERE'
-- WHERE user_id IS NULL;

-- Update clients
-- UPDATE clients
-- SET user_id = 'YOUR_USER_ID_HERE'
-- WHERE user_id IS NULL;

-- Update match_statuses
-- UPDATE match_statuses
-- SET user_id = 'YOUR_USER_ID_HERE'
-- WHERE user_id IS NULL;

-- Update match_notes
-- UPDATE match_notes
-- SET user_id = 'YOUR_USER_ID_HERE'
-- WHERE user_id IS NULL;

-- =====================================================
-- ALTERNATIVE: Delete all existing test data
-- =====================================================
-- If you don't need existing data, uncomment these lines:

-- DELETE FROM match_notes;
-- DELETE FROM match_statuses;
-- DELETE FROM matches;
-- DELETE FROM candidates;
-- DELETE FROM clients;

-- =====================================================
-- After running this, your data will be user-specific
-- =====================================================
