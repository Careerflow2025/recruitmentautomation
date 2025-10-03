# 🚀 Quick Start - Get AI Running in 5 Minutes

## What You Need to Do (Only 3 Steps!)

### STEP 1: Get Your Claude API Key ⏱️ 3 minutes

1. Open browser: https://console.anthropic.com/
2. Sign up (free - just need email)
3. Click "Get API Keys" in sidebar
4. Click "Create Key" button
5. **COPY THE KEY** - it looks like: `sk-ant-api03-xxxxxxxxxxxxxx`

---

### STEP 2: Add the Key to Your Project ⏱️ 1 minute

1. Open this file: `dental-matcher\.env.local`
   - If it doesn't exist, create it (same folder as package.json)

2. Add this line (replace with YOUR key):
```
ANTHROPIC_API_KEY=sk-ant-api03-paste-your-real-key-here
```

3. **SAVE** the file

---

### STEP 3: Restart the Server ⏱️ 1 minute

1. In your terminal/command prompt:
   - Press `Ctrl + C` to stop server
   - Wait for it to stop

2. Start it again:
```bash
npm run dev
```

3. Wait for "Ready" message

---

## ✅ Test It Works!

### Test 1: AI Smart Paste

1. Go to: http://localhost:3001/candidates
2. Look for purple button: **"🤖 AI Smart Paste"**
3. Click it
4. Paste this:
```
298697 receptionist CR0 8JD 7723610278 2-3 days a week, 14 per hour
298782 dental nurse HA8 0NN 7947366593 Part time, Mon/Wed/Fri
```
5. Click **"✨ Extract & Add Candidates"**
6. **IT WORKS!** ✅ You'll see 2 candidates added automatically

### Test 2: AI Chat

1. Look for purple **🤖** button in bottom-right corner
2. Click it
3. Type: "How many candidates are there?"
4. Click "Ask"
5. **IT WORKS!** ✅ You'll get an answer

---

## ❌ If Something Goes Wrong

### Error: "ANTHROPIC_API_KEY not configured"
**Problem:** Key not in .env.local file
**Fix:**
1. Check file is named exactly `.env.local` (with the dot at start)
2. Check key is on its own line
3. No spaces around the = sign
4. Restart server

### Smart Paste Button Doesn't Show
**Fix:** Hard refresh browser (Ctrl + Shift + R)

### AI Chat Button Doesn't Show
**Fix:**
1. Check browser console (F12) for errors
2. Hard refresh (Ctrl + Shift + R)

---

## 🎉 That's It!

You're done! Your system now has AI.

**What you can do:**
- ✅ Paste WhatsApp messages → Auto-add candidates
- ✅ Ask questions → Get instant answers
- ✅ Never manually type candidate data again

**Read the full guide:** `AI_SETUP_GUIDE.md`

---

## 💰 It's Basically Free

- First $5 of usage: **FREE**
- After that: ~$0.003 per candidate
- You can add 1,000+ candidates with $5 credit

**Don't worry about cost - it's incredibly cheap!**

---

**ENJOY! 🚀**
