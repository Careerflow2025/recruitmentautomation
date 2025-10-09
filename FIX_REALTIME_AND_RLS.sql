-- ============================================
-- FIX: Enable Realtime & Check RLS Policies
-- ============================================
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. ENABLE REALTIME ON REQUIRED TABLES
-- ============================================
-- The Excel grid uses Realtime for live updates

ALTER PUBLICATION supabase_realtime ADD TABLE candidates;
ALTER PUBLICATION supabase_realtime ADD TABLE clients;
ALTER PUBLICATION supabase_realtime ADD TABLE custom_columns;
ALTER PUBLICATION supabase_realtime ADD TABLE candidate_custom_data;
ALTER PUBLICATION supabase_realtime ADD TABLE client_custom_data;

-- 2. VERIFY RLS IS ENABLED ON MAIN TABLES
-- ============================================

ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- 3. CHECK IF RLS POLICIES EXIST FOR CANDIDATES
-- ============================================
-- If you see errors about policies already existing, that's OK - it means they're there

-- Select policies for candidates
DROP POLICY IF EXISTS "Users can view their own candidates" ON candidates;
CREATE POLICY "Users can view their own candidates"
  ON candidates FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own candidates" ON candidates;
CREATE POLICY "Users can insert their own candidates"
  ON candidates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own candidates" ON candidates;
CREATE POLICY "Users can update their own candidates"
  ON candidates FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own candidates" ON candidates;
CREATE POLICY "Users can delete their own candidates"
  ON candidates FOR DELETE
  USING (auth.uid() = user_id);

-- 4. CHECK IF RLS POLICIES EXIST FOR CLIENTS
-- ============================================

-- Select policies for clients
DROP POLICY IF EXISTS "Users can view their own clients" ON clients;
CREATE POLICY "Users can view their own clients"
  ON clients FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own clients" ON clients;
CREATE POLICY "Users can insert their own clients"
  ON clients FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own clients" ON clients;
CREATE POLICY "Users can update their own clients"
  ON clients FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own clients" ON clients;
CREATE POLICY "Users can delete their own clients"
  ON clients FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- ✅ DONE! Now test your grid again
-- ============================================
-- Go to: http://localhost:3000/candidates or /clients
-- The "Failed to fetch" error should be gone
-- ============================================

-- 5. DIAGNOSTIC QUERY (OPTIONAL)
-- ============================================
-- Run this to see if you have any data in candidates/clients

SELECT 'Candidates Count' as check_name, COUNT(*) as count FROM candidates
UNION ALL
SELECT 'Clients Count', COUNT(*) FROM clients
UNION ALL
SELECT 'Custom Columns Count', COUNT(*) FROM custom_columns;

-- 6. CHECK YOUR CURRENT USER ID
-- ============================================
-- This will show you the user_id you're logged in as

SELECT auth.uid() as my_user_id;

-- If this returns NULL, you're not logged in!
-- Go to your app and log in first, then refresh the grid page
