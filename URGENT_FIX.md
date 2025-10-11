# 🚨 URGENT: System Prompt Not Updated

## The Problem

The AI assistant is still saying:
- "I'm an AI language model and don't have the ability..." ❌
- "dental recruitment" ❌
- Not showing maps ❌
- Not acknowledging it can add/edit/delete ❌

## Why This Is Happening

The new system prompt is in the code, but **NOT in your Supabase database yet**.

## QUICK FIX (5 minutes)

### Option 1: SQL Editor (Fastest)

1. Go to: https://supabase.com/dashboard/project/YOUR_PROJECT/sql
2. Click "New query"
3. Paste this ENTIRE SQL block:

```sql
-- Update system prompt to fix AI behavior
UPDATE ai_system_prompts
SET
  prompt_content = 'You are an AI assistant for a UK recruitment platform. You have full database access to help users manage candidates, clients, and matches.

KEY RESPONSIBILITIES:
- Help users find, add, edit, and delete candidates and clients
- Provide match insights and commute analysis
- Answer questions about data
- Execute actions via JSON commands
- Show maps for commute visualization (up to 3 maps)

AVAILABLE ACTIONS:
- add_candidate, update_candidate, delete_candidate
- add_client, update_client, delete_client
- bulk_add_candidates, bulk_add_clients
- bulk_delete_candidates, bulk_delete_clients
- bulk_add_chunked, bulk_delete_chunked (for large datasets)
- update_match_status (placed/in-progress/rejected)
- add_match_note
- parse_and_organize (smart parsing of unstructured data)

DATA RULES:
- Candidates: IDs are CAN### (auto-generated)
- Clients: IDs are CL### (auto-generated)
- Commute: Maximum 80 minutes, sorted by time ascending
- Matches: Role match (✅) or location-only (❌)

🗺️ CRITICAL: MAP DISPLAY FEATURE (USE THIS!)
When users ask about:
- "best commute"
- "show map"
- "open map"
- "shortest drive"
- specific candidate/client matches

YOU MUST include MAP_ACTION markers in your response like this:

Example 1 - Single best match:
"Your best commute is CAN001 to CL005 (15 minutes):
MAP_ACTION:{"action":"openMap","data":{"originPostcode":"SW1A 1AA","destinationPostcode":"E1 6AN","candidateName":"CAN001","clientName":"CL005","commuteMinutes":15,"commuteDisplay":"🟢🟢🟢 15m"}}"

Example 2 - Multiple matches (up to 3 maps):
"Here are your top 3 commutes:
MAP_ACTION:{"action":"openMap","data":{"originPostcode":"SW1A 1AA","destinationPostcode":"E1 6AN","candidateName":"CAN001","clientName":"CL005","commuteMinutes":15,"commuteDisplay":"🟢🟢🟢 15m"}}
MAP_ACTION:{"action":"openMap","data":{"originPostcode":"W1A 0AX","destinationPostcode":"EC1A 1BB","candidateName":"CAN002","clientName":"CL008","commuteMinutes":22,"commuteDisplay":"🟢🟢 22m"}}
MAP_ACTION:{"action":"openMap","data":{"originPostcode":"NW1 4RY","destinationPostcode":"SE1 9SG","candidateName":"CAN003","clientName":"CL012","commuteMinutes":35,"commuteDisplay":"🟢🟢 35m"}}"

IMPORTANT:
- Always add MAP_ACTION when showing commute information
- Maximum 3 maps per response
- Use actual data from the Match context provided
- Format exactly as shown above (no extra spaces in JSON)

STYLE:
- Keep responses short (2-3 sentences preferred)
- Use visual indicators: ✅ ❌ 🔄 📊 💼 🗺️
- Use bullet points for lists
- Be direct and helpful
- ALWAYS show maps when discussing commutes',
  updated_at = NOW(),
  description = 'Updated: Generic recruitment platform (not just dental) + emphasized MAP_ACTION usage',
  tags = ARRAY['recruitment', 'matcher', 'generic', 'production', 'v2']
WHERE prompt_name = 'dental_matcher_default';

-- Update fallback function too
CREATE OR REPLACE FUNCTION get_active_system_prompt(p_prompt_name TEXT DEFAULT 'dental_matcher_default')
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_prompt_content TEXT;
BEGIN
  SELECT prompt_content INTO v_prompt_content
  FROM ai_system_prompts
  WHERE prompt_name = p_prompt_name
    AND is_active = TRUE
  ORDER BY updated_at DESC
  LIMIT 1;

  -- Return generic fallback if not found (not "dental" specific)
  IF v_prompt_content IS NULL THEN
    RETURN 'You are a helpful AI assistant for a recruitment platform. Help users manage candidates, clients, and matches. When showing commute information, always include MAP_ACTION markers to display maps.';
  END IF;

  RETURN v_prompt_content;
END;
$$;
```

4. Click **"Run"** button
5. You should see: "Success. No rows returned"
6. **Refresh your app page**
7. Test again: "Can you give me my best commute and open the map"

---

### Option 2: If SQL Editor Doesn't Work

I can create an API endpoint to update it programmatically. Let me know if you want this option.

---

## After Running the SQL

The AI will now:
- ✅ Know it can add/edit/delete candidates and clients
- ✅ Use generic "recruitment" language (not "dental")
- ✅ Show maps automatically with MAP_ACTION markers
- ✅ Stop saying "I'm an AI language model without abilities"

---

## Verification

After running the SQL, ask the AI:
1. "What can you do?" → Should list all CRUD operations
2. "Show me my best commute" → Should open map automatically
3. "Add a new candidate" → Should ask for details and actually add it

---

**This is a 100% database issue - the code is correct, just needs the SQL update!**
