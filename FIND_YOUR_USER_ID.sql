-- ====================================
-- FIND YOUR USER ID AND CHECK DUPLICATES
-- ====================================

-- STEP 1: Find all users and their candidate counts
-- This will show you ALL users in the system
SELECT
    user_id,
    COUNT(*) as candidate_count,
    MIN(added_at) as first_candidate_added,
    MAX(added_at) as last_candidate_added
FROM candidates
GROUP BY user_id
ORDER BY candidate_count DESC;

-- STEP 2: Find all users and sample data
-- This shows sample candidates for each user to help identify yours
SELECT
    user_id,
    COUNT(*) as total_candidates,
    STRING_AGG(DISTINCT CONCAT(first_name, ' ', last_name), ', ' ORDER BY CONCAT(first_name, ' ', last_name)) as sample_names
FROM candidates
GROUP BY user_id
LIMIT 10;

-- STEP 3: Show ALL candidate IDs regardless of user
-- This will show if duplicates exist across ALL users
SELECT
    id,
    COUNT(*) as count,
    STRING_AGG(DISTINCT user_id::text, ', ') as user_ids,
    STRING_AGG(CONCAT(first_name, ' ', last_name), ', ') as names
FROM candidates
GROUP BY id
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC, id;

-- STEP 4: Show raw data for candidates with specific names
-- Replace 'test22' with a name you recognize from your data
SELECT
    user_id,
    id,
    first_name,
    last_name,
    added_at
FROM candidates
WHERE first_name = 'test22' OR first_name = 'test11' OR first_name = 'test3'
   OR first_name = 'reda' OR first_name = 'Kristy'
ORDER BY user_id, id;

-- ====================================
-- ONCE YOU FIND YOUR USER_ID, USE THESE:
-- Replace 'YOUR_USER_ID_HERE' with your actual user ID
-- ====================================

-- CHECK FOR DUPLICATES FOR A SPECIFIC USER
-- Replace the user_id value with yours (it will look like a UUID: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx')
SELECT
    UPPER(id) as normalized_id,
    COUNT(*) as count,
    STRING_AGG(id, ', ') as original_ids,
    STRING_AGG(CONCAT(first_name, ' ', last_name), ', ') as names
FROM candidates
WHERE user_id = 'YOUR_USER_ID_HERE'  -- <-- REPLACE THIS
GROUP BY UPPER(id)
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC;

-- SHOW ALL CANDIDATES FOR A SPECIFIC USER
SELECT
    id,
    CONCAT('"', id, '"') as quoted_id,
    first_name,
    last_name,
    added_at
FROM candidates
WHERE user_id = 'YOUR_USER_ID_HERE'  -- <-- REPLACE THIS
ORDER BY id
LIMIT 50;

-- ====================================
-- ALTERNATIVE: Find duplicates without auth
-- This checks WITHIN each user for duplicates
-- ====================================

-- Find which users have duplicate candidate IDs
WITH user_duplicates AS (
    SELECT
        user_id,
        id,
        COUNT(*) as count
    FROM candidates
    GROUP BY user_id, id
    HAVING COUNT(*) > 1
)
SELECT
    ud.user_id,
    COUNT(DISTINCT ud.id) as duplicate_id_count,
    STRING_AGG(CONCAT(ud.id, '(', ud.count, ')'), ', ') as duplicate_ids_with_counts
FROM user_duplicates ud
GROUP BY ud.user_id;

-- Show detailed duplicates for all users
SELECT
    user_id,
    id,
    COUNT(*) as count,
    STRING_AGG(CONCAT(first_name, ' ', last_name), ', ') as names,
    STRING_AGG(added_at::text, ', ') as dates
FROM candidates
GROUP BY user_id, id
HAVING COUNT(*) > 1
ORDER BY user_id, COUNT(*) DESC, id;

-- ====================================
-- MOST IMPORTANT: See everything raw
-- ====================================

-- This will show EVERYTHING in your candidates table
-- Look for your data and note the user_id
SELECT
    user_id,
    id,
    first_name,
    last_name,
    email,
    phone,
    role,
    postcode,
    added_at
FROM candidates
ORDER BY user_id, added_at DESC
LIMIT 100;