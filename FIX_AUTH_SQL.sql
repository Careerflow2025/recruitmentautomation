-- =====================================================
-- AUTHENTICATION FIX - RUN THIS EXACT SQL
-- =====================================================

-- This will fix the login issue by confirming all user emails
UPDATE auth.users
SET email_confirmed_at = NOW()
WHERE email_confirmed_at IS NULL;

-- Verify it worked
SELECT email, email_confirmed_at FROM auth.users;