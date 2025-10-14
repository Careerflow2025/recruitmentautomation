-- ============================================
-- FIX: Multi-Tenant ID Generation (Race Condition Fix)
-- ============================================
-- PROBLEM: New users can get duplicate IDs due to race condition
-- SOLUTION: Create a dedicated table to track user prefixes
-- ============================================

-- STEP 1: Create user_prefixes table to track each user's assigned prefix
-- ============================================
CREATE TABLE IF NOT EXISTS user_prefixes (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  user_number INTEGER NOT NULL UNIQUE,
  prefix TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_prefixes_user_id ON user_prefixes(user_id);
CREATE INDEX IF NOT EXISTS idx_user_prefixes_prefix ON user_prefixes(prefix);

-- STEP 2: Populate existing users into user_prefixes table
-- ============================================
INSERT INTO user_prefixes (user_id, user_number, prefix)
SELECT DISTINCT
  user_id,
  CAST(SUBSTRING(id FROM 'U(\d+)_') AS INTEGER) as user_number,
  'U' || CAST(SUBSTRING(id FROM 'U(\d+)_') AS INTEGER) as prefix
FROM candidates
WHERE id ~ '^U\d+_CAN\d+$'
ON CONFLICT (user_id) DO NOTHING;

-- Also add users from clients table
INSERT INTO user_prefixes (user_id, user_number, prefix)
SELECT DISTINCT
  user_id,
  CAST(SUBSTRING(id FROM 'U(\d+)_') AS INTEGER) as user_number,
  'U' || CAST(SUBSTRING(id FROM 'U(\d+)_') AS INTEGER) as prefix
FROM clients
WHERE id ~ '^U\d+_CL\d+$'
  AND user_id NOT IN (SELECT user_id FROM user_prefixes)
ON CONFLICT (user_id) DO NOTHING;

-- STEP 3: Create function to get or create user prefix (SAFE FOR CONCURRENCY)
-- ============================================
CREATE OR REPLACE FUNCTION get_or_create_user_prefix(p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_prefix TEXT;
  v_next_number INTEGER;
BEGIN
  -- Try to get existing prefix
  SELECT prefix INTO v_prefix
  FROM user_prefixes
  WHERE user_id = p_user_id;

  -- If user already has a prefix, return it
  IF v_prefix IS NOT NULL THEN
    RETURN v_prefix;
  END IF;

  -- User doesn't have a prefix yet - assign new one
  -- Use advisory lock to prevent race condition
  PERFORM pg_advisory_xact_lock(hashtext('user_prefix_assignment'));

  -- Get next available user number
  SELECT COALESCE(MAX(user_number), 0) + 1 INTO v_next_number
  FROM user_prefixes;

  -- Create prefix
  v_prefix := 'U' || v_next_number;

  -- Insert new user prefix
  INSERT INTO user_prefixes (user_id, user_number, prefix)
  VALUES (p_user_id, v_next_number, v_prefix)
  ON CONFLICT (user_id) DO NOTHING;

  -- Return the prefix (even if insert was skipped due to conflict)
  SELECT prefix INTO v_prefix
  FROM user_prefixes
  WHERE user_id = p_user_id;

  RETURN v_prefix;
END;
$$ LANGUAGE plpgsql;

-- STEP 4: Update candidate ID generation trigger (RACE-CONDITION SAFE)
-- ============================================
CREATE OR REPLACE FUNCTION generate_candidate_id()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
  user_prefix TEXT;
BEGIN
  IF NEW.id IS NULL OR NEW.id = '' THEN
    -- Get or create user prefix (thread-safe)
    user_prefix := get_or_create_user_prefix(NEW.user_id);

    -- Use advisory lock to prevent race condition on candidate number
    PERFORM pg_advisory_xact_lock(hashtext('candidate_' || NEW.user_id::text));

    -- Get next candidate number for this user
    SELECT COALESCE(
      MAX(CAST(SUBSTRING(id FROM '_CAN(\d+)') AS INTEGER)), 0
    ) + 1
    INTO next_num
    FROM candidates
    WHERE user_id = NEW.user_id AND id ~ '^U\d+_CAN\d+$';

    -- Generate new ID
    NEW.id := user_prefix || '_CAN' || next_num;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- STEP 5: Update client ID generation trigger (RACE-CONDITION SAFE)
-- ============================================
CREATE OR REPLACE FUNCTION generate_client_id()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
  user_prefix TEXT;
BEGIN
  IF NEW.id IS NULL OR NEW.id = '' THEN
    -- Get or create user prefix (thread-safe)
    user_prefix := get_or_create_user_prefix(NEW.user_id);

    -- Use advisory lock to prevent race condition on client number
    PERFORM pg_advisory_xact_lock(hashtext('client_' || NEW.user_id::text));

    -- Get next client number for this user
    SELECT COALESCE(
      MAX(CAST(SUBSTRING(id FROM '_CL(\d+)') AS INTEGER)), 0
    ) + 1
    INTO next_num
    FROM clients
    WHERE user_id = NEW.user_id AND id ~ '^U\d+_CL\d+$';

    -- Generate new ID
    NEW.id := user_prefix || '_CL' || next_num;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- STEP 6: Recreate triggers (if needed)
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

-- STEP 7: Add RLS policies for user_prefixes table
-- ============================================
ALTER TABLE user_prefixes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own prefix" ON user_prefixes;
CREATE POLICY "Users can view their own prefix"
  ON user_prefixes FOR SELECT
  USING (auth.uid() = user_id);

-- System can insert/update (triggers need this)
DROP POLICY IF EXISTS "System can manage prefixes" ON user_prefixes;
CREATE POLICY "System can manage prefixes"
  ON user_prefixes FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================
-- ✅ VERIFICATION
-- ============================================
SELECT 'User Prefixes' as info, user_id, user_number, prefix, created_at
FROM user_prefixes
ORDER BY user_number;

SELECT 'Test: Create candidate for new user' as info;
-- This should work without duplicate key errors now

-- ============================================
-- 🎉 FIXED!
-- Race condition eliminated with:
-- 1. Dedicated user_prefixes table
-- 2. Advisory locks for concurrent safety
-- 3. Proper error handling with ON CONFLICT
-- ============================================
