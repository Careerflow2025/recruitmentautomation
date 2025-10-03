-- =====================================================
-- GET YOUR USER ID
-- =====================================================
-- Run this query first to get your user ID

SELECT
  id as user_id,
  email,
  created_at,
  last_sign_in_at
FROM auth.users
ORDER BY created_at;

-- Copy your user_id from the results above, then use it in the next steps
