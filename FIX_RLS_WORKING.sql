-- FINAL FIX: RLS policies that actually work with JWT tokens
-- The issue: auth.uid() doesn't work in all contexts
-- Solution: Use (current_setting('request.jwt.claims', true)::json->>'sub')::uuid

-- Drop broken policies
DROP POLICY IF EXISTS "Users see only their candidates" ON candidates;
DROP POLICY IF EXISTS "Users see only their clients" ON clients;
DROP POLICY IF EXISTS "Users see only their matches" ON matches;
DROP POLICY IF EXISTS "Users see only their match statuses" ON match_statuses;
DROP POLICY IF EXISTS "Users see only their match notes" ON match_notes;

-- CANDIDATES: Filter by JWT sub claim (user ID)
CREATE POLICY "Users see only their candidates"
  ON candidates
  FOR ALL
  USING (
    user_id = (SELECT auth.uid())
    OR
    user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::uuid
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR
    user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::uuid
  );

-- CLIENTS: Filter by JWT sub claim
CREATE POLICY "Users see only their clients"
  ON clients
  FOR ALL
  USING (
    user_id = (SELECT auth.uid())
    OR
    user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::uuid
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR
    user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::uuid
  );

-- MATCHES: Filter by JWT sub claim
CREATE POLICY "Users see only their matches"
  ON matches
  FOR ALL
  USING (
    user_id = (SELECT auth.uid())
    OR
    user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::uuid
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR
    user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::uuid
  );

-- MATCH STATUSES: Filter by JWT sub claim
CREATE POLICY "Users see only their match statuses"
  ON match_statuses
  FOR ALL
  USING (
    user_id = (SELECT auth.uid())
    OR
    user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::uuid
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR
    user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::uuid
  );

-- MATCH NOTES: Filter by JWT sub claim
CREATE POLICY "Users see only their match notes"
  ON match_notes
  FOR ALL
  USING (
    user_id = (SELECT auth.uid())
    OR
    user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::uuid
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR
    user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::uuid
  );

-- Test: This should return ONLY 14 candidates for user 67419abb
-- Run this AFTER running the policies above
SELECT COUNT(*) as my_candidates_via_rls FROM candidates;

-- If you get 14 → RLS is working! ✅
-- If you get 36 → Still broken ❌
