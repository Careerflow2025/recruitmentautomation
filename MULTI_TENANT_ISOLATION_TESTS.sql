-- ================================================
-- MULTI-TENANT ISOLATION TEST QUERIES
-- Run these in Supabase SQL Editor to test isolation
-- ================================================

-- Test 1: Create test users (if you don't have real users yet)
-- Note: You would normally create users through your auth flow
-- This is just for testing RLS isolation

-- Test 2: Verify RLS is enabled on all tables
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN (
  'candidates', 'clients', 'matches', 'match_notes', 
  'match_statuses', 'ai_conversations', 'ai_messages', 
  'conversation_sessions', 'conversation_locks'
)
ORDER BY tablename;

-- Test 3: Check that all tables have user_id columns
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'candidates', 'clients', 'matches', 'match_notes', 
    'match_statuses', 'ai_conversations', 'ai_messages', 
    'conversation_sessions', 'conversation_locks'
  )
  AND column_name = 'user_id'
ORDER BY table_name;

-- Test 4: Check RLS policies exist
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE schemaname = 'public'
  AND tablename IN (
    'candidates', 'clients', 'matches', 'match_notes', 
    'match_statuses', 'ai_conversations', 'ai_messages', 
    'conversation_sessions', 'conversation_locks'
  )
ORDER BY tablename, policyname;

-- Test 5: Check the unique processing lock index exists
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes 
WHERE schemaname = 'public'
  AND indexname IN ('one_processing_session_per_user', 'one_processing_lock_per_user')
ORDER BY tablename, indexname;

-- Test 6: Check if cron job is scheduled
SELECT * FROM cron.job WHERE jobname = 'unlock-stale-conversation-sessions';

-- Test 7: Test the unlock function manually
SELECT public.unlock_stale_sessions('90 seconds'::interval) as unlocked_sessions;

-- Test 8: Test RLS isolation (requires actual users)
-- This would need to be run with different authenticated users to verify isolation
-- For now, just show structure:

-- Sample test data insertion (adjust user IDs as needed):
-- INSERT INTO candidates (id, user_id, role, postcode, salary, days, added_at)
-- VALUES ('TEST001', 'user-1-uuid', 'Dental Nurse', 'SW1A 1AA', '£15-17', 'Mon-Fri', now());

-- INSERT INTO candidates (id, user_id, role, postcode, salary, days, added_at) 
-- VALUES ('TEST002', 'user-2-uuid', 'Dentist', 'M1 1AA', '£40-50', 'Mon-Wed', now());

-- Test 9: Verify views are security invoker (if they exist)
SELECT 
  schemaname,
  viewname,
  definition
FROM pg_views 
WHERE schemaname = 'public' 
  AND viewname LIKE '%match%'
ORDER BY viewname;

-- Test 10: Check for any remaining data without user_id
-- (These queries will show if any old data needs user_id assignment)

-- Check candidates without user_id
SELECT count(*) as candidates_without_user_id
FROM candidates 
WHERE user_id IS NULL;

-- Check clients without user_id  
SELECT count(*) as clients_without_user_id
FROM clients 
WHERE user_id IS NULL;

-- Check matches without user_id
SELECT count(*) as matches_without_user_id
FROM matches 
WHERE user_id IS NULL;

-- Check match_notes without user_id
SELECT count(*) as match_notes_without_user_id
FROM match_notes 
WHERE user_id IS NULL;

-- Check match_statuses without user_id
SELECT count(*) as match_statuses_without_user_id
FROM match_statuses 
WHERE user_id IS NULL;

-- ================================================
-- EXPECTED RESULTS:
-- ================================================
-- Test 2: All tables should show rowsecurity = true
-- Test 3: All tables should have user_id uuid NOT NULL columns
-- Test 4: Each table should have 4 policies (select, insert, update, delete)
-- Test 5: Should show the unique partial indexes
-- Test 6: Should show the cron job scheduled for every 2 minutes  
-- Test 7: Should return number of unlocked sessions (likely 0 if none are stale)
-- Test 10: All counts should be 0 (no data without user_id)

-- ================================================
-- ISOLATION TEST INSTRUCTIONS:
-- ================================================
-- 1. Run the multi-tenant setup SQL first: MULTI_TENANT_COMPLETE_SETUP.sql
-- 2. Run these test queries to verify setup
-- 3. Create test users in your application
-- 4. Add test data as different users
-- 5. Verify that each user only sees their own data
-- 6. Test that the AI assistant respects user isolation