-- Check how many candidates belong to user 67419abb (YOU - shabaz@locummeds.co.uk)

-- 1. Your candidates
SELECT COUNT(*) as my_candidates
FROM candidates
WHERE user_id = '67419abb-fdff-446f-92d6-a27bcda455b0';

-- 2. Your clients
SELECT COUNT(*) as my_clients
FROM clients
WHERE user_id = '67419abb-fdff-446f-92d6-a27bcda455b0';

-- 3. Sample of YOUR candidates
SELECT id, role, postcode, added_at
FROM candidates
WHERE user_id = '67419abb-fdff-446f-92d6-a27bcda455b0'
ORDER BY added_at DESC
LIMIT 10;

-- 4. All users in the system
SELECT user_id, COUNT(*) as candidate_count
FROM candidates
GROUP BY user_id;

-- This will show:
-- - How many candidates YOU actually have
-- - How many other users exist
-- - If RLS SHOULD filter to your data only
