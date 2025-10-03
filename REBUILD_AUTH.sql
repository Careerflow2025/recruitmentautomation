-- =====================================================
-- REBUILD AUTHENTICATION FROM SCRATCH
-- =====================================================

-- Step 1: Delete ALL existing users and auth data
DELETE FROM auth.identities;
DELETE FROM auth.sessions;
DELETE FROM auth.refresh_tokens;
DELETE FROM auth.users;

-- Step 2: Verify Supabase auth settings
-- Go to Supabase Dashboard → Authentication → Providers → Email
-- ENABLE: Email provider
-- DISABLE: Confirm email
-- DISABLE: Secure email change
-- SET: Minimum password length = 6

-- Step 3: Create a test user manually
-- This bypasses the signup flow completely
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'admin@admin.com',
  crypt('admin123', gen_salt('bf')),
  NOW(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  NOW(),
  NOW()
);

-- Step 4: Verify user was created
SELECT id, email, email_confirmed_at, encrypted_password IS NOT NULL as has_password
FROM auth.users
WHERE email = 'admin@admin.com';

-- Step 5: After user is created, login with:
-- Email: admin@admin.com
-- Password: admin123
