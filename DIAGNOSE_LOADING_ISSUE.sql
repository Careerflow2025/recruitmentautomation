-- ============================================
-- DIAGNOSE: Why is the grid stuck on "Loading"?
-- ============================================
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. CHECK: Do you have ANY candidates in the database?
-- ============================================
SELECT 'Total Candidates' as check_name, COUNT(*) as count
FROM candidates;

-- 2. CHECK: Do you have candidates for THIS specific user?
-- ============================================
SELECT 'Candidates for User 67419abb-fdff-446f-92d6-a27bcda455b0' as check_name, COUNT(*) as count
FROM candidates
WHERE user_id = '67419abb-fdff-446f-92d6-a27bcda455b0';

-- 3. CHECK: Show me first 5 candidates with their user_id
-- ============================================
SELECT id, user_id, first_name, last_name, role, created_at
FROM candidates
ORDER BY created_at DESC
LIMIT 5;

-- 4. CHECK: Is Realtime enabled on candidates table?
-- ============================================
SELECT schemaname, tablename,
       CASE WHEN tablename = ANY(
         SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
       ) THEN 'ENABLED ✅' ELSE 'DISABLED ❌' END as realtime_status
FROM pg_tables
WHERE tablename = 'candidates' AND schemaname = 'public';

-- 5. CHECK: What RLS policies exist on candidates?
-- ============================================
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'candidates'
ORDER BY policyname;

-- 6. CHECK: Test if RLS is blocking queries
-- ============================================
-- This simulates what your app does
SET request.jwt.claims = '{"sub": "67419abb-fdff-446f-92d6-a27bcda455b0"}';
SELECT COUNT(*) as "Can I see candidates?" FROM candidates;

-- ============================================
-- 📋 EXPECTED RESULTS:
-- ============================================
-- 1. Total Candidates > 0 (you have data)
-- 2. Candidates for User > 0 (your user_id matches)
-- 3. Shows your candidate records
-- 4. Realtime: ENABLED ✅
-- 5. Shows 4 RLS policies (SELECT, INSERT, UPDATE, DELETE)
-- 6. Can I see candidates? > 0 (RLS allows access)
-- ============================================
