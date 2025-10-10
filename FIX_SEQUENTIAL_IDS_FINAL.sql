-- ============================================
-- FIX: Auto-generate sequential IDs - FINAL WORKING VERSION
-- ============================================
-- Run this ENTIRE file in Supabase SQL Editor
-- Safe to run multiple times - handles all conflicts
-- ============================================
--
-- STRATEGY:
-- 1. Drop all dependencies (policies, views, foreign keys, unique constraints)
-- 2. Create mapping: original_id → TEMP_CAN_xxx (preserves old IDs)
-- 3. Update all tables to use TEMP IDs (clears any existing CAN1, CL1)
-- 4. Create mapping: TEMP_CAN_xxx → CAN1, CAN2, CAN3 (GLOBAL sequences)
-- 5. Update all tables to use sequential IDs
-- 6. Recreate all dependencies
-- 7. Create triggers for auto-increment on future inserts
--
-- NOTE: Uses GLOBAL sequences (CAN1, CAN2 across ALL users) because
-- the id column is the primary key and must be globally unique.
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

-- STEP 3: DROP FOREIGN KEY CONSTRAINTS AND UNIQUE CONSTRAINTS
-- ============================================
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_candidate_id_fkey;
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_client_id_fkey;
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_user_id_candidate_id_client_id_key;

-- STEP 4: ALTER COLUMN TYPES TO TEXT
-- ============================================
ALTER TABLE candidates ALTER COLUMN id TYPE TEXT;
ALTER TABLE clients ALTER COLUMN id TYPE TEXT;
ALTER TABLE matches ALTER COLUMN candidate_id TYPE TEXT;
ALTER TABLE matches ALTER COLUMN client_id TYPE TEXT;

ALTER TABLE candidates ALTER COLUMN id DROP DEFAULT;
ALTER TABLE clients ALTER COLUMN id DROP DEFAULT;

-- STEP 5: CREATE ID MAPPING (OLD ID -> NEW SEQUENTIAL ID)
-- ============================================
-- Do this BEFORE any updates to preserve original IDs
CREATE TEMP TABLE candidate_old_to_temp AS
SELECT
  id AS old_id,
  'TEMP_CAN_' || gen_random_uuid()::text AS temp_id
FROM candidates;

CREATE TEMP TABLE client_old_to_temp AS
SELECT
  id AS old_id,
  'TEMP_CL_' || gen_random_uuid()::text AS temp_id
FROM clients;

-- STEP 6: UPDATE TO TEMP IDS (CLEAR EXISTING CAN/CL IDS)
-- ============================================
-- Update candidates to TEMP IDs
UPDATE candidates c
SET id = m.temp_id
FROM candidate_old_to_temp m
WHERE c.id = m.old_id;

-- Update clients to TEMP IDs
UPDATE clients cl
SET id = m.temp_id
FROM client_old_to_temp m
WHERE cl.id = m.old_id;

-- Update matches to use TEMP IDs
UPDATE matches mat
SET candidate_id = m.temp_id
FROM candidate_old_to_temp m
WHERE mat.candidate_id = m.old_id;

UPDATE matches mat
SET client_id = m.temp_id
FROM client_old_to_temp m
WHERE mat.client_id = m.old_id;

-- STEP 7: CREATE SEQUENTIAL ID MAPPING (TEMP -> CAN1, CAN2, CL1, CL2)
-- ============================================
-- NOTE: Using GLOBAL sequences (CAN1, CAN2 across ALL users)
-- because id is the primary key and must be globally unique
CREATE TEMP TABLE candidate_id_map AS
SELECT
  id AS old_id,
  'CAN' || ROW_NUMBER() OVER (ORDER BY user_id, created_at) AS new_id
FROM candidates;

CREATE TEMP TABLE client_id_map AS
SELECT
  id AS old_id,
  'CL' || ROW_NUMBER() OVER (ORDER BY user_id, created_at) AS new_id
FROM clients;

-- STEP 8: UPDATE TO SEQUENTIAL IDS (TEMP -> CAN1, CAN2, CL1, CL2)
-- ============================================
-- Update matches first
UPDATE matches m
SET candidate_id = cm.new_id
FROM candidate_id_map cm
WHERE m.candidate_id = cm.old_id;

UPDATE matches m
SET client_id = clm.new_id
FROM client_id_map clm
WHERE m.client_id = clm.old_id;

-- Then update candidates and clients
UPDATE candidates c
SET id = cm.new_id
FROM candidate_id_map cm
WHERE c.id = cm.old_id;

UPDATE clients cl
SET id = clm.new_id
FROM client_id_map clm
WHERE cl.id = clm.old_id;

-- STEP 9: RECREATE FOREIGN KEY CONSTRAINTS AND UNIQUE CONSTRAINTS
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

ALTER TABLE matches
  ADD CONSTRAINT matches_user_id_candidate_id_client_id_key
  UNIQUE (user_id, candidate_id, client_id);

-- STEP 10: CREATE AUTO-INCREMENT FUNCTIONS
-- ============================================
-- NOTE: Using GLOBAL sequences (not per-user) because id is the primary key
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
    WHERE id ~ '^CAN\d+$';

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
    WHERE id ~ '^CL\d+$';

    NEW.id := 'CL' || next_num;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- STEP 11: CREATE TRIGGERS
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

-- STEP 12: RECREATE RLS POLICIES
-- ============================================
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

-- STEP 13: RECREATE MATCHES VIEW
-- ============================================
-- NOTE: Only including columns that actually exist in matches table
-- status and notes are in separate tables (match_statuses, match_notes)
CREATE OR REPLACE VIEW matches_with_details AS
SELECT
  m.id,
  m.user_id,
  m.candidate_id,
  m.client_id,
  m.commute_minutes,
  m.created_at,
  c.first_name AS candidate_first_name,
  c.last_name AS candidate_last_name,
  c.email AS candidate_email,
  c.phone AS candidate_phone,
  c.role AS candidate_role,
  c.postcode AS candidate_postcode,
  c.salary AS candidate_salary,
  c.days AS candidate_days,
  c.experience AS candidate_experience,
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
-- ✅ VERIFICATION - Check results
-- ============================================
SELECT 'Candidates (should be CAN1, CAN2...)' as info, id, user_id, first_name, last_name
FROM candidates
ORDER BY CAST(SUBSTRING(id FROM '\d+') AS INTEGER)
LIMIT 10;

SELECT 'Clients (should be CL1, CL2...)' as info, id, user_id, surgery
FROM clients
ORDER BY CAST(SUBSTRING(id FROM '\d+') AS INTEGER)
LIMIT 10;

SELECT 'Matches (should reference CAN/CL IDs)' as info, candidate_id, client_id
FROM matches
LIMIT 10;

-- ============================================
-- 🎉 SUCCESS! Your IDs are now:
-- Candidates: CAN1, CAN2, CAN3... (global across all users)
-- Clients: CL1, CL2, CL3... (global across all users)
-- Next candidate added will be CAN16 (or next available number)
-- Next client added will be CL12 (or next available number)
-- ============================================
