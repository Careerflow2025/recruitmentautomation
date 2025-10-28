-- ====================================
-- CHECK DUPLICATES FOR YOUR SPECIFIC USER
-- Your user_id: 67419abb-fdff-446f-92d6-a27bcda455b0
-- ====================================

-- 1. CHECK FOR DUPLICATE IDs (EXACT MATCH)
SELECT
    id,
    COUNT(*) as count,
    STRING_AGG(CONCAT(first_name, ' ', last_name), ', ') as names,
    STRING_AGG(added_at::text, ', ') as dates
FROM candidates
WHERE user_id = '67419abb-fdff-446f-92d6-a27bcda455b0'
GROUP BY id
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC, id;

-- 2. CHECK FOR IDs THAT BECOME DUPLICATES WHEN REMOVING PREFIX
-- This is likely the issue - U3_CAN7 and CAN7 look the same in UI
WITH normalized_ids AS (
    SELECT
        id as original_id,
        CASE
            WHEN id LIKE 'U3_%' THEN SUBSTRING(id FROM 4)  -- Remove U3_ prefix
            ELSE id
        END as normalized_id,
        first_name,
        last_name,
        added_at
    FROM candidates
    WHERE user_id = '67419abb-fdff-446f-92d6-a27bcda455b0'
)
SELECT
    normalized_id,
    COUNT(*) as count,
    STRING_AGG(original_id, ', ') as original_ids,
    STRING_AGG(CONCAT(first_name, ' ', last_name), ', ') as names
FROM normalized_ids
GROUP BY normalized_id
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC, normalized_id;

-- 3. SHOW ALL YOUR CANDIDATE IDs
-- This will show the exact IDs in your database
SELECT
    id,
    CONCAT('[', id, ']') as bracketed_id,
    first_name,
    last_name,
    added_at::date as date_added,
    CASE
        WHEN id LIKE 'U3_%' THEN 'Has U3_ prefix'
        WHEN id LIKE 'u3_%' THEN 'Has u3_ prefix (lowercase)'
        ELSE 'No prefix'
    END as prefix_status
FROM candidates
WHERE user_id = '67419abb-fdff-446f-92d6-a27bcda455b0'
ORDER BY
    CASE
        WHEN id LIKE 'U3_%' THEN SUBSTRING(id FROM 4)
        WHEN id LIKE 'u3_%' THEN SUBSTRING(id FROM 4)
        ELSE id
    END;

-- 4. COUNT HOW MANY HAVE THE U3_ PREFIX
SELECT
    CASE
        WHEN id LIKE 'U3_%' THEN 'With U3_ prefix'
        WHEN id LIKE 'u3_%' THEN 'With u3_ prefix'
        ELSE 'No prefix'
    END as prefix_type,
    COUNT(*) as count
FROM candidates
WHERE user_id = '67419abb-fdff-446f-92d6-a27bcda455b0'
GROUP BY prefix_type;

-- 5. FIND CONFLICTS BETWEEN PREFIXED AND NON-PREFIXED IDs
-- This finds cases where U3_CAN7 and CAN7 both exist
SELECT
    c1.id as id_without_prefix,
    c2.id as id_with_prefix,
    c1.first_name as name1,
    c2.first_name as name2,
    c1.added_at as added1,
    c2.added_at as added2
FROM candidates c1
JOIN candidates c2 ON
    c2.user_id = c1.user_id
    AND c2.id = CONCAT('U3_', c1.id)
WHERE c1.user_id = '67419abb-fdff-446f-92d6-a27bcda455b0'
    AND c1.id NOT LIKE 'U3_%'
ORDER BY c1.id;

-- 6. MANUAL FIX: Update all U3_ prefixed IDs to remove the prefix
-- WARNING: Only run this if you want to remove all U3_ prefixes
-- COMMENT OUT TO PREVENT ACCIDENTAL EXECUTION
/*
UPDATE candidates
SET id = SUBSTRING(id FROM 4)
WHERE user_id = '67419abb-fdff-446f-92d6-a27bcda455b0'
    AND id LIKE 'U3_%';
*/

-- 7. ALTERNATIVE FIX: Renumber the prefixed ones with new IDs
-- This query shows what would be changed
WITH numbered_duplicates AS (
    SELECT
        id,
        first_name,
        last_name,
        added_at,
        ROW_NUMBER() OVER (ORDER BY added_at) + 50 as new_number
    FROM candidates
    WHERE user_id = '67419abb-fdff-446f-92d6-a27bcda455b0'
        AND id LIKE 'U3_%'
)
SELECT
    id as current_id,
    CONCAT('CAN', new_number) as proposed_new_id,
    first_name,
    last_name
FROM numbered_duplicates;

-- 8. CHECK YOUR CLIENTS TOO
SELECT
    id,
    COUNT(*) as count
FROM clients
WHERE user_id = '67419abb-fdff-446f-92d6-a27bcda455b0'
GROUP BY id
HAVING COUNT(*) > 1;

-- 9. CHECK CLIENT PREFIXES
SELECT
    CASE
        WHEN id LIKE 'U3_%' THEN 'With U3_ prefix'
        WHEN id LIKE 'u3_%' THEN 'With u3_ prefix'
        ELSE 'No prefix'
    END as prefix_type,
    COUNT(*) as count
FROM clients
WHERE user_id = '67419abb-fdff-446f-92d6-a27bcda455b0'
GROUP BY prefix_type;