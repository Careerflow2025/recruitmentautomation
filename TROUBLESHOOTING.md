# 🔍 Troubleshooting Guide - vLLM Error

## Current Issue
Getting error: "RunPod vLLM server returned an error" even after all fixes applied.

---

## Step 1: Verify RunPod Server is Running

Run these commands **on your RunPod instance** via SSH:

```bash
# Check if vLLM is running
ps aux | grep vllm

# Check if Cloudflare Tunnel is running
ps aux | grep cloudflared

# Test vLLM locally
curl http://127.0.0.1:8000/health

# Test vLLM completion locally
curl http://127.0.0.1:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "/workspace/models/mistral-7b-instruct",
    "messages": [{"role": "user", "content": "Say hello"}],
    "max_tokens": 50
  }'
```

**Expected results:**
- vLLM process should be running (python3 -m vllm.entrypoints.openai.api_server)
- Cloudflare process should be running (cloudflared tunnel run)
- Health check should return: `{"status":"ok"}`
- Completion should return a response with choices

**If services are NOT running:**
```bash
/workspace/start-all-services.sh
```

---

## Step 2: Test Public Endpoint

Run this from **any computer** (including your local machine):

```bash
# Test health
curl https://vllm.matchrecruiterai.com/health

# Test completion with auth
curl https://vllm.matchrecruiterai.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer caeeb6c8e5a03b0217080f71003ec898f280284ad7629e3d8aee3039312a2385" \
  -d '{
    "model": "/workspace/models/mistral-7b-instruct",
    "messages": [{"role": "user", "content": "Say hello"}],
    "max_tokens": 50
  }'
```

**Expected result:**
Should return JSON with `choices[0].message.content`

**If this FAILS:**
- Cloudflare Tunnel is disconnected
- Domain DNS not pointing correctly
- RunPod firewall blocking traffic

---

## Step 3: Verify Netlify Environment Variables

Go to: **Netlify Dashboard → Your Site → Site configuration → Environment variables**

**Check these EXACT values:**

| Variable | Value |
|----------|-------|
| `VPS_AI_URL` | `https://vllm.matchrecruiterai.com` |
| `VPS_AI_SECRET` | `caeeb6c8e5a03b0217080f71003ec898f280284ad7629e3d8aee3039312a2385` |

**IMPORTANT:**
- No trailing slash on URL
- No quotes around values
- Exact spelling (case-sensitive)

**After updating env vars:**
1. Save changes
2. Trigger manual redeploy: **Deploys → Trigger deploy → Deploy site**
3. Wait 2-3 minutes for build to complete

---

## Step 4: Check Netlify Build Logs

Go to: **Netlify Dashboard → Deploys → [Latest Deploy] → Deploy log**

**Look for:**
- Build success (green checkmark)
- No errors during build
- Environment variables loaded correctly

**Common issues:**
- Build failed = code error, check logs
- Env vars not loaded = wrong configuration section
- Old build deployed = clear cache and redeploy

---

## Step 5: Test the AI Chat in Browser

1. Open your deployed site
2. Open browser DevTools (F12)
3. Go to **Console** tab
4. Try asking AI a question in the chat

**Look for error messages in console:**

```javascript
// If you see this error:
❌ Error: AI Configuration Error
→ Fix: Environment variables not set in Netlify

// If you see this error:
❌ Error: Connection Error
→ Fix: RunPod server or Cloudflare Tunnel down

// If you see this error:
❌ Error: GPU Server Error (500)
→ Fix: vLLM server crashed, restart services

// If you see this error:
❌ Error: Request Timeout
→ Fix: Prompt too large or server overloaded
```

**Check Network tab:**
1. Go to **Network** tab
2. Filter: **Fetch/XHR**
3. Find request to `/api/ai/ask`
4. Click on it
5. Check **Response** tab

