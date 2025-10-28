-- RUN THIS IN SUPABASE SQL EDITOR TO SEE WHAT'S HAPPENING

-- 1. Check how many candidates and clients you have
SELECT
  (SELECT COUNT(*) FROM candidates WHERE user_id = auth.uid()) as total_candidates,
  (SELECT COUNT(*) FROM clients WHERE user_id = auth.uid()) as total_clients,
  (SELECT COUNT(*) FROM candidates WHERE user_id = auth.uid()) *
  (SELECT COUNT(*) FROM clients WHERE user_id = auth.uid()) as total_possible_pairs;

-- 2. Check current matches (including banned)
SELECT
  COUNT(*) as total_matches,
  COUNT(*) FILTER (WHERE banned = true) as banned_matches,
  COUNT(*) FILTER (WHERE banned IS NULL OR banned = false) as active_matches
FROM matches
WHERE user_id = auth.uid();

-- 3. Check match generation status
SELECT * FROM match_generation_status
WHERE user_id = auth.uid()
ORDER BY started_at DESC
LIMIT 5;

-- 4. See matches grouped by creation time (to see batching pattern)
SELECT
  DATE_TRUNC('minute', created_at) as batch_time,
  COUNT(*) as matches_in_batch,
  MIN(created_at) as first_match,
  MAX(created_at) as last_match
FROM matches
WHERE user_id = auth.uid()
GROUP BY DATE_TRUNC('minute', created_at)
ORDER BY batch_time DESC
LIMIT 10;

-- 5. Check for duplicate matches (should be none)
SELECT
  candidate_id,
  client_id,
  COUNT(*) as duplicate_count
FROM matches
WHERE user_id = auth.uid()
GROUP BY candidate_id, client_id
HAVING COUNT(*) > 1;

-- 6. Find missing pairs (candidates that have no matches with certain clients)
WITH all_pairs AS (
  SELECT
    c.id as candidate_id,
    cl.id as client_id
  FROM candidates c
  CROSS JOIN clients cl
  WHERE c.user_id = auth.uid()
    AND cl.user_id = auth.uid()
),
existing_matches AS (
  SELECT
    candidate_id,
    client_id
  FROM matches
  WHERE user_id = auth.uid()
)
SELECT COUNT(*) as missing_pairs
FROM all_pairs ap
LEFT JOIN existing_matches em
  ON ap.candidate_id = em.candidate_id
  AND ap.client_id = em.client_id
WHERE em.candidate_id IS NULL;