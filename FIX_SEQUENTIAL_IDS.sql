-- ============================================
-- FIX: Auto-generate sequential IDs per user
-- ============================================
-- Run this in Supabase SQL Editor
-- ============================================
-- This creates IDs like: CAN1, CAN2, CAN3... and CL1, CL2, CL3...
-- Each user has their own sequence starting from 1
-- ============================================

-- 1. CREATE FUNCTION TO GENERATE NEXT CANDIDATE ID
-- ============================================
CREATE OR REPLACE FUNCTION generate_candidate_id()
RETURNS TEXT AS $$
DECLARE
  next_num INTEGER;
  user_id_val UUID;
BEGIN
  -- Get the user_id from the NEW row (this is set during INSERT)
  user_id_val := NEW.user_id;

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
  WHERE user_id = user_id_val
    AND id ~ '^CAN\d+$';  -- Only match CAN followed by digits

  -- Return formatted ID
  RETURN 'CAN' || next_num;
END;
$$ LANGUAGE plpgsql;

-- 2. CREATE FUNCTION TO GENERATE NEXT CLIENT ID
-- ============================================
CREATE OR REPLACE FUNCTION generate_client_id()
RETURNS TEXT AS $$
DECLARE
  next_num INTEGER;
  user_id_val UUID;
BEGIN
  -- Get the user_id from the NEW row
  user_id_val := NEW.user_id;

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
  WHERE user_id = user_id_val
    AND id ~ '^CL\d+$';  -- Only match CL followed by digits

  -- Return formatted ID
  RETURN 'CL' || next_num;
END;
$$ LANGUAGE plpgsql;

-- 3. CREATE TRIGGERS TO AUTO-GENERATE IDS
-- ============================================

-- Trigger for candidates table
DROP TRIGGER IF EXISTS set_candidate_id ON candidates;

CREATE TRIGGER set_candidate_id
  BEFORE INSERT ON candidates
  FOR EACH ROW
  WHEN (NEW.id IS NULL OR NEW.id = '')
  EXECUTE FUNCTION generate_candidate_id();

-- Trigger for clients table
DROP TRIGGER IF EXISTS set_client_id ON clients;

CREATE TRIGGER set_client_id
  BEFORE INSERT ON clients
  FOR EACH ROW
  WHEN (NEW.id IS NULL OR NEW.id = '')
  EXECUTE FUNCTION generate_client_id();

-- 4. UPDATE EXISTING ROWS (OPTIONAL)
-- ============================================
-- This converts existing UUID IDs to sequential IDs
-- WARNING: This will change all existing IDs!
-- Only run this if you want to convert existing data

-- Backup first (in case you want to revert):
-- CREATE TABLE candidates_backup AS SELECT * FROM candidates;
-- CREATE TABLE clients_backup AS SELECT * FROM clients;

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

-- 5. CHANGE ID COLUMN TYPE FROM UUID TO TEXT
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

-- ============================================
-- ✅ DONE! Test by adding a new candidate/client
-- ============================================
-- The next candidate will be CAN13 (or next available number for your user)
-- The next client will be CL1, CL2, etc.
-- ============================================

-- VERIFY IT WORKS:
-- Insert a test candidate (should get CAN{next_number})
-- INSERT INTO candidates (user_id, first_name, last_name, role, postcode, salary, days)
-- VALUES (auth.uid(), 'Test', 'User', 'Dental Nurse', 'SW1A 1AA', '£15', 'Mon-Fri')
-- RETURNING id;