**The response should now include `debugInfo` object:**
```json
{
  "error": "GPU Server Error",
  "details": "vLLM API error (500): ...",
  "debugInfo": {
    "errorType": "Error",
    "errorMessage": "vLLM API error (500): actual error here",
    "stack": "..."
  }
}
```

---

## Step 6: Check Prompt Size

**Problem:** If prompt is too large, vLLM will reject it.

**In browser console, you should see:**
```
📊 Prompt size: 12345 chars, ~3086 tokens
```

**Mistral 7B context window:** 4096 tokens max

**If prompt > 3500 tokens:**
- Response might be truncated
- vLLM might timeout
- Request might fail

**Current limits** (in code):
- 100 candidates max
- 100 clients max
- 150 matches max

**If you have MORE data than this:**
The error might be context overflow. We need to reduce limits further.

---

## Step 7: Restart Everything

**If all else fails:**

### On RunPod (SSH):
```bash
# Kill all services
pkill -f vllm
pkill cloudflared

# Restart everything
/workspace/start-all-services.sh

# Wait 30 seconds for services to start
sleep 30

# Verify
ps aux | grep vllm
ps aux | grep cloudflared
curl http://127.0.0.1:8000/health
```

### On Netlify:
1. Go to **Deploys**
2. Click **Trigger deploy → Clear cache and deploy site**
3. Wait for build to complete (2-3 minutes)

### Test again:
```bash
curl https://vllm.matchrecruiterai.com/health
```

---

## Common Error Messages & Fixes

| Error Message | Cause | Fix |
|---------------|-------|-----|
| "AI Configuration Error" | Env vars not set | Add VPS_AI_URL and VPS_AI_SECRET to Netlify |
| "Connection Error: fetch failed" | Can't reach server | Check RunPod running, Cloudflare Tunnel up |
| "GPU Server Error (500)" | vLLM crashed | Restart vLLM service |
| "GPU Server Error (503)" | vLLM not responding | Check vLLM process, restart if needed |
| "Request Timeout" | Prompt too large | Reduce data limits in code |
| "Conversation roles must alternate" | Wrong chat format | Already fixed (combined prompts) |

---

## Expected Server Logs

**On RunPod, when a request comes in:**

```bash
# In vLLM logs (if running in foreground):
INFO:     127.0.0.1:xxxxx - "POST /v1/chat/completions HTTP/1.1" 200 OK

# In Cloudflare logs:
INF Request succeeded ... status=200
```

**On Netlify Function logs** (if you enable live logs):

```
📤 Calling RunPod vLLM at https://vllm.matchrecruiterai.com
📊 Prompt size: 8542 chars, ~2135 tokens
✅ Received response from RunPod vLLM (543 chars)
```

---

## Test with Minimal Prompt

Create a test endpoint to verify vLLM is working:

**File: `dental-matcher/src/app/api/ai/test/route.ts`**
```typescript
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const response = await fetch(`${process.env.VPS_AI_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.VPS_AI_SECRET}`
      },
      body: JSON.stringify({
        model: '/workspace/models/mistral-7b-instruct',
        messages: [
          { role: 'user', content: 'Say hello in 5 words' }
        ],
        max_tokens: 50,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({
        error: `vLLM returned ${response.status}`,
        details: errorText
      }, { status: 500 });
    }

    const data = await response.json();
    return NextResponse.json({
      success: true,
      response: data.choices?.[0]?.message?.content,
      fullResponse: data
    });

  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}
```

**Test it:**
```bash
# After deploying, visit:
https://your-netlify-site.netlify.app/api/ai/test

# Should return:
{
  "success": true,
  "response": "Hello, how are you today?"
}
```

**If this works but main AI endpoint fails:**
The issue is with the large prompt size or data structure.

---

## Next Steps

1. **Run all tests above in order**
2. **Share the results** of each test (copy/paste the output)
3. **Check browser DevTools** for the `debugInfo` object in the error response
4. **Share the actual error message** from `debugInfo.errorMessage`

Once we see the ACTUAL error message, we can fix the root cause instead of guessing.
