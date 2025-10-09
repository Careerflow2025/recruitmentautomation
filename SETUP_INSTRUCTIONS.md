# 🚀 Excel-like Grid - Setup Instructions

## ⚠️ You're Getting "Failed to fetch" Error?

**Yes, you need to run SQL!** The Excel-like grid needs 3 database tables for custom columns support.

---

## ✅ Quick Fix (2 minutes)

### Step 1: Open Supabase SQL Editor
1. Go to your Supabase dashboard
2. Click **SQL Editor** (left sidebar)
3. Click **New Query**

### Step 2: Run the SQL
1. Open the file: `RUN_THIS_SQL.sql` (in the root of this project)
2. Copy **all the SQL** from that file
3. Paste into Supabase SQL Editor
4. Click **Run** (or press Ctrl+Enter)

### Step 3: Verify Tables Were Created
In Supabase, go to **Table Editor** and verify these 3 new tables exist:
- ✅ `custom_columns`
- ✅ `candidate_custom_data`
- ✅ `client_custom_data`

### Step 4: Refresh Your App
1. Go to `http://localhost:3000/candidates` or `/clients`
2. The "Failed to fetch" error should be **gone**
3. You now have a working Excel-like grid!

---

## 🎯 What This SQL Does

The SQL creates:
- **3 tables**: For storing custom columns and their data
- **Indexes**: For fast queries
- **RLS Policies**: For multi-tenant security (each user sees only their data)
- **Triggers**: For auto-updating timestamps

---

## 🔧 Already Ran the SQL Before?

The SQL uses `IF NOT EXISTS` and `DROP POLICY IF EXISTS`, so it's **safe to run multiple times**.

If you previously ran migrations, this won't break anything.

---

## 📋 Features Now Available

After running the SQL:
- ✅ Click any cell to edit (auto-saves in 300ms)
- ✅ Add/delete rows
- ✅ Drag column headers to reorder
- ✅ Click 🔍 to filter columns
- ✅ Multi-select with checkboxes
- ✅ Bulk delete
- ✅ Real-time sync across tabs/devices
- ✅ Custom columns (add your own columns per user)
- ✅ Column preferences saved in browser (localStorage)

---

## ❓ Still Getting Errors?

Check browser console (F12) for the actual error message and let me know!

---

**Built with Claude Code** 🤖
