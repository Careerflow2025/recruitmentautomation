-- ============================================
-- FIX: Auto-generate sequential IDs per user (v6 - COMPLETE)
-- ============================================
-- Run this in Supabase SQL Editor
-- ============================================
-- This creates IDs like: CAN1, CAN2, CAN3... and CL1, CL2, CL3...
-- Each user has their own sequence starting from 1
-- Handles foreign key constraints properly
-- ============================================

-- STEP 1: DROP ALL POLICIES
-- ============================================
DROP POLICY IF EXISTS "Users can view their own candidates" ON candidates;
DROP POLICY IF EXISTS "Users can insert their own candidates" ON candidates;
DROP POLICY IF EXISTS "Users can update their own candidates" ON candidates;
DROP POLICY IF EXISTS "Users can delete their own candidates" ON candidates;
DROP POLICY IF EXISTS "Enable read for users based on user_id" ON candidates;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON candidates;
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON candidates;
DROP POLICY IF EXISTS "Enable delete for users based on user_id" ON candidates;
DROP POLICY IF EXISTS "Allow public read access to candidates" ON candidates;
DROP POLICY IF EXISTS "Allow public insert on candidates" ON candidates;
DROP POLICY IF EXISTS "Allow public update on candidates" ON candidates;
DROP POLICY IF EXISTS "Allow public delete on candidates" ON candidates;
DROP POLICY IF EXISTS "candidates_authenticated_users_policy" ON candidates;
DROP POLICY IF EXISTS "Users see only their candidates" ON candidates;

DROP POLICY IF EXISTS "Users can view their own clients" ON clients;
DROP POLICY IF EXISTS "Users can insert their own clients" ON clients;
DROP POLICY IF EXISTS "Users can update their own clients" ON clients;
DROP POLICY IF EXISTS "Users can delete their own clients" ON clients;
DROP POLICY IF EXISTS "Allow public read access to clients" ON clients;
DROP POLICY IF EXISTS "Allow public insert on clients" ON clients;
DROP POLICY IF EXISTS "Allow public update on clients" ON clients;
DROP POLICY IF EXISTS "Allow public delete on clients" ON clients;
DROP POLICY IF EXISTS "clients_authenticated_users_policy" ON clients;
DROP POLICY IF EXISTS "Users see only their clients" ON clients;

DROP POLICY IF EXISTS "Users can view their own matches" ON matches;
DROP POLICY IF EXISTS "Users can insert their own matches" ON matches;
DROP POLICY IF EXISTS "Users can update their own matches" ON matches;
DROP POLICY IF EXISTS "Users can delete their own matches" ON matches;
DROP POLICY IF EXISTS "matches_authenticated_users_policy" ON matches;
DROP POLICY IF EXISTS "Users see only their matches" ON matches;

DROP POLICY IF EXISTS "Users can view their own match_statuses" ON match_statuses;
DROP POLICY IF EXISTS "Users can insert their own match_statuses" ON match_statuses;
DROP POLICY IF EXISTS "Users can update their own match_statuses" ON match_statuses;
DROP POLICY IF EXISTS "Users can delete their own match_statuses" ON match_statuses;
DROP POLICY IF EXISTS "match_statuses_authenticated_users_policy" ON match_statuses;
DROP POLICY IF EXISTS "Users see only their match statuses" ON match_statuses;

DROP POLICY IF EXISTS "Users can view their own match_notes" ON match_notes;
DROP POLICY IF EXISTS "Users can insert their own match_notes" ON match_notes;
DROP POLICY IF EXISTS "Users can update their own match_notes" ON match_notes;
DROP POLICY IF EXISTS "Users can delete their own match_notes" ON match_notes;
DROP POLICY IF EXISTS "match_notes_authenticated_users_policy" ON match_notes;
DROP POLICY IF EXISTS "Users see only their match notes" ON match_notes;

-- STEP 2: DROP VIEWS
-- ============================================
DROP VIEW IF EXISTS matches_with_details CASCADE;

-- STEP 3: DROP FOREIGN KEY CONSTRAINTS
-- ============================================
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_candidate_id_fkey;
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_client_id_fkey;

-- STEP 4: ALTER COLUMN TYPES TO TEXT
-- ============================================
ALTER TABLE candidates ALTER COLUMN id TYPE TEXT;
ALTER TABLE clients ALTER COLUMN id TYPE TEXT;
ALTER TABLE matches ALTER COLUMN candidate_id TYPE TEXT;
ALTER TABLE matches ALTER COLUMN client_id TYPE TEXT;

-- Remove defaults
ALTER TABLE candidates ALTER COLUMN id DROP DEFAULT;
ALTER TABLE clients ALTER COLUMN id DROP DEFAULT;

-- STEP 5: CREATE MAPPING TABLES (OLD ID → NEW ID)
-- ============================================
CREATE TEMP TABLE candidate_id_map AS
SELECT
  id AS old_id,
  'CAN' || ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at) AS new_id
FROM candidates;

CREATE TEMP TABLE client_id_map AS
SELECT
  id AS old_id,
  'CL' || ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at) AS new_id
FROM clients;

-- STEP 6: UPDATE MATCHES TABLE FIRST (USING MAPPING)
-- ============================================
UPDATE matches m
SET candidate_id = cm.new_id
FROM candidate_id_map cm
WHERE m.candidate_id = cm.old_id;

UPDATE matches m
SET client_id = clm.new_id
FROM client_id_map clm
WHERE m.client_id = clm.old_id;

-- STEP 7: UPDATE CANDIDATES AND CLIENTS
-- ============================================
UPDATE candidates c
SET id = cm.new_id
FROM candidate_id_map cm
WHERE c.id = cm.old_id;

