-- ============================================
-- FIX: Auto-generate sequential IDs per user (v3 - FINAL)
-- ============================================
-- Run this in Supabase SQL Editor
-- ============================================
-- This creates IDs like: CAN1, CAN2, CAN3... and CL1, CL2, CL3...
-- Each user has their own sequence starting from 1
-- ============================================

-- 1. DROP VIEW THAT DEPENDS ON ID COLUMNS
-- ============================================
-- We'll recreate it after changing the column types

DROP VIEW IF EXISTS matches_with_details CASCADE;

-- 2. CHANGE ID COLUMN TYPE FROM UUID TO TEXT
-- ============================================
-- This allows text IDs like 'CAN1' instead of UUIDs

ALTER TABLE candidates
  ALTER COLUMN id TYPE TEXT;

ALTER TABLE clients
  ALTER COLUMN id TYPE TEXT;

-- Remove UUID default if it exists
ALTER TABLE candidates
  ALTER COLUMN id DROP DEFAULT;

ALTER TABLE clients
  ALTER COLUMN id DROP DEFAULT;

-- 3. UPDATE EXISTING ROWS TO SEQUENTIAL IDS
-- ============================================
-- This converts existing UUID IDs to sequential IDs BEFORE creating triggers
-- This ensures we don't have conflicts

-- Update candidates with sequential IDs per user
WITH numbered AS (
  SELECT
    id,
    user_id,
    'CAN' || ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at) AS new_id
  FROM candidates
)
UPDATE candidates
SET id = numbered.new_id
FROM numbered
WHERE candidates.id = numbered.id;

-- Update clients with sequential IDs per user
WITH numbered AS (
  SELECT
    id,
    user_id,
    'CL' || ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at) AS new_id
  FROM clients
)
UPDATE clients
SET id = numbered.new_id
FROM numbered
WHERE clients.id = numbered.id;

-- 4. CREATE FUNCTION TO GENERATE NEXT CANDIDATE ID
-- ============================================
CREATE OR REPLACE FUNCTION generate_candidate_id()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  -- Only generate ID if it's NULL or empty
  IF NEW.id IS NULL OR NEW.id = '' THEN
    -- Find the highest number used by this user
    SELECT COALESCE(
      MAX(
        CAST(
          SUBSTRING(id FROM 'CAN(\d+)') AS INTEGER
        )
      ), 0
    ) + 1
    INTO next_num
    FROM candidates
    WHERE user_id = NEW.user_id
      AND id ~ '^CAN\d+$';  -- Only match CAN followed by digits

    -- Set the new ID
    NEW.id := 'CAN' || next_num;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. CREATE FUNCTION TO GENERATE NEXT CLIENT ID
-- ============================================
CREATE OR REPLACE FUNCTION generate_client_id()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  -- Only generate ID if it's NULL or empty
  IF NEW.id IS NULL OR NEW.id = '' THEN
    -- Find the highest number used by this user
    SELECT COALESCE(
      MAX(
        CAST(
          SUBSTRING(id FROM 'CL(\d+)') AS INTEGER
        )
      ), 0
    ) + 1
    INTO next_num
    FROM clients
    WHERE user_id = NEW.user_id
      AND id ~ '^CL\d+$';  -- Only match CL followed by digits

    -- Set the new ID
    NEW.id := 'CL' || next_num;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. CREATE TRIGGERS TO AUTO-GENERATE IDS
-- ============================================

-- Trigger for candidates table
DROP TRIGGER IF EXISTS set_candidate_id ON candidates;

CREATE TRIGGER set_candidate_id
  BEFORE INSERT ON candidates
  FOR EACH ROW
  EXECUTE FUNCTION generate_candidate_id();

-- Trigger for clients table
DROP TRIGGER IF EXISTS set_client_id ON clients;

CREATE TRIGGER set_client_id
  BEFORE INSERT ON clients
  FOR EACH ROW
  EXECUTE FUNCTION generate_client_id();

-- 7. RECREATE THE MATCHES VIEW
-- ============================================
-- This view joins candidates and clients with match data

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
-- ✅ DONE! Test by adding a new candidate/client
-- ============================================
-- The next candidate will be CAN{next_number} for your user
-- The next client will be CL{next_number} for your user
-- ============================================

-- VERIFY IT WORKS:
SELECT 'Candidates' as table_name, id, user_id, first_name, last_name
FROM candidates
ORDER BY user_id, CAST(SUBSTRING(id FROM '\d+') AS INTEGER);

SELECT 'Clients' as table_name, id, user_id, surgery
FROM clients
ORDER BY user_id, CAST(SUBSTRING(id FROM '\d+') AS INTEGER);

-- Check matches view still works:
SELECT COUNT(*) as matches_count FROM matches_with_details;

-- Test insert (will auto-generate ID):
-- INSERT INTO candidates (user_id, first_name, last_name, role, postcode, salary, days)
-- VALUES (auth.uid(), 'Test', 'User', 'Dental Nurse', 'SW1A 1AA', '£15', 'Mon-Fri')
-- RETURNING id;
-- Expected result: CAN16 (or next available number for your user)
