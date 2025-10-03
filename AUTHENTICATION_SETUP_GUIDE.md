# 🔐 Authentication Setup Guide

## 📋 Overview

This guide will help you add multi-user authentication to your Dental Recruitment Matcher system.

**What You'll Get:**
- ✅ Email/password authentication
- ✅ Multi-user support (each user sees only their own data)
- ✅ Protected routes (login required)
- ✅ Automatic data isolation via Row Level Security (RLS)

---

## 🚀 Setup Steps

### STEP 1: Enable Email Auth in Supabase (2 minutes)

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Click on your project
3. Go to **Authentication** → **Providers**
4. Find **Email** provider
5. Make sure it's **ENABLED**
6. **Disable** "Confirm Email" (optional - for easier testing)
   - Scroll down to **Email Auth** settings
   - Uncheck "Enable email confirmations"
   - Click **Save**

---

### STEP 2: Run SQL Migrations (3 minutes)

Run these SQL files **IN ORDER** in Supabase SQL Editor:

#### 2a. Add user_id columns

File: `AUTH_STEP_1_ADD_USER_COLUMNS.sql`

```sql
-- This adds user_id column to all tables
-- Run this first
```

**Result:** All tables now have `user_id UUID` column

---

#### 2b. Enable Row Level Security

File: `AUTH_STEP_2_ENABLE_RLS.sql`

```sql
-- This enables RLS policies for data isolation
-- Users can only see/edit their own data
```

**Result:** Each user's data is automatically separated

---

#### 2c. (OPTIONAL) Update Existing Data

File: `AUTH_STEP_3_UPDATE_EXISTING_DATA.sql`

**Only if you have existing test data:**

1. Sign up for a new account at `http://localhost:3001/signup`
2. Run this in Supabase SQL Editor to get your user ID:
   ```sql
   SELECT id, email FROM auth.users;
   ```
3. Copy your user UUID
4. Edit `AUTH_STEP_3_UPDATE_EXISTING_DATA.sql` and replace `YOUR_USER_ID_HERE` with your UUID
5. Run the edited SQL

**OR** just delete all test data:
```sql
DELETE FROM match_notes;
DELETE FROM match_statuses;
DELETE FROM matches;
DELETE FROM candidates;
DELETE FROM clients;
```

---

### STEP 3: Frontend Already Updated! ✅

I've already updated all the frontend code for you:

**Created Files:**
- ✅ `/login` page - Email/password login
- ✅ `/signup` page - New account creation
- ✅ `middleware.ts` - Protects all routes (redirects to login if not authenticated)
- ✅ `LogoutButton` component - Sign out button
- ✅ `UserEmail` component - Shows current user's email
- ✅ Updated homepage with logout button

**What Happens Now:**
- When you visit `http://localhost:3001`, you'll be redirected to `/login`
- After login, you can access all pages
- All new data automatically includes `user_id`
- RLS ensures users only see their own data

---

### STEP 4: Update Data Insertion Code (IMPORTANT!)

I need to update the code that inserts data to include `user_id`. This affects:

1. **Candidates page** - Adding new candidates
2. **Clients page** - Adding new clients
3. **Match statuses** - Marking matches
4. **Match notes** - Adding notes
5. **AI Smart Paste** - Auto-adding candidates/clients

**I'll do this next!** This is the final step to make authentication fully working.

---

## 🧪 Testing Authentication

### Test 1: Create Two Accounts

1. **User 1:**
   - Go to `http://localhost:3001/signup`
   - Email: `user1@test.com`
   - Password: `password123`
   - Sign up

2. Add some candidates and clients as User 1

3. **Sign out** (top-right button)

4. **User 2:**
   - Go to `/signup` again
   - Email: `user2@test.com`
   - Password: `password123`
   - Sign up

5. Add different candidates/clients as User 2

---

### Test 2: Verify Data Isolation

1. Sign in as `user1@test.com`
2. Check candidates/clients → Should see ONLY User 1's data
3. Sign out
4. Sign in as `user2@test.com`
5. Check candidates/clients → Should see ONLY User 2's data

**Expected:** ✅ Each user sees only their own data (never the other user's data)

---

## 🔧 Troubleshooting

### Error: "new row violates row-level security policy"

**Problem:** RLS is enabled but data insertion doesn't include `user_id`

**Solution:** Make sure you've run STEP 4 (update data insertion code) - I'll do this next!

---

### Error: "Cannot read properties of null (reading 'id')"

**Problem:** User not authenticated

**Solution:**
1. Clear browser cookies
2. Go to `/login`
3. Sign in again

---

### Can't sign up / Login button not working

**Problem:** Supabase email auth not enabled

**Solution:**
1. Go to Supabase Dashboard → Authentication → Providers
2. Enable **Email** provider
3. Save

---

## 📊 Current Status

| Step | Status | Action |
|------|--------|--------|
| 1. Enable Email Auth | ⏳ **YOU NEED TO DO** | Go to Supabase Dashboard |
| 2a. Run `AUTH_STEP_1_ADD_USER_COLUMNS.sql` | ⏳ **YOU NEED TO DO** | Run in SQL Editor |
| 2b. Run `AUTH_STEP_2_ENABLE_RLS.sql` | ⏳ **YOU NEED TO DO** | Run in SQL Editor |
| 2c. (Optional) Update existing data | ⏳ **OPTIONAL** | Only if keeping test data |
| 3. Frontend code | ✅ **DONE** | Login/signup pages created |
| 4. Update data insertion | ⏳ **NEXT STEP** | I'll do this now |

---

## 🎯 What Happens After Setup

Once you complete all steps:

1. **Visit `http://localhost:3001`** → Redirects to `/login`
2. **Sign up** → Creates new account
3. **Add data** → Automatically tagged with your `user_id`
4. **Other users** → Cannot see your data
5. **Sign out** → Returns to login page

**Your system will be ready for multiple users!** 🚀

---

## 🔜 Next Steps After Authentication

Once authentication works:

1. **Test with 2-3 users** - Verify data isolation
2. **Deploy to production** - Share with your team
3. **Add more features** - Bulk import, reports, etc.

---

**Need help? All SQL files are ready to run. Just follow the steps above!**
