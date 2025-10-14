# 🔥 URGENT: Fix Multi-Tenant ID Generation Error

## Problem You're Experiencing

```
❌ Database error: duplicate key value violates unique constraint "candidates_pkey"
```

- User3 works perfectly ✅
- New accounts can't add candidates ❌
- Error happens when clicking "Add Candidate" button

## Root Cause

**Race condition** in the ID generation trigger. When new users sign up, the system tries to calculate their user prefix number (U1, U2, U3...) but can assign the same number to multiple users, causing duplicate IDs.

## Solution

Run the SQL fix script that creates a dedicated table to track user prefixes safely.

---

## 📋 Step-by-Step Instructions

### Step 1: Open Supabase SQL Editor

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project: **recruitment automation**
3. Click **SQL Editor** in the left sidebar

### Step 2: Run the Fix Script

1. Click **"New query"** button
2. Copy the **ENTIRE** contents of `FIX_MULTITENANT_ID_GENERATION.sql`
3. Paste into the SQL editor
4. Click **"Run"** (or press Ctrl+Enter)

### Step 3: Verify the Fix

After running the script, you should see output showing:
- ✅ User Prefixes table created
- ✅ Existing users migrated
- ✅ New triggers installed

Try these tests:

1. **Test with your new account:**
   - Go to Candidates grid
   - Click "Add Candidate"
   - Should work without error! ✅

2. **Test with User3:**
   - Login as User3
   - Add a candidate
   - Should still work (existing data preserved) ✅

---

## What This Fix Does

### Before (Broken):
```
New User signs up → Trigger calculates prefix from existing IDs → Race condition!
→ Multiple users might get "U4" → Duplicate key error ❌
```

### After (Fixed):
```
New User signs up → Check user_prefixes table → Safely assign next number with lock
→ User gets unique prefix (U4, U5, U6...) → No conflicts! ✅
```

## Technical Details

1. **user_prefixes table**: Permanently stores each user's assigned prefix number
2. **Advisory locks**: PostgreSQL locks prevent concurrent conflicts
3. **get_or_create_user_prefix()**: Thread-safe function to assign prefixes
4. **Updated triggers**: Both candidate and client triggers now use safe approach

---

## Verification Queries

After applying the fix, run these to check everything:

```sql
-- Check user prefixes are assigned
SELECT * FROM user_prefixes ORDER BY user_number;

-- Check User3's candidates still work
SELECT id, user_id, first_name, last_name FROM candidates
WHERE user_id = (SELECT user_id FROM user_prefixes WHERE user_number = 3)
ORDER BY id;

-- Check your new user can create candidates
-- (Try adding via UI first, then check here)
SELECT id, user_id, first_name, last_name FROM candidates
WHERE user_id = auth.uid()
ORDER BY id;
```

---

## FAQ

**Q: Will this break existing data?**
A: No! The script preserves all existing IDs and just adds a safety layer for new users.

**Q: Do I need to run this multiple times?**
A: No, run it once. It's safe to run multiple times (uses IF NOT EXISTS and ON CONFLICT).

**Q: What if I already have duplicate IDs?**
A: The script won't fix existing duplicates. If you have any, contact support to clean them first.

**Q: Will User3's data still work?**
A: Yes! User3's data is preserved exactly as-is. This only affects NEW user signups.

---

## Support

If you encounter any issues:
1. Check the SQL editor for error messages
2. Screenshot the error
3. Check if `user_prefixes` table was created: `SELECT * FROM user_prefixes;`
4. Share the error details with support

---

## Success Indicators ✅

After applying this fix, you should be able to:
- ✅ Create new user accounts
- ✅ Add candidates from new accounts without errors
- ✅ User3 continues working normally
- ✅ All users have unique ID prefixes in `user_prefixes` table

---

**File to run:** `FIX_MULTITENANT_ID_GENERATION.sql`

**Estimated time:** 2-3 seconds

**Risk level:** Very Low (preserves all existing data)
