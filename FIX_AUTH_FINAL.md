# FINAL AUTHENTICATION FIX - Step by Step

## Current Problem
- Authentication is completely broken
- Manual user creation corrupted the auth schema
- Login fails with "Database error querying schema"

## Root Cause
Supabase auth requires users to be created through the `signUp()` API, NOT via direct SQL inserts. Manual SQL inserts break the auth schema consistency.

## SOLUTION: Use Supabase Dashboard + Proper Signup

### Step 1: Configure Email Settings in Supabase Dashboard

1. **Go to**: https://supabase.com/dashboard
2. **Navigate to**: Your Project → Authentication → Providers → Email
3. **Ensure these settings**:
   - ✅ **Enable Email provider**: ON
   - ❌ **Confirm email**: OFF (DISABLE THIS - critical!)
   - ❌ **Secure email change**: OFF (optional, but recommend OFF for testing)
   - **Minimum password length**: 6

4. **Click SAVE**

### Step 2: Check Site URL Configuration

1. **Still in Dashboard** → Settings → API → Site URL
2. **Set to**: `http://localhost:3007` (or whatever port your dev server is on)
3. **Click SAVE**

### Step 3: Clean Database (Delete Manual Users)

Run this SQL in Supabase SQL Editor:

```sql
-- Delete ALL auth data (including manually created users)
DELETE FROM auth.identities;
DELETE FROM auth.sessions;
DELETE FROM auth.refresh_tokens;
DELETE FROM auth.users;

-- Verify it's clean
SELECT COUNT(*) as user_count FROM auth.users;
-- Should show 0
```

### Step 4: Create User via Signup Page (NOT SQL!)

1. **Open**: http://localhost:3007/signup
2. **Enter**:
   - Email: `admin@admin.com`
   - Password: `admin123`
3. **Click "Sign Up"**
4. **You should see**: "Account created successfully!" message
5. **DO NOT manually confirm email** - it should work immediately if you disabled email confirmation

### Step 5: Test Login

1. **Go to**: http://localhost:3007/login
2. **Enter**:
   - Email: `admin@admin.com`
   - Password: `admin123`
3. **Click "Sign In"**
4. **Expected**: Redirect to home page (/)

### Step 6: Verify Session

After login, open browser console (F12) and run:

```javascript
const { data } = await supabase.auth.getSession();
console.log('Session:', data.session);
console.log('User:', data.session?.user);
```

Should show valid session with user email.

## If Login STILL Fails

### Check 1: Verify Email Confirmation is Disabled

Run this SQL to check:

```sql
SELECT email, email_confirmed_at
FROM auth.users
WHERE email = 'admin@admin.com';
```

- If `email_confirmed_at` is NULL → Email confirmation not disabled properly
- Should show a timestamp immediately after signup

### Check 2: Verify auth.identities Entry Exists

```sql
SELECT u.email, i.provider
FROM auth.users u
LEFT JOIN auth.identities i ON i.user_id = u.id
WHERE u.email = 'admin@admin.com';
```

- Should show: `admin@admin.com | email`
- If provider is NULL → User created improperly

### Check 3: Check Browser Console for Errors

Open DevTools (F12) → Console tab while trying to login. Look for:
- `AuthApiError`
- `Invalid login credentials`
- `Database error querying schema`

## Why Manual SQL User Creation Failed

When you manually INSERT into `auth.users`:
1. ❌ Missing `auth.identities` entry (required for auth)
2. ❌ Password hash format may not match expected bcrypt format
3. ❌ Missing internal metadata Supabase expects
4. ❌ No proper session creation triggers
5. ❌ Breaks auth schema consistency checks

## Testing Multi-Tenant Data Isolation

Once login works:

### Create 3 Test Accounts

1. **Account 1**: admin@admin.com / admin123
2. **Account 2**: user2@test.com / test123
3. **Account 3**: user3@test.com / test123

Create via signup page for each.

### Test Data Isolation

1. **Login as Account 1**
2. **Add 2 candidates**
3. **Add 2 clients**
4. **Logout**
5. **Login as Account 2**
6. **Check candidates page** → Should see 0 candidates
7. **Add 1 candidate**
8. **Logout**
9. **Login as Account 1**
10. **Check candidates page** → Should still see only 2 candidates (not 3)

## Current Dev Server Port

Your app is running on **port 3007** (not 3000, not 3010).

Access at: http://localhost:3007

## Files Already Fixed

✅ `src/lib/supabase/client.ts` - Session persistence enabled
✅ `src/middleware.ts` - Auth checking enabled
✅ `src/components/auth/LogoutButton.tsx` - Using correct client
✅ `src/components/auth/UserEmail.tsx` - Using correct client
✅ `src/lib/auth-helpers.ts` - Using correct client
✅ `src/app/login/page.tsx` - Using getSession()
✅ Database has user_id columns and RLS policies

## Next Steps After Auth Works

1. ✅ Test login/logout flow
2. ✅ Test data isolation between accounts
3. ✅ Test candidate/client CRUD operations
4. ✅ Test matching regeneration with user_id filter
5. ✅ Verify AI smart paste adds data with correct user_id

## Emergency: If Nothing Works

Last resort - wipe EVERYTHING and start fresh:

```sql
-- Nuclear option: Drop and recreate auth schema
DROP SCHEMA auth CASCADE;
-- Then restore via Supabase Dashboard → Database → Migrations → Reset
```

**WARNING**: This will require re-running all migrations. Only use if absolutely necessary.

## Support

If you get stuck at any step, check:
1. Browser console for errors
2. Supabase Dashboard → Logs → Edge Logs
3. Network tab to see failed API requests
