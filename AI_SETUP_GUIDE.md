# 🤖 AI Features Setup Guide

## What You Get

Your dental recruitment matcher now has **2 powerful AI features**:

### 1. 🤖 AI Smart Paste (Candidates & Clients Pages)
- Paste WhatsApp messages, emails, or any messy text
- AI automatically extracts candidate/client data
- Adds them to your database instantly
- No more manual data entry!

### 2. 💬 AI Chat Assistant (Available on All Pages)
- Floating purple robot button in bottom-right corner
- Ask questions about your data in plain English
- Examples:
  - "How many dental nurses in London?"
  - "Show candidates within 20 minutes of SW1A 1AA"
  - "Which clients need a receptionist?"
  - "How many candidates added this week?"

---

## 🚀 Setup Instructions

### Step 1: Get Your Claude API Key

1. Go to: https://console.anthropic.com/
2. Sign up / Log in
3. Click "Get API Keys" or go to Settings → API Keys
4. Click "Create Key"
5. Copy your API key (starts with `sk-ant-...`)

### Step 2: Add API Key to Your Project

1. Open your project folder: `dental-matcher`
2. Find the file `.env.local` (if it doesn't exist, create it)
3. Add this line:

```
ANTHROPIC_API_KEY=sk-ant-api03-your-actual-key-here
```

**Important:** Replace `sk-ant-api03-your-actual-key-here` with your real API key!

### Step 3: Restart the Development Server

1. Stop the current server (Ctrl+C in terminal)
2. Start it again:
```bash
cd dental-matcher
npm run dev
```

### Step 4: Test It!

#### Test Smart Paste:
1. Go to Candidates page
2. Click "🤖 AI Smart Paste" button
3. Paste this example:

```
298697 receptionist CR0 8JD 7723610278 2-3 days a week, 14 per hour
298782 dental nurse HA8 0NN 7947366593 Part time, Mon/Wed/Fri, 14 per hour
```

4. Click "✨ Extract & Add Candidates"
5. Watch AI extract and add them automatically!

#### Test AI Chat:
1. Click the purple 🤖 button in bottom-right
2. Ask: "How many dental nurses are available?"
3. Get instant answers about your data!

---

## 💰 Pricing

**Claude API Costs:**
- **VERY CHEAP** for your use case
- ~$0.003 per candidate extraction
- ~$0.01 per question
- **Estimated cost:** $5-10/month for normal usage

**Free Tier:**
- $5 free credits when you sign up
- Enough for 500-1000 operations

---

## 🎯 What Works Now

### ✅ AI Smart Paste Can Extract:
- Candidate ID
- Name (first & last)
- Role (automatically normalized: "dn" → "Dental Nurse")
- Postcode (UK format)
- Phone (auto-adds leading 0 if missing)
- Salary (auto-adds £ symbol)
- Working days
- Experience
- Notes (everything else goes here)

### ✅ AI Chat Can Answer:
- Count queries ("How many X?")
- Filter queries ("Show candidates in London")
- Location queries ("Candidates within 30 min of...")
- Date queries ("Added this week")
- Role queries ("All dental nurses")
- Match queries ("Best matches for client X")

---

## 🔧 Troubleshooting

### Error: "ANTHROPIC_API_KEY not configured"
**Solution:** You forgot to add the API key to `.env.local`

1. Create/edit `.env.local` file
2. Add: `ANTHROPIC_API_KEY=your-key-here`
3. Restart server

### Error: "Failed to parse candidates"
**Solutions:**
- Make sure text has candidate info (ID, role, postcode, etc.)
- Try simpler format first
- Check API key is valid

### AI Chat not responding
**Solutions:**
- Check console for errors (F12 → Console tab)
- Verify API key is correct
- Check internet connection
- Make sure Supabase data is loaded

### Smart Paste adds incomplete data
**Solutions:**
- AI does its best but may miss fields in messy text
- You can edit the candidate after adding
- Or use the "Add New" form for precise control

---

## 📝 Usage Tips

### For Best Results with Smart Paste:
1. Include at least: ID, role, postcode
2. Phone numbers work better with 11 digits
3. Roles can be abbreviated (dn, dt, recep, etc.)
4. Separate multiple candidates with line breaks
5. Works with WhatsApp copy-paste format!

### For Best Results with AI Chat:
1. Be specific: "dental nurses in London" not just "nurses"
2. Use postcodes for location: "SW1A 1AA" not "Westminster"
3. Ask one question at a time
4. If answer is wrong, rephrase question

---

## 🎉 You're Done!

Your recruitment system is now AI-powered!

**Next Steps:**
1. Add your Claude API key to `.env.local`
2. Restart server
3. Try the Smart Paste feature
4. Ask the AI Chat some questions
5. Enjoy never typing candidate data again! 🎊

---

## 📞 Need Help?

If something doesn't work:
1. Check this guide again
2. Look for error messages in browser console (F12)
3. Verify API key is correct
4. Make sure server restarted after adding key

---

**Have fun with your new AI assistant! 🤖✨**
