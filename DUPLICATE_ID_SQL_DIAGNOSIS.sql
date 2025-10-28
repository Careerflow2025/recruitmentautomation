-- ====================================
-- DUPLICATE ID DIAGNOSIS SQL QUERIES
-- Run these in Supabase SQL Editor
-- ====================================

-- 1. SHOW ALL CANDIDATE IDs WITH COUNTS (for your user)
-- This will show EVERY ID and how many times it appears
SELECT
    id,
    COUNT(*) as count,
    STRING_AGG(CONCAT(first_name, ' ', last_name), ', ') as names,
    STRING_AGG(CAST(added_at AS TEXT), ', ') as added_dates
FROM candidates
WHERE user_id = auth.uid()  -- Your user only
GROUP BY id
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC, id;

-- 2. SHOW ALL CANDIDATE IDs (INCLUDING SINGLES) FOR INSPECTION
-- This shows ALL IDs to see the exact format
SELECT
    id,
    LENGTH(id) as id_length,
    first_name,
    last_name,
    added_at,
    -- Show the ASCII codes of first 10 characters to detect hidden chars
    ASCII(SUBSTRING(id, 1, 1)) as char1_code,
    ASCII(SUBSTRING(id, 2, 1)) as char2_code,
    ASCII(SUBSTRING(id, 3, 1)) as char3_code,
    ASCII(SUBSTRING(id, 4, 1)) as char4_code,
    ASCII(SUBSTRING(id, 5, 1)) as char5_code
FROM candidates
WHERE user_id = auth.uid()
ORDER BY id;

-- 3. FIND DUPLICATE CANDIDATE IDs (CASE-INSENSITIVE)
-- This checks for duplicates ignoring case
SELECT
    UPPER(id) as normalized_id,
    COUNT(*) as count,
    STRING_AGG(id, ', ') as original_ids,
    STRING_AGG(CONCAT(first_name, ' ', last_name), ', ') as names
FROM candidates
WHERE user_id = auth.uid()
GROUP BY UPPER(id)
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC;

-- 4. SHOW ALL CLIENT IDs WITH COUNTS
SELECT
    id,
    COUNT(*) as count,
    STRING_AGG(surgery, ', ') as surgeries,
    STRING_AGG(CAST(added_at AS TEXT), ', ') as added_dates
FROM clients
WHERE user_id = auth.uid()
GROUP BY id
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC, id;

-- 5. CHECK FOR WEIRD CHARACTERS OR SPACES IN CANDIDATE IDs
-- This will reveal hidden characters
SELECT
    id,
    CONCAT('"', id, '"') as quoted_id,  -- Shows exact ID with quotes
    LENGTH(id) as length,
    TRIM(id) as trimmed_id,
    LENGTH(TRIM(id)) as trimmed_length,
    REPLACE(REPLACE(REPLACE(id, ' ', '[SPACE]'), CHR(9), '[TAB]'), CHR(10), '[NEWLINE]') as visible_chars,
    first_name,
    last_name
FROM candidates
WHERE user_id = auth.uid()
ORDER BY id;

-- 6. FIND IDs THAT LOOK SIMILAR BUT ARE DIFFERENT
-- This finds IDs that might look the same but have different characters
SELECT
    c1.id as id1,
    c2.id as id2,
    c1.first_name as name1,
    c2.first_name as name2,
    LENGTH(c1.id) as len1,
    LENGTH(c2.id) as len2,
    c1.id = c2.id as exact_match,
    UPPER(c1.id) = UPPER(c2.id) as case_insensitive_match
FROM candidates c1
JOIN candidates c2 ON c1.user_id = c2.user_id
WHERE c1.user_id = auth.uid()
    AND c1.added_at < c2.added_at  -- Only compare with later records
    AND UPPER(c1.id) = UPPER(c2.id)  -- Same ID when ignoring case
    AND c1.id != c2.id  -- But different when case-sensitive
ORDER BY c1.id;

-- 7. MOST IMPORTANT: SEE RAW DATA FOR ALL CANDIDATES
-- This shows exactly what's in the database
SELECT
    ROW_NUMBER() OVER (ORDER BY added_at) as row_num,
    id,
    CONCAT('ID:[', id, ']') as bracketed_id,
    first_name,
    last_name,
    added_at::date as date_added
FROM candidates
WHERE user_id = auth.uid()
ORDER BY added_at;

-- 8. CHECK IF THERE ARE MULTIPLE USERS' DATA MIXED
-- See if you're seeing other users' data somehow
SELECT
    user_id,
    COUNT(*) as candidate_count,
    STRING_AGG(DISTINCT id, ', ' ORDER BY id) as sample_ids
FROM candidates
GROUP BY user_id;

-- 9. GET YOUR EXACT USER ID
-- Make sure we're looking at the right user
SELECT
    auth.uid() as your_user_id,
    COUNT(*) as your_candidate_count
FROM candidates
WHERE user_id = auth.uid();

-- 10. NUCLEAR OPTION: SEE EVERYTHING RAW
-- This shows EVERYTHING about your candidates
SELECT
    *,
    MD5(id) as id_hash,  -- Creates a hash to compare
    ENCODE(id::bytea, 'hex') as hex_representation  -- Shows hex codes
FROM candidates
WHERE user_id = auth.uid()
ORDER BY id, added_at;

-- ====================================
-- TO FIX DUPLICATES MANUALLY:
-- ====================================

-- First, run this to see what needs fixing:
WITH duplicate_ids AS (
    SELECT
        id,
        COUNT(*) as cnt,
        MIN(added_at) as first_added,
        ARRAY_AGG(CONCAT(first_name, ' ', last_name) ORDER BY added_at) as all_names,
        ARRAY_AGG(added_at ORDER BY added_at) as all_dates
    FROM candidates
    WHERE user_id = auth.uid()
    GROUP BY id
    HAVING COUNT(*) > 1
)
SELECT * FROM duplicate_ids;

-- Then, if you find duplicates, you can manually update them:
-- Example (replace with actual values):
-- UPDATE candidates
-- SET id = 'CAN51'
-- WHERE user_id = auth.uid()
--   AND id = 'CAN7'
--   AND first_name = 'test22'
--   AND added_at = '2024-XX-XX';

-- ====================================
-- IMPORTANT: Run queries 1, 3, 5, and 7 first
-- These will show if duplicates exist
-- ====================================