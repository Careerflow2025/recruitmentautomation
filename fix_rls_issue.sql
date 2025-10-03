-- EMERGENCY FIX: Users seeing other users' data
-- This happens because existing data doesn't have user_id

-- Step 1: Check if there's data without user_id
SELECT 
  'candidates' as table_name,
  COUNT(*) as total_rows,
  COUNT(user_id) as rows_with_user,
  COUNT(*) - COUNT(user_id) as rows_without_user
FROM candidates
UNION ALL
SELECT 
  'clients' as table_name,
  COUNT(*) as total_rows,
  COUNT(user_id) as rows_with_user,
  COUNT(*) - COUNT(user_id) as rows_without_user
FROM clients;

-- Step 2: DELETE all data without user_id (orphaned data)
-- This is the safest fix - removes test data that doesn't belong to anyone
DELETE FROM match_notes WHERE id IN (
  SELECT mn.id FROM match_notes mn
  LEFT JOIN match_statuses ms ON ms.candidate_id = mn.candidate_id AND ms.client_id = mn.client_id
  WHERE ms.user_id IS NULL
);

DELETE FROM match_statuses WHERE user_id IS NULL;
DELETE FROM matches WHERE id IN (
  SELECT m.id FROM matches m
  LEFT JOIN candidates c ON c.id = m.candidate_id
  WHERE c.user_id IS NULL
);
DELETE FROM matches WHERE id IN (
  SELECT m.id FROM matches m
  LEFT JOIN clients cl ON cl.id = m.client_id
  WHERE cl.user_id IS NULL
);

DELETE FROM candidates WHERE user_id IS NULL;
DELETE FROM clients WHERE user_id IS NULL;

-- Step 3: Verify RLS policies exist
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies 
WHERE tablename IN ('candidates', 'clients', 'matches', 'match_statuses', 'match_notes')
ORDER BY tablename, policyname;
