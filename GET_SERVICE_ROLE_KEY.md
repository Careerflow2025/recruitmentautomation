# 🚨 URGENT: SERVICE ROLE KEY IS INVALID

## THE PROBLEM

The service role key in your `.env.local` file is **INVALID** or **EXPIRED**.

Supabase error: `Invalid API key`

## HOW TO FIX (DO THIS NOW)

### Step 1: Get the Correct Service Role Key

1. **Go to Supabase Dashboard:**
   https://supabase.com/dashboard/project/lfoapqybmhxctqdqxxoa/settings/api

2. **Scroll down to "Project API keys"**

3. **Find the key labeled:** `service_role` `secret`

4. **Click "Copy"** (it's a very long key starting with `eyJ`)

### Step 2: Update .env.local

Open: `C:\recruitmentautomation\dental-matcher\.env.local`

Find this line:
```
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxmb2FwcXlibWh4Y3RxZHF4eG9hIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTI4NDUwMiwiZXhwIjoyMDc0ODYwNTAyfQ.ZUjowbmJqIkc0peFhtO73F7CYQnnaxdsHfbrGP4IN0o
```

Replace the entire value with the NEW key you just copied from Supabase dashboard.

### Step 3: Restart Server

After updating .env.local:

1. **Stop the current server** (Ctrl+C in the terminal running npm run dev)
2. **Start it again:** `npm run dev`
3. **Go to the new port shown** (will be 3010 or similar)
4. **Test Generate Matches**

## WHY THIS IS HAPPENING

The service role key in your .env.local is either:
1. **Expired** - Keys can expire
2. **Wrong** - Copied incorrectly
3. **From a different project** - Doesn't match your current Supabase project

## VERIFICATION

After you update the key and restart:

1. Go to http://localhost:XXXX/matches (use the port shown when server starts)
2. Click "Generate Matches"
3. Check terminal - should see:
   ```
   🔍 Service Client Debug:
     URL: https://lfoapqybmhxctqdqxxoa.s...
     Service Key: eyJhbGciOiJIUzI1NiIs...  ← Should be DIFFERENT now
   ✅ Using Supabase service role client (bypasses RLS)
   📊 Found X candidates and Y clients
   ✅ Match regeneration complete!
   ```

4. **NO MORE "Invalid API key" error**

## EXACT STEPS (COPY & PASTE)

1. Open browser: https://supabase.com/dashboard/project/lfoapqybmhxctqdqxxoa/settings/api
2. Copy the `service_role` key (the secret one, NOT the anon key)
3. Open file: `C:\recruitmentautomation\dental-matcher\.env.local`
4. Replace line: `SUPABASE_SERVICE_ROLE_KEY=OLD_KEY_HERE`
5. With: `SUPABASE_SERVICE_ROLE_KEY=NEW_KEY_YOU_JUST_COPIED`
6. Save file
7. Restart server: Stop current one (Ctrl+C), then `npm run dev`
8. Test matches

---

**CURRENT STATUS:** Server is running on PORT 3009 but using INVALID service role key

**NEXT ACTION:** Update .env.local with correct service role key from Supabase dashboard
