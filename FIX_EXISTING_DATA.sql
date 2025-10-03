-- =====================================================
-- FIX EXISTING DATA - Assign user_id to old records
-- =====================================================
-- This assigns your user_id to all existing records that don't have one yet

-- Step 1: Find your user ID
SELECT id, email, created_at FROM auth.users ORDER BY created_at;

-- Copy your user_id from above, then run these UPDATE statements:
-- Replace YOUR_USER_ID_HERE with your actual UUID

-- Update candidates without user_id
UPDATE candidates
SET user_id = 'YOUR_USER_ID_HERE'
WHERE user_id IS NULL;

-- Update clients without user_id
UPDATE clients
SET user_id = 'YOUR_USER_ID_HERE'
WHERE user_id IS NULL;

-- Update matches without user_id
UPDATE matches
SET user_id = 'YOUR_USER_ID_HERE'
WHERE user_id IS NULL;

-- Update match_statuses without user_id (if any exist)
UPDATE match_statuses
SET user_id = 'YOUR_USER_ID_HERE'
WHERE user_id IS NULL;

-- Update match_notes without user_id (if any exist)
UPDATE match_notes
SET user_id = 'YOUR_USER_ID_HERE'
WHERE user_id IS NULL;

-- Verify the updates
SELECT
  'candidates' as table_name,
  COUNT(*) as total_records,
  COUNT(user_id) as with_user_id,
  COUNT(*) - COUNT(user_id) as missing_user_id
FROM candidates
UNION ALL
SELECT
  'clients' as table_name,
  COUNT(*) as total_records,
  COUNT(user_id) as with_user_id,
  COUNT(*) - COUNT(user_id) as missing_user_id
FROM clients
UNION ALL
SELECT
  'matches' as table_name,
  COUNT(*) as total_records,
  COUNT(user_id) as with_user_id,
  COUNT(*) - COUNT(user_id) as missing_user_id
FROM matches;

-- All "missing_user_id" counts should be 0 after running the UPDATE statements
