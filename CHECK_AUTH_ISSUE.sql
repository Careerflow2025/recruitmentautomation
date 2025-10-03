-- =====================================================
-- CHECK AUTHENTICATION ISSUE
-- =====================================================
-- Run this to diagnose why login is not working
-- =====================================================

-- 1. Check if users exist and their confirmation status
SELECT
  id,
  email,
  email_confirmed_at,
  created_at,
  last_sign_in_at,
  CASE
    WHEN email_confirmed_at IS NULL THEN '❌ NOT CONFIRMED - THIS IS THE PROBLEM!'
    ELSE '✅ Confirmed'
  END as status
FROM auth.users
ORDER BY created_at DESC;

-- 2. Check if identities exist for users (required for login)
SELECT
  u.email,
  i.provider,
  CASE
    WHEN i.id IS NULL THEN '❌ NO IDENTITY - User created via SQL!'
    ELSE '✅ Has identity'
  END as identity_status
FROM auth.users u
LEFT JOIN auth.identities i ON i.user_id = u.id
ORDER BY u.created_at DESC;

-- 3. If users exist but email_confirmed_at is NULL, run this to confirm them:
UPDATE auth.users
SET email_confirmed_at = NOW()
WHERE email_confirmed_at IS NULL;

-- 4. Verify the fix
SELECT
  email,
  email_confirmed_at,
  CASE
    WHEN email_confirmed_at IS NULL THEN '❌ Still not confirmed'
    ELSE '✅ Now confirmed - try login again!'
  END as status
FROM auth.users;