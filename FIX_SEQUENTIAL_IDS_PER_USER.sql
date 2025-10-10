-- ============================================
-- FIX: Per-User Sequential IDs (U1_CAN1, U2_CAN1, etc.)
-- ============================================
-- Run this ENTIRE file in Supabase SQL Editor
-- Safe to run multiple times - handles all conflicts
-- ============================================
--
-- STRATEGY:
-- 1. Assign each user a short numeric ID (U1, U2, U3...)
-- 2. Create IDs like: U1_CAN1, U1_CAN2 (User 1's candidates)
--                     U2_CAN1, U2_CAN2 (User 2's candidates)
-- 3. Each user sees their own sequence starting from 1
-- 4. IDs are globally unique (primary key requirement)
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

-- STEP 4: ALTER COLUMN TYPES TO TEXT (if not already)
-- ============================================
ALTER TABLE candidates ALTER COLUMN id TYPE TEXT;
ALTER TABLE clients ALTER COLUMN id TYPE TEXT;
ALTER TABLE matches ALTER COLUMN candidate_id TYPE TEXT;
ALTER TABLE matches ALTER COLUMN client_id TYPE TEXT;

ALTER TABLE candidates ALTER COLUMN id DROP DEFAULT;
ALTER TABLE clients ALTER COLUMN id DROP DEFAULT;

-- STEP 5: CREATE USER NUMBER MAPPING
-- ============================================
-- Assign each user a sequential number (U1, U2, U3...)
CREATE TEMP TABLE user_numbers AS
SELECT
  user_id,
  'U' || ROW_NUMBER() OVER (ORDER BY MIN(created_at)) AS user_prefix
FROM candidates
GROUP BY user_id;

-- Add client users who might not have candidates
INSERT INTO user_numbers
SELECT
  c.user_id,
  'U' || (COALESCE((SELECT MAX(CAST(SUBSTRING(user_prefix FROM 'U(\d+)') AS INTEGER)) FROM user_numbers), 0) + ROW_NUMBER() OVER (ORDER BY MIN(c.created_at))) AS user_prefix
FROM clients c
WHERE c.user_id NOT IN (SELECT user_id FROM user_numbers)
GROUP BY c.user_id;

-- STEP 6: CREATE OLD ID TO TEMP ID MAPPING
-- ============================================
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

-- STEP 7: UPDATE TO TEMP IDS
-- ============================================
UPDATE candidates c
SET id = m.temp_id
FROM candidate_old_to_temp m
WHERE c.id = m.old_id;

UPDATE clients cl
SET id = m.temp_id
FROM client_old_to_temp m
WHERE cl.id = m.old_id;

UPDATE matches mat
SET candidate_id = m.temp_id
FROM candidate_old_to_temp m
WHERE mat.candidate_id = m.old_id;

UPDATE matches mat
SET client_id = m.temp_id
FROM client_old_to_temp m
WHERE mat.client_id = m.old_id;

-- STEP 8: CREATE SEQUENTIAL ID MAPPING (PER USER)
-- ============================================
CREATE TEMP TABLE candidate_id_map AS
SELECT
  c.id AS old_id,
  u.user_prefix || '_CAN' || ROW_NUMBER() OVER (PARTITION BY c.user_id ORDER BY c.created_at) AS new_id
FROM candidates c
JOIN user_numbers u ON u.user_id = c.user_id;

CREATE TEMP TABLE client_id_map AS
SELECT
  cl.id AS old_id,
  u.user_prefix || '_CL' || ROW_NUMBER() OVER (PARTITION BY cl.user_id ORDER BY cl.created_at) AS new_id
FROM clients cl
JOIN user_numbers u ON u.user_id = cl.user_id;

-- STEP 9: UPDATE TO SEQUENTIAL IDS
-- ============================================
UPDATE matches m
SET candidate_id = cm.new_id
FROM candidate_id_map cm
WHERE m.candidate_id = cm.old_id;

UPDATE matches m
SET client_id = clm.new_id
FROM client_id_map clm
WHERE m.client_id = clm.old_id;

UPDATE candidates c
SET id = cm.new_id
FROM candidate_id_map cm
WHERE c.id = cm.old_id;

UPDATE clients cl
SET id = clm.new_id
FROM client_id_map clm
WHERE cl.id = clm.old_id;

-- STEP 10: RECREATE FOREIGN KEY CONSTRAINTS AND UNIQUE CONSTRAINTS
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

-- STEP 11: CREATE AUTO-INCREMENT FUNCTIONS (PER USER)
-- ============================================
CREATE OR REPLACE FUNCTION generate_candidate_id()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
  user_prefix TEXT;
BEGIN
  IF NEW.id IS NULL OR NEW.id = '' THEN
    -- Get user's prefix (or assign new one if first user)
    SELECT 'U' || COALESCE(
      (SELECT CAST(SUBSTRING(id FROM 'U(\d+)_CAN') AS INTEGER)
       FROM candidates
       WHERE user_id = NEW.user_id
       LIMIT 1),
      (SELECT COALESCE(MAX(CAST(SUBSTRING(id FROM 'U(\d+)_') AS INTEGER)), 0) + 1
       FROM candidates)
    ) INTO user_prefix;

    -- Get next number for this user
    SELECT COALESCE(
      MAX(CAST(SUBSTRING(id FROM '_CAN(\d+)') AS INTEGER)), 0
    ) + 1
    INTO next_num
    FROM candidates
    WHERE user_id = NEW.user_id AND id ~ '^U\d+_CAN\d+$';

    NEW.id := user_prefix || '_CAN' || next_num;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_client_id()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
  user_prefix TEXT;
BEGIN
  IF NEW.id IS NULL OR NEW.id = '' THEN
    -- Get user's prefix (or assign new one if first user)
    SELECT 'U' || COALESCE(
      (SELECT CAST(SUBSTRING(id FROM 'U(\d+)_CL') AS INTEGER)
       FROM clients
       WHERE user_id = NEW.user_id
       LIMIT 1),
      (SELECT COALESCE(MAX(CAST(SUBSTRING(id FROM 'U(\d+)_') AS INTEGER)), 0) + 1
       FROM clients)
    ) INTO user_prefix;

    -- Get next number for this user
    SELECT COALESCE(
      MAX(CAST(SUBSTRING(id FROM '_CL(\d+)') AS INTEGER)), 0
    ) + 1
    INTO next_num
    FROM clients
    WHERE user_id = NEW.user_id AND id ~ '^U\d+_CL\d+$';

    NEW.id := user_prefix || '_CL' || next_num;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- STEP 12: CREATE TRIGGERS
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

-- STEP 13: RECREATE RLS POLICIES
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

-- STEP 14: RECREATE MATCHES VIEW
-- ============================================
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
SELECT 'User Numbers' as info, user_id, user_prefix
FROM user_numbers
ORDER BY user_prefix;

SELECT 'Candidates (per-user sequences)' as info, id, user_id, first_name, last_name
FROM candidates
ORDER BY user_id, CAST(SUBSTRING(id FROM '_CAN(\d+)') AS INTEGER)
LIMIT 20;

SELECT 'Clients (per-user sequences)' as info, id, user_id, surgery
FROM clients
ORDER BY user_id, CAST(SUBSTRING(id FROM '_CL(\d+)') AS INTEGER)
LIMIT 20;

SELECT 'Matches' as info, candidate_id, client_id
FROM matches
LIMIT 10;

-- ============================================
-- 🎉 SUCCESS! Your IDs are now:
-- User 1: U1_CAN1, U1_CAN2, U1_CAN3... (their candidates)
-- User 2: U2_CAN1, U2_CAN2, U2_CAN3... (their candidates)
-- Each user's sequence starts from 1
-- Next candidate for User 1 will be U1_CAN{next_number}
-- ============================================
