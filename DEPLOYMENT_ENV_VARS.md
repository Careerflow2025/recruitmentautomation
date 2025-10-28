# Deployment Environment Variables

## IMPORTANT: Add these to your deployment platform (Vercel/Netlify)

### Required Environment Variables

```
VPS_AI_URL=https://vllm.matchrecruiterai.com
VPS_AI_SECRET=caeeb6c8e5a03b0217080f71003ec898f280284ad7629e3d8aee3039312a2385
```

### For Vercel:
1. Go to your project dashboard
2. Settings → Environment Variables
3. Add both variables above
4. Redeploy

### For Netlify:
1. Go to Site settings
2. Environment variables
3. Add both variables above
4. Trigger redeploy

### Security Note:
- These variables contain sensitive data
- Never commit them to GitHub
- Only add them through your deployment platform's secure environment variable settings

### What these are:
- `VPS_AI_URL`: Your self-hosted Mistral 7B model server
- `VPS_AI_SECRET`: Authentication token for the vLLM API

Last updated: 2025-10-28