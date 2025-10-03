-- =====================================================
-- AUTHENTICATION STEP 2: Enable Row Level Security (RLS)
-- =====================================================
-- Run this AFTER AUTH_STEP_1_ADD_USER_COLUMNS.sql
-- =====================================================

-- IMPORTANT: First, drop all existing "allow all" policies
DROP POLICY IF EXISTS "Allow all operations on candidates" ON candidates;
DROP POLICY IF EXISTS "Allow all operations on clients" ON clients;
DROP POLICY IF EXISTS "Allow all operations on matches" ON matches;
DROP POLICY IF EXISTS "Allow all operations on match_statuses" ON match_statuses;
DROP POLICY IF EXISTS "Allow all operations on match_notes" ON match_notes;

-- =====================================================
-- CANDIDATES TABLE - Users can only see/edit their own candidates
-- =====================================================

-- Allow users to view only their own candidates
CREATE POLICY "Users can view their own candidates"
ON candidates FOR SELECT
USING (auth.uid() = user_id);

-- Allow users to insert candidates (user_id must match authenticated user)
CREATE POLICY "Users can insert their own candidates"
ON candidates FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Allow users to update only their own candidates
CREATE POLICY "Users can update their own candidates"
ON candidates FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Allow users to delete only their own candidates
CREATE POLICY "Users can delete their own candidates"
ON candidates FOR DELETE
USING (auth.uid() = user_id);

-- =====================================================
-- CLIENTS TABLE - Users can only see/edit their own clients
-- =====================================================

CREATE POLICY "Users can view their own clients"
ON clients FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own clients"
ON clients FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own clients"
ON clients FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own clients"
ON clients FOR DELETE
USING (auth.uid() = user_id);

-- =====================================================
-- MATCHES TABLE - Users see matches from their own candidates/clients
-- =====================================================

CREATE POLICY "Users can view matches from their own data"
ON matches FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM candidates
    WHERE candidates.id = matches.candidate_id
    AND candidates.user_id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = matches.client_id
    AND clients.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert matches from their own data"
ON matches FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM candidates
    WHERE candidates.id = matches.candidate_id
    AND candidates.user_id = auth.uid()
  )
  AND
  EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = matches.client_id
    AND clients.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete their own matches"
ON matches FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM candidates
    WHERE candidates.id = matches.candidate_id
    AND candidates.user_id = auth.uid()
  )
);

-- =====================================================
-- MATCH_STATUSES TABLE - Users can only see/edit their own statuses
-- =====================================================

CREATE POLICY "Users can view their own match statuses"
ON match_statuses FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own match statuses"
ON match_statuses FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own match statuses"
ON match_statuses FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own match statuses"
ON match_statuses FOR DELETE
USING (auth.uid() = user_id);

-- =====================================================
-- MATCH_NOTES TABLE - Users can only see/edit their own notes
-- =====================================================

CREATE POLICY "Users can view their own match notes"
ON match_notes FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own match notes"
ON match_notes FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own match notes"
ON match_notes FOR DELETE
USING (auth.uid() = user_id);

-- =====================================================
-- RESULT: Row Level Security is now active
-- - Each user can only see their own data
-- - Data is automatically filtered by user_id
-- Next: Update frontend code to include user_id
-- =====================================================
