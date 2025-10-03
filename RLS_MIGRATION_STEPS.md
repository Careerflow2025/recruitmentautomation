# Multi-Tenant RLS Migration Guide

## Overview
This migration will enable Row Level Security (RLS) to ensure complete data isolation between users. Each user will only see their own candidates, clients, and matches.

## Prerequisites
- Access to Supabase SQL Editor
- Current user account credentials

---

## Step 1: Get Your User ID

1. Go to Supabase Dashboard → SQL Editor
2. Open the file `GET_USER_ID.sql` and run it
3. Copy your `user_id` from the results (it will be a UUID like `123e4567-e89b-12d3-a456-426614174000`)

**OR** run this query directly:
```sql
SELECT id as user_id, email FROM auth.users ORDER BY created_at;
```

---

## Step 2: Prepare the Migration File

1. Open `ENABLE_MULTI_TENANT_RLS.sql`
2. Find **Step 2** (around line 30)
3. **Uncomment** the UPDATE statements (remove the `--` at the beginning)
4. Replace `YOUR_USER_ID_HERE` with your actual user_id from Step 1

Example:
```sql
-- BEFORE:
-- UPDATE candidates SET user_id = 'YOUR_USER_ID_HERE' WHERE user_id IS NULL;

-- AFTER (with your actual user ID):
UPDATE candidates SET user_id = '123e4567-e89b-12d3-a456-426614174000' WHERE user_id IS NULL;
UPDATE clients SET user_id = '123e4567-e89b-12d3-a456-426614174000' WHERE user_id IS NULL;
UPDATE matches SET user_id = '123e4567-e89b-12d3-a456-426614174000' WHERE user_id IS NULL;
UPDATE match_statuses SET user_id = '123e4567-e89b-12d3-a456-426614174000' WHERE user_id IS NULL;
UPDATE match_notes SET user_id = '123e4567-e89b-12d3-a456-426614174000' WHERE user_id IS NULL;
```

5. Find **Step 3** (around line 45)
6. **Uncomment** the ALTER COLUMN statements:

```sql
-- BEFORE:
-- ALTER TABLE candidates ALTER COLUMN user_id SET NOT NULL;

-- AFTER:
ALTER TABLE candidates ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE clients ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE matches ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE match_statuses ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE match_notes ALTER COLUMN user_id SET NOT NULL;
```

---

## Step 3: Run the Migration

1. Go to Supabase Dashboard → SQL Editor
2. Create a new query
3. Copy the **entire contents** of `ENABLE_MULTI_TENANT_RLS.sql` (with your edits from Step 2)
4. Click **Run** or press `Ctrl+Enter`
5. Wait for all statements to complete (should take 5-10 seconds)

---

## Step 4: Verify the Migration

Run the verification queries at the bottom of the SQL file:

```sql
-- Check that RLS is enabled
SELECT
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('candidates', 'clients', 'matches', 'match_statuses', 'match_notes')
ORDER BY tablename;
```

**Expected Result**: All tables should show `rls_enabled = true`

```sql
-- Check all policies exist
SELECT
  tablename,
  policyname,
  cmd as operation
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd;
```

**Expected Result**: You should see 4 policies (SELECT, INSERT, UPDATE, DELETE) for each of the 5 tables = 20 total policies

---

## Step 5: Update Frontend Code

After the SQL migration is complete, run these commands:

The frontend code needs to be updated to include `user_id` in all database operations. This is **automatically handled** by Claude Code.

Just confirm when the SQL migration is done, and I'll update:
- Candidates page (add/edit operations)
- Clients page (add/edit operations)
- Matches regeneration API
- Bulk upload APIs (candidates and clients)

---

## Step 6: Test with Existing Account

1. Refresh your browser at `http://localhost:3010`
2. Login with your existing account
3. Verify you can still see all your candidates, clients, and matches
4. Try adding a new candidate → should work
5. Try editing a client → should work
6. Try regenerating matches → should work

---

## Step 7: Test with New Account

1. Open an **incognito/private window**
2. Go to `http://localhost:3010`
3. Click "Sign Up" and create a new test account (e.g., `test@example.com`)
4. Login with the new account
5. **Verify complete isolation**:
   - ✅ Candidates list should be **empty**
   - ✅ Clients list should be **empty**
   - ✅ Matches should be **empty**
   - ✅ Should NOT see any data from your original account
6. Add a test candidate and client with the new account
7. Generate matches → should only match the new account's data
8. Switch back to original account → should NOT see the test account's data

---

## Rollback (If Needed)

If something goes wrong, you can disable RLS temporarily:

```sql
ALTER TABLE candidates DISABLE ROW LEVEL SECURITY;
ALTER TABLE clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE matches DISABLE ROW LEVEL SECURITY;
ALTER TABLE match_statuses DISABLE ROW LEVEL SECURITY;
ALTER TABLE match_notes DISABLE ROW LEVEL SECURITY;
```

**Note**: This will allow all users to see all data again (not recommended for production)

---

## Common Issues & Solutions

### Issue: "new row violates row-level security policy"

**Cause**: Frontend is not sending `user_id` in INSERT operations

**Solution**: Make sure Step 5 (frontend updates) is completed

### Issue: "Cannot see my existing data after migration"

**Cause**: UPDATE statements in Step 2 didn't run or used wrong user_id

**Solution**:
1. Check your user_id: `SELECT id FROM auth.users WHERE email = 'your-email@example.com';`
2. Update records manually: `UPDATE candidates SET user_id = 'correct-user-id' WHERE user_id IS NULL;`

### Issue: "Still seeing other users' data"

**Cause**: RLS policies might not be applied correctly

**Solution**: Re-run the policy creation section (Step 6-11 in the SQL file)

---

## What This Migration Does

### Database Changes:
1. ✅ Adds `user_id` column to all 5 tables
2. ✅ Creates foreign key relationship to `auth.users`
3. ✅ Assigns your user_id to all existing records
4. ✅ Makes `user_id` NOT NULL (required field)
5. ✅ Creates performance indexes on user_id columns
6. ✅ Enables RLS on all tables
7. ✅ Creates 20 RLS policies (4 per table for SELECT, INSERT, UPDATE, DELETE)

### Frontend Changes:
1. ✅ Auto-inject `user_id` from authenticated session
2. ✅ Include `user_id` in all INSERT operations
3. ✅ Include `user_id` in bulk uploads
4. ✅ Include `user_id` when generating matches

### Security Guarantees:
- ✅ Users can ONLY see their own data
- ✅ Users can ONLY modify their own data
- ✅ Users CANNOT see or access other users' data
- ✅ Complete data isolation enforced at database level
- ✅ Works with multiple concurrent users
- ✅ Production-ready multi-tenant architecture

---

## Questions?

If you encounter any issues during migration, stop immediately and let me know. I'll help troubleshoot.

---

**Ready to proceed?**

1. Run GET_USER_ID.sql → Get your user_id
2. Edit ENABLE_MULTI_TENANT_RLS.sql → Replace YOUR_USER_ID_HERE
3. Run the full migration
4. Let me know when done → I'll update the frontend code
5. Test both accounts to verify isolation
