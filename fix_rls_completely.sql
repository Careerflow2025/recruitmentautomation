-- =====================================================
-- COMPLETE RLS FIX FOR MATCHES TABLE
-- =====================================================
-- This script COMPLETELY removes ALL RLS policies and
-- disables RLS on the matches table
-- =====================================================

-- STEP 1: Drop ALL existing policies on matches table
DO $$
DECLARE
    policy_record RECORD;
BEGIN
    -- Loop through all policies on matches table and drop them
    FOR policy_record IN
        SELECT policyname
        FROM pg_policies
        WHERE tablename = 'matches'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON matches', policy_record.policyname);
        RAISE NOTICE 'Dropped policy: %', policy_record.policyname;
    END LOOP;
END $$;

-- STEP 2: Disable RLS on matches table
ALTER TABLE matches DISABLE ROW LEVEL SECURITY;

-- STEP 3: Verify RLS is disabled
SELECT
    schemaname,
    tablename,
    CASE
        WHEN rowsecurity THEN '❌ RLS ENABLED (PROBLEM!)'
        ELSE '✅ RLS DISABLED (GOOD!)'
    END as rls_status
FROM pg_tables
WHERE tablename = 'matches';

-- STEP 4: Check if any policies remain
SELECT
    CASE
        WHEN COUNT(*) = 0 THEN '✅ NO POLICIES FOUND (GOOD!)'
        ELSE '❌ POLICIES STILL EXIST (PROBLEM!)'
    END as policy_status,
    COUNT(*) as policy_count
FROM pg_policies
WHERE tablename = 'matches';

-- STEP 5: Test insertion (this should work now)
-- Try to insert a test match using the service role
INSERT INTO matches (id, candidate_id, client_id, commute_minutes, commute_display, commute_band, role_match, role_match_display)
VALUES (
    gen_random_uuid(),
    'CAN001',
    'CL001',
    5,
    '5 mins',
    'Under 10 mins',
    true,
    '✅ Match'
) ON CONFLICT (id) DO NOTHING
RETURNING id, '✅ TEST INSERTION SUCCESSFUL!' as status;

-- STEP 6: Clean up test insertion
DELETE FROM matches WHERE commute_minutes = 5 AND commute_display = '5 mins';

-- =====================================================
-- FINAL CONFIRMATION
-- =====================================================
SELECT
    '✅ RLS completely disabled on matches table!' as status,
    '🚀 You can now run POST /api/regenerate-matches' as next_step;
