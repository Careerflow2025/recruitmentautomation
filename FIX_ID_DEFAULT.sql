-- ============================================
-- FIX: Add default UUID generation for id columns
-- ============================================
-- Run this in Supabase SQL Editor
-- ============================================

-- This fixes the error:
-- "null value in column 'id' violates not-null constraint"
-- when adding new candidates or clients

-- 1. ADD DEFAULT UUID GENERATION
-- ============================================

ALTER TABLE candidates
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE clients
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- 2. VERIFY IT WORKS
-- ============================================
-- Try inserting a test row (it should auto-generate id):

INSERT INTO candidates (user_id, first_name, last_name, role, postcode, salary, days)
VALUES (
  auth.uid(),
  'Test',
  'Candidate',
  'Dental Nurse',
  'SW1A 1AA',
  '£15',
  'Mon-Fri'
)
RETURNING id;

-- If you see an id returned (like: 'a1b2c3d4-...'), it's working! ✅

-- 3. DELETE THE TEST ROW (optional)
-- ============================================
-- DELETE FROM candidates WHERE first_name = 'Test' AND last_name = 'Candidate';

-- ============================================
-- ✅ DONE! Now try adding a candidate/client in your app
-- ============================================
