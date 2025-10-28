-- VERIFICATION QUERIES FOR BATCH PROCESSING
-- Run these in Supabase SQL Editor after testing

-- ============================================
-- 1. OVERALL SUMMARY
-- ============================================
SELECT
  'Summary Stats' as section,
  (SELECT COUNT(*) FROM candidates WHERE user_id = auth.uid()) as total_candidates,
  (SELECT COUNT(*) FROM clients WHERE user_id = auth.uid()) as total_clients,
  (SELECT COUNT(*) FROM candidates WHERE user_id = auth.uid()) *
  (SELECT COUNT(*) FROM clients WHERE user_id = auth.uid()) as total_possible_pairs,
  (SELECT COUNT(*) FROM matches WHERE user_id = auth.uid() AND (banned IS NULL OR banned = false)) as active_matches,
  (SELECT COUNT(*) FROM matches WHERE user_id = auth.uid() AND banned = true) as banned_matches;

-- ============================================
-- 2. CHECK LATEST GENERATION STATUS
-- ============================================
SELECT
  status,
  started_at,
  completed_at,
  matches_found,
  excluded_over_80min,
  errors,
  skipped_existing,
  percent_complete,
  method_used,
  mode_used,
  total_batches,
  current_batch,
  EXTRACT(EPOCH FROM (completed_at - started_at)) as duration_seconds
FROM match_generation_status
WHERE user_id = auth.uid()
ORDER BY started_at DESC
LIMIT 1;

-- ============================================
-- 3. VERIFY BATCH PROCESSING WORKED
-- ============================================
-- This should show matches were created in small groups (batch processing pattern)
SELECT
  DATE_TRUNC('second', created_at) as batch_time,
  COUNT(*) as matches_in_batch
FROM matches
WHERE user_id = auth.uid()
  AND created_at >= (SELECT MAX(started_at) FROM match_generation_status WHERE user_id = auth.uid())
GROUP BY DATE_TRUNC('second', created_at)
ORDER BY batch_time DESC
LIMIT 20;

-- ============================================
-- 4. CHECK FOR MISSING PAIRS
-- ============================================
-- This shows how many pairs are missing (should match excluded + errors)
WITH all_possible_pairs AS (
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
SELECT
  COUNT(*) as missing_pairs,
  (SELECT COUNT(*) FROM all_possible_pairs) as total_possible,
  (SELECT COUNT(*) FROM existing_matches) as existing_matches
FROM all_possible_pairs ap
LEFT JOIN existing_matches em
  ON ap.candidate_id = em.candidate_id
  AND ap.client_id = em.client_id
WHERE em.candidate_id IS NULL;

-- ============================================
-- 5. MATCH DISTRIBUTION BY COMMUTE TIME
-- ============================================
SELECT
  CASE
    WHEN commute_minutes <= 20 THEN '🟢🟢🟢 0-20 min'
    WHEN commute_minutes <= 40 THEN '🟢🟢 21-40 min'
    WHEN commute_minutes <= 55 THEN '🟢 41-55 min'
    WHEN commute_minutes <= 80 THEN '🟡 56-80 min'
    ELSE '❌ Over 80 min (ERROR!)'
  END as time_band,
  COUNT(*) as match_count,
  ROUND(AVG(commute_minutes), 1) as avg_minutes
FROM matches
WHERE user_id = auth.uid()
  AND (banned IS NULL OR banned = false)
GROUP BY time_band
ORDER BY MIN(commute_minutes);

-- ============================================
-- 6. ROLE MATCH STATISTICS
-- ============================================
SELECT
  role_match_display,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 1) as percentage
FROM matches
WHERE user_id = auth.uid()
  AND (banned IS NULL OR banned = false)
GROUP BY role_match_display;

-- ============================================
-- 7. CHECK FOR DUPLICATES (should be 0)
-- ============================================
SELECT
  candidate_id,
  client_id,
  COUNT(*) as duplicate_count
FROM matches
WHERE user_id = auth.uid()
GROUP BY candidate_id, client_id
HAVING COUNT(*) > 1;

-- ============================================
-- 8. VERIFY NO MATCHES OVER 80 MINUTES
-- ============================================
SELECT
  COUNT(*) as over_80min_count,
  MAX(commute_minutes) as max_commute_minutes
FROM matches
WHERE user_id = auth.uid()
  AND (banned IS NULL OR banned = false)
  AND commute_minutes > 80;

-- ============================================
-- 9. RECENT GENERATION HISTORY
-- ============================================
SELECT
  started_at::timestamp(0) as started,
  CASE
    WHEN completed_at IS NOT NULL
    THEN EXTRACT(EPOCH FROM (completed_at - started_at))::int || ' seconds'
    ELSE 'In Progress'
  END as duration,
  status,
  matches_found,
  excluded_over_80min,
  errors,
  skipped_existing,
  mode_used,
  total_batches
FROM match_generation_status
WHERE user_id = auth.uid()
ORDER BY started_at DESC
LIMIT 5;