UPDATE clients cl
SET id = clm.new_id
FROM client_id_map clm
WHERE cl.id = clm.old_id;

-- STEP 8: RECREATE FOREIGN KEY CONSTRAINTS
-- ============================================
ALTER TABLE matches
  ADD CONSTRAINT matches_candidate_id_fkey
  FOREIGN KEY (candidate_id)
  REFERENCES candidates(id)
  ON DELETE CASCADE;

ALTER TABLE matches
  ADD CONSTRAINT matches_client_id_fkey
  FOREIGN KEY (client_id)
  REFERENCES clients(id)
  ON DELETE CASCADE;

-- STEP 9: CREATE AUTO-INCREMENT FUNCTIONS
-- ============================================
CREATE OR REPLACE FUNCTION generate_candidate_id()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  IF NEW.id IS NULL OR NEW.id = '' THEN
    SELECT COALESCE(
      MAX(CAST(SUBSTRING(id FROM 'CAN(\d+)') AS INTEGER)), 0
    ) + 1
    INTO next_num
    FROM candidates
    WHERE user_id = NEW.user_id AND id ~ '^CAN\d+$';

    NEW.id := 'CAN' || next_num;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_client_id()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  IF NEW.id IS NULL OR NEW.id = '' THEN
    SELECT COALESCE(
      MAX(CAST(SUBSTRING(id FROM 'CL(\d+)') AS INTEGER)), 0
    ) + 1
    INTO next_num
    FROM clients
    WHERE user_id = NEW.user_id AND id ~ '^CL\d+$';

    NEW.id := 'CL' || next_num;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- STEP 10: CREATE TRIGGERS
-- ============================================
DROP TRIGGER IF EXISTS set_candidate_id ON candidates;
CREATE TRIGGER set_candidate_id
  BEFORE INSERT ON candidates
  FOR EACH ROW
  EXECUTE FUNCTION generate_candidate_id();

DROP TRIGGER IF EXISTS set_client_id ON clients;
CREATE TRIGGER set_client_id
  BEFORE INSERT ON clients
  FOR EACH ROW
  EXECUTE FUNCTION generate_client_id();

-- STEP 11: RECREATE RLS POLICIES
-- ============================================

-- Candidates policies
CREATE POLICY "Users can view their own candidates"
  ON candidates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own candidates"
  ON candidates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own candidates"
  ON candidates FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own candidates"
  ON candidates FOR DELETE
  USING (auth.uid() = user_id);

-- Clients policies
CREATE POLICY "Users can view their own clients"
  ON clients FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own clients"
  ON clients FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own clients"
  ON clients FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own clients"
  ON clients FOR DELETE
  USING (auth.uid() = user_id);

-- Matches policies
CREATE POLICY "Users can view their own matches"
  ON matches FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own matches"
  ON matches FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own matches"
  ON matches FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own matches"
  ON matches FOR DELETE
  USING (auth.uid() = user_id);

-- Match statuses policies
CREATE POLICY "Users can view their own match_statuses"
  ON match_statuses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own match_statuses"
  ON match_statuses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own match_statuses"
  ON match_statuses FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own match_statuses"
  ON match_statuses FOR DELETE
  USING (auth.uid() = user_id);

-- Match notes policies
CREATE POLICY "Users can view their own match_notes"
  ON match_notes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own match_notes"
  ON match_notes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own match_notes"
  ON match_notes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own match_notes"
  ON match_notes FOR DELETE
  USING (auth.uid() = user_id);

-- STEP 12: RECREATE MATCHES VIEW
-- ============================================
CREATE OR REPLACE VIEW matches_with_details AS
SELECT
  m.id,
  m.user_id,
  m.candidate_id,
  m.client_id,
  m.commute_minutes,
  m.status,
  m.notes,
  m.created_at,
  m.updated_at,
  -- Candidate details
  c.first_name AS candidate_first_name,
  c.last_name AS candidate_last_name,
  c.email AS candidate_email,
  c.phone AS candidate_phone,
  c.role AS candidate_role,
  c.postcode AS candidate_postcode,
  c.salary AS candidate_salary,
  c.days AS candidate_days,
  c.experience AS candidate_experience,
  -- Client details
  cl.surgery AS client_surgery,
  cl.client_name,
  cl.client_phone,
  cl.client_email,
  cl.role AS client_role,
  cl.postcode AS client_postcode,
  cl.budget AS client_budget,
  cl.requirement AS client_requirement,
  cl.system AS client_system
FROM matches m
LEFT JOIN candidates c ON m.candidate_id = c.id
LEFT JOIN clients cl ON m.client_id = cl.id;

-- ============================================
-- ✅ DONE! VERIFICATION
-- ============================================

-- Check candidates
SELECT 'Candidates' as table_name, id, user_id, first_name, last_name
FROM candidates
ORDER BY user_id, CAST(SUBSTRING(id FROM '\d+') AS INTEGER)
LIMIT 10;

-- Check clients
SELECT 'Clients' as table_name, id, user_id, surgery
FROM clients
ORDER BY user_id, CAST(SUBSTRING(id FROM '\d+') AS INTEGER)
LIMIT 10;

-- Check matches (should have CAN1, CL1 format now)
SELECT candidate_id, client_id, commute_minutes
FROM matches
LIMIT 10;

-- Check matches view
SELECT COUNT(*) as matches_view_count FROM matches_with_details;

-- ============================================
-- 🎉 ALL DONE! Your IDs are now: CAN1, CAN2... and CL1, CL2...
-- Foreign keys restored and working
-- Next candidate will auto-generate as CAN16 (or next number)
-- Next client will auto-generate as CL12 (or next number)
-- ============================================
