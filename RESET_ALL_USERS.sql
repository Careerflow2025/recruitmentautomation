-- =====================================================
-- RESET ALL USERS - Complete Database Cleanup
-- =====================================================
-- This will delete ALL users and ALL data from the system
-- Run this to start fresh with multi-tenant setup

-- Step 1: Delete all data from tables (cascades will handle related records)
TRUNCATE TABLE match_notes CASCADE;
TRUNCATE TABLE match_statuses CASCADE;
TRUNCATE TABLE matches CASCADE;
TRUNCATE TABLE clients CASCADE;
TRUNCATE TABLE candidates CASCADE;

-- Step 2: Delete all users from auth.users
-- WARNING: This deletes ALL user accounts
DELETE FROM auth.users;

-- Step 3: Verify everything is deleted
SELECT 'candidates' as table_name, COUNT(*) as remaining_records FROM candidates
UNION ALL
SELECT 'clients', COUNT(*) FROM clients
UNION ALL
SELECT 'matches', COUNT(*) FROM matches
UNION ALL
SELECT 'match_statuses', COUNT(*) FROM match_statuses
UNION ALL
SELECT 'match_notes', COUNT(*) FROM match_notes
UNION ALL
SELECT 'auth.users', COUNT(*) FROM auth.users;

-- All counts should be 0 after running TRUNCATE/DELETE statements
-- Now you can create fresh accounts and test multi-tenant isolation
