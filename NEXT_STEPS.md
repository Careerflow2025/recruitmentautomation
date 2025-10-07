# 🚀 Next Steps - Diagnose vLLM Error

## What I Just Did

✅ Added detailed error debugging to show ACTUAL error messages (commit b1faf64)
✅ Created comprehensive troubleshooting guide (TROUBLESHOOTING.md)
✅ Created diagnostic test endpoint (/api/ai/test)
✅ Pushed everything to GitHub (commit 3678803)

## ⚡ IMMEDIATE ACTION REQUIRED

Netlify should be deploying now (takes 2-3 minutes). Once deployed:

### 1. Test the Diagnostic Endpoint (FASTEST WAY TO DIAGNOSE)

Visit this URL in your browser:
```
https://YOUR-NETLIFY-SITE.netlify.app/api/ai/test
```

**What you'll see:**

**If it works:**
```json
{
  "success": true,
  "message": "RunPod vLLM connection working!",
  "aiResponse": "Hello, how are you today?",
  "responseTime": "1234ms"
}
```
→ This means RunPod is working, the issue is with the main AI endpoint (likely prompt size)

**If it fails:**
```json
{
  "success": false,
  "error": "Connection Error",
  "details": "fetch failed",
  "errorType": "TypeError"
}
```
→ This means Netlify can't reach RunPod (check env vars or RunPod server)

### 2. Check Environment Variables in Netlify

Go to: **Netlify Dashboard → Site Settings → Environment Variables**

**Verify EXACT values:**
```
VPS_AI_URL = https://vllm.matchrecruiterai.com
VPS_AI_SECRET = caeeb6c8e5a03b0217080f71003ec898f280284ad7629e3d8aee3039312a2385
```

**IMPORTANT:**
- No trailing slash on URL
- No quotes
- Exact spelling

**If you changed env vars:**
- Go to **Deploys** → **Trigger deploy** → **Deploy site**
- Wait 2-3 minutes for build

### 3. Test AI Chat Again

After testing /api/ai/test, try the AI chat in your app.

**Open browser DevTools (F12) → Console tab**

Look for error messages with new `debugInfo` object:

```json
{
  "error": "GPU Server Error",
  "details": "vLLM API error (500): ...",
  "debugInfo": {
    "errorType": "Error",
    "errorMessage": "vLLM API error (500): ACTUAL ERROR HERE",
    "stack": "..."
  }
}
```

**COPY AND PASTE the entire error message** - this will tell us the exact problem.

---

## 📋 Troubleshooting Checklist

### ✅ On RunPod (SSH to your instance)

```bash
# Check if services are running
ps aux | grep vllm
ps aux | grep cloudflared

# If NOT running, restart:
/workspace/start-all-services.sh

# Test locally
curl http://127.0.0.1:8000/health
```

### ✅ Test Public Endpoint

From your local machine:

```bash
# Test health
curl https://vllm.matchrecruiterai.com/health

# Test completion
curl https://vllm.matchrecruiterai.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer caeeb6c8e5a03b0217080f71003ec898f280284ad7629e3d8aee3039312a2385" \
  -d '{
    "model": "/workspace/models/mistral-7b-instruct",
    "messages": [{"role": "user", "content": "Say hello"}],
    "max_tokens": 50
  }'
```

**Expected:** Should return JSON with a response

### ✅ Check Netlify Deployment

Go to: **Netlify Dashboard → Deploys**

1. Latest deploy should be commit `3678803`
2. Status should be "Published"
3. No errors in build log

---

## 🔍 Common Issues & Quick Fixes

| Issue | Fix |
|-------|-----|
| "Configuration Error" | Add/update env vars in Netlify, redeploy |
| "Connection Error: fetch failed" | RunPod server down, restart services |
| "GPU Server Error (500)" | vLLM crashed, restart vLLM |
| "Request Timeout" | Prompt too large, need to reduce limits further |
| Test endpoint works but AI chat fails | Prompt size issue, reduce data limits |

---

## 📊 What To Share With Me

**After running tests above, share:**

1. **Test endpoint result** (`/api/ai/test`)
   - Success or failure?
   - Full JSON response

2. **Browser DevTools error** (from AI chat attempt)
   - `debugInfo` object
   - Full error message

3. **RunPod status**
   - Are services running? (ps aux | grep vllm)
   - Health check result (curl health)

4. **Netlify deployment status**
   - Latest commit deployed
   - Any build errors?

---

## 📖 Full Documentation

- **TROUBLESHOOTING.md** - Complete troubleshooting guide with all scenarios
- **RUNPOD_SETUP.md** - Original setup documentation
- **Test endpoint** - `/api/ai/test` for quick diagnostics

---

## 🎯 Most Likely Issues (Based on Symptoms)

Given that:
- You've waited 5+ minutes
- Error persists after all fixes
- User message is generic "RunPod vLLM server returned an error"

**Most likely causes:**

1. **Environment variables not updated in Netlify**
   - VPS_AI_URL still pointing to old IP instead of Cloudflare URL
   - VPS_AI_SECRET missing or incorrect

2. **RunPod services stopped**
   - vLLM crashed
   - Cloudflare Tunnel disconnected
   - Need to run `/workspace/start-all-services.sh`

3. **Prompt size still too large**
   - Even with 100/100/150 limits, context might overflow
   - Need to reduce further to 50/50/100

4. **Cloudflare Tunnel configuration issue**
   - Domain not resolving correctly
   - Tunnel disconnected
   - Need to restart tunnel

**Test endpoint will tell us which one it is!**

---

## ⏱️ Timeline

1. **Now**: Netlify deploying commit 3678803 (2-3 minutes)
2. **Next**: Test `/api/ai/test` endpoint
3. **Then**: Share results with me
4. **Finally**: Fix the specific issue identified

---

**The test endpoint is the fastest way to diagnose the problem - run it first!**
